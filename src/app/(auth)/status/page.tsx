import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { controleerGezondheid, type Controle } from "@/lib/gezondheid";
import { APP_NAME } from "@/lib/constants";

// Systeemstatus van deze installatie. Zonder login bereikbaar, zodat ze ook
// werkt als het inloggen zelf niet lukt. Toont geen waarden of geheimen.

const NAMEN: Record<string, string> = {
  postgres: "PostgreSQL",
  mssql: "SQL Server",
  supabase: "Supabase",
  local: "Eigen login",
  database: "In de database",
  filesystem: "Map op de server",
  open: "Open",
  uitnodiging: "Alleen met uitnodiging",
  "full-text": "Full-text",
  eenvoudig: "Eenvoudig",
};

function Regel({
  titel,
  controle,
  uitleg = "Niet gecontroleerd",
}: {
  titel: string;
  controle: Controle | null | "overgeslagen";
  uitleg?: string;
}) {
  const overgeslagen = controle === "overgeslagen" || controle === null;
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      {overgeslagen ? (
        <MinusCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      ) : controle.ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{titel}</p>
        <p className="break-words text-xs text-muted-foreground">
          {overgeslagen ? uitleg : controle.ok ? "In orde" : controle.melding}
        </p>
      </div>
    </div>
  );
}

export default async function StatusPage() {
  await connection();
  const g = await controleerGezondheid();
  const tijd = new Date().toLocaleString("nl-BE", { timeZone: "Europe/Brussels" });

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>
          Systeemstatus:{" "}
          <span className={g.gezond ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-destructive"}>
            {g.gezond ? "alles in orde" : "er is een probleem"}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Regel titel="Configuratie" controle={g.configuratie} />
        <Regel titel="Database bereikbaar" controle={g.configuratie.ok ? g.database : "overgeslagen"} />
        <Regel
          titel="Database bijgewerkt (migraties)"
          controle={
            g.migraties.status === "niet-automatisch"
              ? "overgeslagen"
              : { ok: g.migraties.status === "ok", melding: g.migraties.melding }
          }
          uitleg={
            g.migraties.melding ??
            (g.installatie?.login === "supabase"
              ? "Handmatig beheerd (Supabase)"
              : "Niet automatisch (npm run db:migrate)")
          }
        />
        <Regel
          titel="Sleutel voor het mailen"
          controle={g.mailsleutel ?? "overgeslagen"}
          uitleg="Niet ingesteld: artikels mailen staat uit"
        />
        {g.sqlServer && g.sqlServer.waarschuwingen.length > 0 && (
          <div className="flex items-start gap-3 rounded-md border p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Aandachtspunten SQL Server</p>
              <ul className="space-y-0.5 break-words text-xs text-muted-foreground">
                {g.sqlServer.waarschuwingen.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {g.installatie && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
            <dt>Database</dt>
            <dd className="text-foreground">{NAMEN[g.installatie.database] ?? g.installatie.database}</dd>
            <dt>Login</dt>
            <dd className="text-foreground">{NAMEN[g.installatie.login] ?? g.installatie.login}</dd>
            <dt>Bestanden</dt>
            <dd className="text-foreground">{NAMEN[g.installatie.opslag] ?? g.installatie.opslag}</dd>
            {g.installatie.registratie && (
              <>
                <dt>Registreren</dt>
                <dd className="text-foreground">{NAMEN[g.installatie.registratie] ?? g.installatie.registratie}</dd>
              </>
            )}
            {g.sqlServer && (
              <>
                <dt>Zoeken</dt>
                <dd className="text-foreground">{NAMEN[g.sqlServer.zoeken] ?? g.sqlServer.zoeken}</dd>
              </>
            )}
          </dl>
        )}
        <p className="pt-1 text-xs text-muted-foreground">Gecontroleerd op {tijd}</p>
      </CardContent>
      <CardFooter className="flex justify-center gap-4 text-sm text-muted-foreground">
        <Link href="/status" className="transition-colors hover:text-foreground">
          Opnieuw controleren
        </Link>
        <Link href="/artikelen" className="transition-colors hover:text-foreground">
          Naar de kennisbank
        </Link>
      </CardFooter>
    </Card>
  );
}
