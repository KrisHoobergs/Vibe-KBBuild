// Unit-tests voor de SQL Server-zoekparser. Geen database nodig.
//   npm run test:unit
// De verwachte uitkomsten volgen websearch_to_tsquery('dutch', …) van Postgres
// (gecontroleerd op PostgreSQL 17); afwijkingen staan er apart bij.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INVOER,
  MAX_TERMEN,
  NEDERLANDSE_STOPWOORDEN,
  escapeLike,
  naarBonus,
  naarContains,
  naarLike,
  parseZoekvraag,
  ruweStam,
} from "./mssql-query";

const F = (w: string) => `FORMSOF(INFLECTIONAL, "${w}")`;
const contains = (q: string) => naarContains(parseZoekvraag(q));

describe("woorden, frases en AND", () => {
  it("één woord krijgt stemming", () => {
    assert.equal(contains("artikelen"), F("artikelen"));
  });
  it("meerdere woorden: AND", () => {
    assert.equal(contains("printer installeren"), `${F("printer")} AND ${F("installeren")}`);
  });
  it("frase blijft een frase, zonder stemming", () => {
    assert.equal(contains('"exacte zin" rest'), `"exacte zin" AND ${F("rest")}`);
  });
  it("frase van één woord wordt een gewoon woord (Postgres stemt het ook)", () => {
    assert.equal(contains('"hond"'), F("hond"));
  });
  it("frase zonder sluitend aanhalingsteken loopt tot het einde", () => {
    assert.equal(contains('kat "hond'), `${F("kat")} AND ${F("hond")}`);
    assert.equal(contains('kat "grote hond'), `${F("kat")} AND "grote hond"`);
  });
  it("dubbele termen één keer", () => {
    assert.equal(contains("kat kat KAT"), F("kat"));
  });
});

describe("uitsluiten met -", () => {
  it("-woord wordt AND NOT", () => {
    assert.equal(contains("foo -uitsluiten"), `${F("foo")} AND NOT ${F("uitsluiten")}`);
  });
  it("uitsluiting vooraan komt achter de positieve termen", () => {
    assert.equal(contains("-windows printer"), `${F("printer")} AND NOT ${F("windows")}`);
  });
  it('-"frase"', () => {
    assert.equal(contains('kat -"zwarte hond"'), `${F("kat")} AND NOT "zwarte hond"`);
  });
  it("min met spatie erna telt ook (zoals Postgres)", () => {
    assert.equal(contains("kat - hond"), `${F("kat")} AND NOT ${F("hond")}`);
  });
  it("dubbele min heft zich op", () => {
    assert.equal(contains("--kat"), F("kat"));
  });
  it("min binnen een woord is geen uitsluiting", () => {
    assert.equal(contains("e-mail"), '"e-mail"');
  });
  it("gedachtestreepje (–) is geen min", () => {
    assert.equal(contains("kat –hond"), `${F("kat")} AND ${F("hond")}`);
  });
  it("alleen uitsluitingen: niets om op te zoeken (Postgres zou 'alles behalve' geven)", () => {
    assert.deepEqual(parseZoekvraag("-uitsluiten"), []);
    assert.equal(contains("-kat -hond"), null);
  });
});

describe("or", () => {
  it("a or b", () => {
    assert.equal(contains("a or b"), `(${F("a")}) OR (${F("b")})`);
  });
  it("AND gaat voor OR", () => {
    assert.equal(contains("kat hond or vis"), `(${F("kat")} AND ${F("hond")}) OR (${F("vis")})`);
    assert.equal(contains("kat or hond vis"), `(${F("kat")}) OR (${F("hond")} AND ${F("vis")})`);
  });
  it("hoofdletters en leestekens rond or", () => {
    for (const q of ["kat OR hond", "kat oR hond", "kat (or) hond", "kat|or|hond", "kat or. hond"]) {
      assert.equal(contains(q), `(${F("kat")}) OR (${F("hond")})`, q);
    }
  });
  it("or aan het begin of einde is een gewoon woord", () => {
    assert.equal(contains("or kat"), `${F("or")} AND ${F("kat")}`);
    assert.equal(contains("kat or"), `${F("kat")} AND ${F("or")}`);
  });
  it("or direct na or is een woord", () => {
    assert.equal(contains("kat or or hond"), `(${F("kat")}) OR (${F("or")} AND ${F("hond")})`);
  });
  it('-or en "or" zijn woorden', () => {
    assert.equal(contains("kat -or hond"), `${F("kat")} AND ${F("hond")} AND NOT ${F("or")}`);
    assert.equal(contains('kat "or" hond'), `${F("kat")} AND ${F("or")} AND ${F("hond")}`);
  });
  it("stopwoorden vallen pas weg na het herkennen van or", () => {
    assert.equal(contains("de or kat"), F("kat"));
    assert.equal(contains("kat or de"), F("kat"));
  });
  it("een groep met alleen uitsluitingen valt weg (SQL Server kent geen OR NOT)", () => {
    assert.equal(contains("kat or -hond"), F("kat"));
    assert.equal(contains("-kat or hond"), F("hond"));
  });
  it("Nederlands 'of' is een stopwoord, geen OR", () => {
    assert.equal(contains("kat of hond"), `${F("kat")} AND ${F("hond")}`);
  });
});

describe("stopwoorden en lege invoer", () => {
  it("stopwoorden vallen weg", () => {
    assert.equal(contains("de printer"), F("printer"));
    assert.equal(contains("hoe werkt de kennisbank"), `${F("werkt")} AND ${F("kennisbank")}`);
  });
  it("binnen een frase blijven stopwoorden staan (STOPLIST OFF: exacte frase)", () => {
    assert.equal(contains('"de printer van de afdeling"'), '"de printer van de afdeling"');
  });
  it("niets om op te zoeken → null, nooit een lege voorwaarde (fout 7645)", () => {
    for (const q of ["", "   ", "de het een", "of", 'de "het"', '-"de"', '""', '"', "-", "---", "!!!", "#", "* * *", "😀", "()", "&|!<>"]) {
      assert.deepEqual(parseZoekvraag(q), [], JSON.stringify(q));
      assert.equal(naarContains(parseZoekvraag(q)), null, JSON.stringify(q));
      assert.equal(naarBonus(parseZoekvraag(q)), null, JSON.stringify(q));
      assert.equal(naarLike(parseZoekvraag(q)), null, JSON.stringify(q));
    }
  });
});

describe("speciale tekens", () => {
  it("c#, c++, node.js, .net, adressen en getallen: letterlijke term, geen stemming", () => {
    assert.equal(contains("c#"), '"c#"');
    assert.equal(contains("C++"), '"C++"');
    assert.equal(contains("node.js"), '"node.js"');
    assert.equal(contains("c# .net"), `"c#" AND ${F("net")}`);
    assert.equal(contains("kris.hoobergs@gmail.com"), '"kris.hoobergs@gmail.com"');
    assert.equal(contains("v1.2.3"), '"v1.2.3"');
    assert.equal(contains("100%"), '"100"');
    assert.equal(contains("o'brien"), `"o'brien"`);
  });
  it("Postgres-operatoren zijn scheidingstekens", () => {
    assert.equal(contains("a&b"), `${F("a")} AND ${F("b")}`);
    assert.equal(contains("!kat"), F("kat"));
    assert.equal(contains("f(x)"), `${F("f")} AND ${F("x")}`);
    assert.equal(contains("kat <-> hond"), `${F("kat")} AND ${F("hond")}`);
  });
  it("geen prefix-zoeken: * verdwijnt (websearch kent het ook niet)", () => {
    assert.equal(contains("kat*"), F("kat"));
    assert.equal(contains('"kat*"'), F("kat"));
    assert.equal(contains("kat*hond"), '"kat hond"');
  });
  it("leestekens aan de rand vallen weg", () => {
    assert.equal(contains("kat-"), F("kat"));
    assert.equal(contains("'kat'"), F("kat"));
    assert.equal(contains("[abc]"), F("abc"));
  });
  it("accenten en Unicode blijven, NFD wordt NFC", () => {
    assert.equal(contains("één ideeën"), `${F("één")} AND ${F("ideeën")}`);
    assert.equal(contains("café"), F("café"));
    assert.equal(contains("naïef"), F("naïef"));
  });
  it("aanhalingstekens kunnen de voorwaarde niet openbreken", () => {
    assert.equal(contains('kat" OR "x'), `${F("kat")} AND ${F("OR")} AND ${F("x")}`);
    // (De voorwaarde gaat bovendien altijd als parameter mee, nooit in de SQL-tekst.)
    assert.equal(
      contains(`kat'); DROP TABLE articles; --`),
      `${F("kat")} AND ${F("DROP")} AND ${F("TABLE")} AND ${F("articles")}`
    );
  });
});

describe("limieten", () => {
  it(`hoogstens ${MAX_TERMEN} termen`, () => {
    const q = Array.from({ length: 60 }, (_, i) => `woord${i}`).join(" ");
    const groepen = parseZoekvraag(q);
    assert.equal(groepen.flat().length, MAX_TERMEN);
  });
  it("voorwaarde blijft onder 4000 tekens (nvarchar(max) mag niet in CONTAINS)", () => {
    const lang = [
      "x".repeat(5000),
      Array.from({ length: 400 }, (_, i) => `w${i}`).join(" "),
      Array.from({ length: 400 }, () => "-a").join(" "),
      Array.from({ length: 300 }, (_, i) => `a${i} or`).join(" "),
      '"' + "ab ".repeat(2000),
    ];
    for (const q of lang) {
      const c = contains(q) ?? "";
      const b = naarBonus(parseZoekvraag(q)) ?? "";
      assert.ok(c.length < 4000 && b.length < 4000, `${c.length} / ${b.length}`);
    }
  });
});

// Controle op de grammatica van CONTAINS, voor willekeurige invoer.
function isGeldigeVoorwaarde(v: string): boolean {
  const term = String.raw`(?:FORMSOF\(INFLECTIONAL, "[^"*]+"\)|"[^"*]+")`;
  const groep = String.raw`${term}(?: AND ${term})*(?: AND NOT ${term})*`;
  return new RegExp(String.raw`^(?:${groep}|\(${groep}\)(?: OR \(${groep}\))+)$`).test(v);
}

describe("willekeurige invoer", () => {
  it("geeft altijd null of een geldige voorwaarde", () => {
    const tekens = ['"', "-", " ", "  ", "or", "OR", "*", "(", ")", "!", "&", "|", "'", "#", "+", ".", "_", "%", "[", "]",
      "kat", "hond", "de", "één", "c", "1", "😀", "́", "\t", "\n", ";", "\\", "/", ":", "@", "–"];
    let zaad = 42;
    const rnd = () => ((zaad = (zaad * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 5000; n++) {
      let q = "";
      const lengte = Math.floor(rnd() * 12);
      for (let k = 0; k < lengte; k++) q += tekens[Math.floor(rnd() * tekens.length)];
      const v = contains(q);
      if (v !== null) assert.ok(isGeldigeVoorwaarde(v), `${JSON.stringify(q)} → ${v}`);
      const b = naarBonus(parseZoekvraag(q));
      assert.equal(b === null, v === null, JSON.stringify(q));
    }
  });
});

describe("bonus voor titel en excerpt", () => {
  it("alle positieve termen met OR, zonder uitsluitingen", () => {
    assert.equal(
      naarBonus(parseZoekvraag('printer -windows or scanner "nieuwe versie"')),
      `${F("printer")} OR ${F("scanner")} OR "nieuwe versie"`
    );
  });
});

describe("LIKE-terugval", () => {
  it("escapet % _ [ en het escapeteken !", () => {
    assert.equal(escapeLike("100%_[x]!"), "100!%!_![x]!!");
  });
  it("AND, uitsluitingen en ruwe stam", () => {
    assert.deepEqual(naarLike(parseZoekvraag("artikelen -concept")), {
      groepen: [{ verplicht: ["%artikel%"], uitgesloten: ["%concept%"] }],
      rang: ["%artikel%"],
    });
  });
  it("frases en speciale termen letterlijk, _ ge-escapet", () => {
    assert.deepEqual(naarLike(parseZoekvraag('"exacte zin" c# kat_hond')), {
      groepen: [{ verplicht: ["%exacte zin%", "%c#%", "%kat!_hond%"], uitgesloten: [] }],
      rang: ["%exacte zin%", "%c#%", "%kat!_hond%"],
    });
  });
  it("OR-groepen", () => {
    assert.deepEqual(naarLike(parseZoekvraag("kat or hond")), {
      groepen: [
        { verplicht: ["%kat%"], uitgesloten: [] },
        { verplicht: ["%hond%"], uitgesloten: [] },
      ],
      rang: ["%kat%", "%hond%"],
    });
  });
  it("ruweStam", () => {
    const gevallen: [string, string][] = [
      ["artikelen", "artikel"], ["Printers", "printer"], ["kennisbanken", "kennisbank"],
      ["pakketten", "pakket"], ["bussen", "bus"], ["wegen", "weg"], ["regels", "regel"],
      ["proces", "proce"], ["kaas", "kaas"], ["bus", "bus"], ["en", "en"], ["boss", "boss"], ["klassen", "klas"],
    ];
    for (const [in_, uit] of gevallen) assert.equal(ruweStam(in_), uit, in_);
  });
  it("accenten blijven in het patroon (de collatie Latin1_General_100_CI_AI negeert ze)", () => {
    assert.deepEqual(naarLike(parseZoekvraag("café één")), {
      groepen: [{ verplicht: ["%café%", "%één%"], uitgesloten: [] }],
      rang: ["%café%", "%één%"],
    });
  });
  it("[ ] ! en % bereiken het patroon niet; escapeLike escapet ze toch", () => {
    assert.deepEqual(naarLike(parseZoekvraag('"a[b] c!"'))?.groepen, [{ verplicht: ["%a b c%"], uitgesloten: [] }]);
    assert.equal(escapeLike("[!]"), "![!!]");
  });
});

describe("grenzen", () => {
  it("de stopwoordenlijst van Postgres heeft 101 woorden", () => {
    assert.equal(NEDERLANDSE_STOPWOORDEN.size, 101);
    assert.ok(NEDERLANDSE_STOPWOORDEN.has("de") && NEDERLANDSE_STOPWOORDEN.has("of") && !NEDERLANDSE_STOPWOORDEN.has("or"));
  });
  it(`alles na ${MAX_INVOER} tekens telt niet mee`, () => {
    const q = `kat ${"x".repeat(MAX_INVOER)} hond`;
    assert.equal(contains(q), `${F("kat")} AND ${F("x".repeat(MAX_INVOER - 4))}`);
  });
  it("de limiet op termen telt over alle OR-groepen samen", () => {
    const q = Array.from({ length: 40 }, (_, i) => `a${i}`).join(" or ");
    const groepen = parseZoekvraag(q);
    assert.equal(groepen.length, MAX_TERMEN);
    assert.equal(groepen.flat().length, MAX_TERMEN);
  });
});
