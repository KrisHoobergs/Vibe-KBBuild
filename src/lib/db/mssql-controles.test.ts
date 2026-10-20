// Unittests voor beoordeelMssqlControles (npm run test:unit): wat de
// gezondheidscheck op SQL Server fataal vindt en wat alleen een waarschuwing is.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beoordeelMssqlControles, type MssqlControles } from "./mssql-controles";

/** SQL Server 2025 Developer met full-text en RCSI: alles in orde. */
const GOED: MssqlControles = {
  hoofdversie: 17,
  editie: 3,
  nocount: 0,
  collatie: "Latin1_General_100_CI_AS_SC_UTF8",
  rcsi: 1,
  fts: 1,
  ftindex: 1,
  ftwachtend: 0,
};

describe("beoordeelMssqlControles", () => {
  it("alles in orde: full-text, geen waarschuwingen", () => {
    assert.deepEqual(beoordeelMssqlControles(GOED), { fataal: [], waarschuwingen: [], zoeken: "full-text" });
  });

  it("NOCOUNT via de serverinstelling is fataal", () => {
    const { fataal } = beoordeelMssqlControles({ ...GOED, nocount: 1 });
    assert.deepEqual(fataal, [
      "NOCOUNT staat aan in de serverinstellingen (user options); opslaan werkt dan niet betrouwbaar",
    ]);
  });

  it("ouder dan SQL Server 2016 is fataal", () => {
    assert.deepEqual(beoordeelMssqlControles({ ...GOED, hoofdversie: 12 }).fataal, ["SQL Server 2016 of nieuwer nodig"]);
    assert.deepEqual(beoordeelMssqlControles({ ...GOED, hoofdversie: 13 }).fataal, []);
  });

  it("beide fataal tegelijk", () => {
    assert.equal(beoordeelMssqlControles({ ...GOED, nocount: 1, hoofdversie: 11 }).fataal.length, 2);
  });

  it("zonder full-text: eenvoudig zoeken, met een waarschuwing", () => {
    assert.deepEqual(beoordeelMssqlControles({ ...GOED, fts: 0, ftindex: null, ftwachtend: null }), {
      fataal: [],
      waarschuwingen: ["Full-text search is niet geïnstalleerd: zoeken zonder vervoegingen"],
      zoeken: "eenvoudig",
    });
  });

  it("full-text geïnstalleerd, maar nog geen index", () => {
    assert.deepEqual(beoordeelMssqlControles({ ...GOED, ftindex: 0 }), {
      fataal: [],
      waarschuwingen: ["Er is nog geen full-text-index: zoeken zonder vervoegingen (voer de migraties uit)"],
      zoeken: "eenvoudig",
    });
  });

  it("SQL Server 2016–2022 met full-text: werkt, maar zonder vervoegingen", () => {
    for (const hoofdversie of [13, 16]) {
      assert.deepEqual(beoordeelMssqlControles({ ...GOED, hoofdversie }), {
        fataal: [],
        waarschuwingen: ["Zoeken kent op deze SQL Server-versie geen vervoegingen (pas vanaf SQL Server 2025)"],
        zoeken: "full-text",
      });
    }
  });

  it("SQL Server 2016–2022 zonder full-text: belooft geen vervoegingen", () => {
    assert.deepEqual(beoordeelMssqlControles({ ...GOED, hoofdversie: 16, fts: 0, ftindex: null }).waarschuwingen, [
      "Full-text search is niet geïnstalleerd: eenvoudig zoeken",
    ]);
    assert.deepEqual(beoordeelMssqlControles({ ...GOED, hoofdversie: 15, ftindex: 0 }).waarschuwingen, [
      "Er is nog geen full-text-index: eenvoudig zoeken (voer de migraties uit)",
    ]);
  });

  it("READ_COMMITTED_SNAPSHOT uit is een waarschuwing, geen fout", () => {
    const r = beoordeelMssqlControles({ ...GOED, rcsi: 0 });
    assert.deepEqual(r.fataal, []);
    assert.deepEqual(r.waarschuwingen, ["READ_COMMITTED_SNAPSHOT staat uit"]);
  });

  it("onbekende waarden (null) zijn niet fataal", () => {
    const r = beoordeelMssqlControles({ ...GOED, hoofdversie: null, editie: null, rcsi: null, collatie: null });
    assert.deepEqual(r.fataal, []);
    assert.deepEqual(r.waarschuwingen, []);
  });

  it("toont nooit versie of collatie (die staan niet publiek op /status)", () => {
    const r = beoordeelMssqlControles({ ...GOED, nocount: 1, hoofdversie: 12, rcsi: 0, fts: 0 });
    const tekst = [...r.fataal, ...r.waarschuwingen].join(" ");
    assert.ok(!/Latin1|collat/i.test(tekst));
    assert.ok(!/\b12\b|2014/.test(tekst));
    // Op 2016–2022 alleen "vóór 2025", nooit de versie zelf.
    const oud = beoordeelMssqlControles({ ...GOED, hoofdversie: 15 }).waarschuwingen.join(" ");
    assert.ok(!/\b15\b|2019/.test(oud), oud);
  });
});
