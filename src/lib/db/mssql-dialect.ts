import {
  MssqlDialect,
  MssqlDriver,
  type DatabaseConnection,
  type Driver,
  type TransactionSettings,
} from "kysely";
import type * as TediousNs from "tedious";
import type * as TarnNs from "tarn";
import type { MssqlAuth, MssqlDbConfig } from "@/lib/config";

// Kysely-dialect voor SQL Server die tedious (de driver) en tarn (de pool) pas
// laadt bij de eerste query (Driver.init). Een statische import zou elke koude
// start van de Postgres-installaties ± 0,45 s en 400 modules kosten.
//
// Geen "server-only" hier: de scripts in scripts/ gebruiken dit bestand ook.

export type MssqlOpties = {
  /** Tijd om een verbinding op te zetten (TCP, TLS en aanmelden). */
  verbindingsTimeoutMs?: number;
  /** Hoe lang een ongebruikte verbinding in de pool blijft. */
  idleTimeoutMs?: number;
  /** Maximale duur van één query (tedious-standaard is 15 s). */
  requestTimeoutMs?: number;
};

type TediousModule = typeof TediousNs;
type TarnModule = typeof TarnNs;

// Subklasse, zodat `instanceof MssqlDialect` blijft kloppen (Better Auth en de
// kysely-adapter herkennen het dialect zo).
class LuieMssqlDialect extends MssqlDialect {
  readonly #maak: () => Driver;

  constructor(maak: () => Driver) {
    super(undefined as never);
    this.#maak = maak;
  }

  override createDriver(): Driver {
    return this.#maak();
  }
}

function naarTediousAuth(auth: MssqlAuth): TediousNs.ConnectionConfiguration["authentication"] {
  switch (auth.type) {
    case "sql":
      return { type: "default", options: { userName: auth.user, password: auth.password } };
    case "ntlm":
      return { type: "ntlm", options: { domain: auth.domain, userName: auth.user, password: auth.password } };
    case "azure-default":
      return { type: "azure-active-directory-default", options: { clientId: auth.clientId } };
  }
}

/** Een CommonJS-module via import(): soms staat alles onder `default`. */
function uitModule<T>(m: unknown): T {
  return ((m as { default?: T }).default ?? m) as T;
}

export function maakMssqlDialect(config: MssqlDbConfig, opties: MssqlOpties = {}): MssqlDialect {
  return new LuieMssqlDialect(() => {
    let echt: MssqlDriver | undefined;
    const d = () => {
      if (!echt) throw new Error("SQL Server-driver is nog niet gestart");
      return echt;
    };

    const driver: Driver = {
      async init() {
        const [t, n] = await Promise.all([import("tedious"), import("tarn")]);
        const Tedious = uitModule<TediousModule>(t);
        const Tarn = uitModule<TarnModule>(n);
        const connectTimeout = opties.verbindingsTimeoutMs ?? 15_000;

        echt = new MssqlDriver({
          tarn: {
            ...Tarn,
            options: {
              min: 0,
              max: config.poolMax,
              idleTimeoutMillis: opties.idleTimeoutMs ?? 5_000,
              acquireTimeoutMillis: connectTimeout + 5_000,
              createTimeoutMillis: connectTimeout + 5_000,
              // Zonder dit probeert tarn stil opnieuw tot de acquire-timeout en
              // geeft dan een fout zonder code in plaats van de echte fout.
              propagateCreateError: true,
            },
          },
          tedious: {
            ...Tedious,
            // Kysely stuurt een Date als TYPES.DateTime (oud datetime, 1/300 s);
            // datetime2 bewaart de milliseconden exact.
            TYPES: { ...Tedious.TYPES, DateTime: Tedious.TYPES.DateTime2 },
            connectionFactory: () => {
              const c = new Tedious.Connection({
                server: config.server,
                authentication: naarTediousAuth(config.auth),
                options: {
                  database: config.database,
                  ...(config.instanceName ? { instanceName: config.instanceName } : { port: config.port ?? 1433 }),
                  encrypt: config.encrypt,
                  trustServerCertificate: config.trustServerCertificate,
                  ...(config.tlsServerName ? { serverName: config.tlsServerName } : {}),
                  ...(config.ca ? { cryptoCredentialsDetails: { ca: config.ca } } : {}),
                  connectTimeout,
                  requestTimeout: opties.requestTimeoutMs ?? 60_000,
                  appName: "kbbuild",
                  // Nooit false: Better Auth schrijft tijdstippen als ISO-strings met Z.
                  useUTC: true,
                  // XACT_ABORT OFF: anders rolt de server zelf terug en maskeert
                  // Kysely's ROLLBACK (fout 3903) de echte fout.
                  abortTransactionOnError: false,
                  // Bewust NIET gezet (de standaard is nodig): enableArithAbort,
                  // enableQuotedIdentifier (Kysely quote met "), useColumnNames,
                  // rowCollectionOn*, lowerCaseGuids.
                },
              });
              // Rolde de server de transactie zelf al terug (deadlock 1205, of
              // XACT_ABORT in de SQL), dan Kysely's ROLLBACK overslaan: anders
              // vervangt fout 3903 de echte fout. tedious houdt inTransaction bij
              // uit de ENVCHANGE-tokens van de server.
              const rollback = c.rollbackTransaction.bind(c);
              c.rollbackTransaction = (cb, naam) => {
                if (c.inTransaction) rollback(cb, naam);
                else process.nextTick(cb, undefined);
              };
              return c;
            },
          },
          // Een SELECT 1 bij elke acquire: een herstart van SQL Server kost dan
          // hooguit één mislukte poging in plaats van een dode pool.
          validateConnections: true,
          resetConnectionsOnRelease: false,
        });
        await echt.init();
      },
      acquireConnection: () => d().acquireConnection(),
      beginTransaction: (c: DatabaseConnection, s: TransactionSettings) => d().beginTransaction(c as never, s),
      commitTransaction: (c: DatabaseConnection) => d().commitTransaction(c as never),
      rollbackTransaction: (c: DatabaseConnection) => d().rollbackTransaction(c as never),
      savepoint: (c: DatabaseConnection, naam: string) => d().savepoint(c as never, naam),
      rollbackToSavepoint: (c: DatabaseConnection, naam: string) => d().rollbackToSavepoint(c as never, naam),
      releaseConnection: (c: DatabaseConnection) => d().releaseConnection(c as never),
      async destroy() {
        await echt?.destroy();
      },
    };
    return driver;
  });
}
