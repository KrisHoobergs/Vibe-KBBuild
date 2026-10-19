// Unittests voor isVerbindingsfout (npm run test:unit): de Postgres-gevallen
// blijven zoals ze waren, de SQL Server-vormen (tedious) komen erbij.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isVerbindingsfout } from "./auto-migrate";

const fout = (eigenschappen: Record<string, unknown>, bericht = "") => Object.assign(new Error(bericht), eigenschappen);

describe("isVerbindingsfout: Postgres (ongewijzigd)", () => {
  it("herkent de verbindingscodes", () => {
    for (const code of ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "57P01", "57P03"]) {
      assert.equal(isVerbindingsfout(fout({ code })), true, code);
    }
  });

  it("herkent timeout- en verbroken-meldingen", () => {
    assert.equal(isVerbindingsfout(new Error("timeout exceeded when trying to connect")), true);
    assert.equal(isVerbindingsfout(new Error("Connection terminated unexpectedly")), true);
    assert.equal(isVerbindingsfout(new Error("read ECONNRESET")), true);
  });

  it("geen verbindingsfout: aanmelding, SQL-fout, rare waarden", () => {
    assert.equal(isVerbindingsfout(fout({ code: "28P01" }, 'password authentication failed for user "x"')), false);
    assert.equal(isVerbindingsfout(fout({ code: "42P01" }, 'relation "x" does not exist')), false);
    assert.equal(isVerbindingsfout(null), false);
    assert.equal(isVerbindingsfout(undefined), false);
    assert.equal(isVerbindingsfout("ECONNREFUSED"), false);
  });

  it("een AggregateError van Node (meerdere adressen) telt zoals voorheen", () => {
    const binnen = fout({ code: "ECONNREFUSED" }, "connect ECONNREFUSED ::1:5432");
    const geheel = Object.assign(new AggregateError([binnen], ""), { code: "ECONNREFUSED" });
    assert.equal(isVerbindingsfout(geheel), true);
  });
});

describe("isVerbindingsfout: SQL Server (tedious)", () => {
  it("herkent de verbindingscodes van tedious", () => {
    for (const code of ["ESOCKET", "ETIMEOUT", "ECLOSE", "EINSTLOOKUP"]) {
      assert.equal(isVerbindingsfout(fout({ code })), true, code);
    }
  });

  it("een gewone aanmeldfout faalt meteen, een tijdelijke niet", () => {
    assert.equal(isVerbindingsfout(fout({ code: "ELOGIN" }, "Login failed for user 'kb'.")), false);
    assert.equal(isVerbindingsfout(fout({ code: "ELOGIN", isTransient: true }, "Login failed.")), true);
    assert.equal(
      isVerbindingsfout(
        fout(
          { code: "ELOGIN" },
          "Login failed for user 'kb'. Reason: Server is in script upgrade mode. Only administrator can connect at this time."
        )
      ),
      true
    );
  });

  it("kijkt in een array van serverfouten (Kysely-mssql)", () => {
    assert.equal(isVerbindingsfout([fout({ number: 2627 }), fout({ code: "ESOCKET" })]), true);
    assert.equal(isVerbindingsfout([fout({ number: 1505 }), fout({ number: 1750 })]), false);
    assert.equal(isVerbindingsfout(fout({ code: "EREQUEST", number: 547 }, "The INSERT statement conflicted")), false);
  });
});
