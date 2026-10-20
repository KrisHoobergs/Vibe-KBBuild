// Unittests voor de weergave per installatie (npm run test:unit).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { icoonSvg, leesInstallatieWeergave, paginaTitel, STANDAARD_KLEUR } from "./installatie";

describe("leesInstallatieWeergave", () => {
  it("geeft null zonder naam (alles blijft zoals altijd)", () => {
    assert.equal(leesInstallatieWeergave({}), null);
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_NAAM: "" }), null);
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_NAAM: "   \t " }), null);
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_KLEUR: "60A5FA" }), null);
  });

  it("maakt de naam schoon en begrenst ze", () => {
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_NAAM: "  Build   Software " })?.naam, "Build Software");
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_NAAM: "Kris\u0000\nTest" })?.naam, "Kris Test");
    const lang = leesInstallatieWeergave({ INSTALLATIE_NAAM: "🚀".repeat(50) })!.naam;
    assert.equal(Array.from(lang).length, 40);
    assert.ok(!/[\ud800-\udfff]/.test(lang.replace(/🚀/g, "")), "geen losse surrogaten");
  });

  it("leest de kleur met en zonder #, anders de standaardkleur", () => {
    const kleur = (k?: string) => leesInstallatieWeergave({ INSTALLATIE_NAAM: "x", INSTALLATIE_KLEUR: k })!.kleur;
    assert.equal(kleur("#60A5FA"), "#60A5FA");
    assert.equal(kleur("60a5fa"), "#60A5FA");
    assert.equal(kleur(" #60A5FA "), "#60A5FA");
    for (const fout of [undefined, "", "blue", "#12345", "#GGGGGG", "60A5FA1"]) {
      assert.equal(kleur(fout), STANDAARD_KLEUR, String(fout));
    }
  });

  it("kiest de best leesbare tekstkleur", () => {
    const tekst = (k: string) => leesInstallatieWeergave({ INSTALLATIE_NAAM: "x", INSTALLATIE_KLEUR: k })!.tekstkleur;
    assert.equal(tekst("FCB50D"), "#0A2028");
    assert.equal(tekst("60A5FA"), "#0A2028");
    assert.equal(tekst("FFFFFF"), "#0A2028");
    assert.equal(tekst("023B49"), "#FFFFFF");
    assert.equal(tekst("000000"), "#FFFFFF");
  });

  it("maakt een afkorting, of neemt de eigen", () => {
    const afk = (naam: string, eigen?: string) =>
      leesInstallatieWeergave({ INSTALLATIE_NAAM: naam, INSTALLATIE_AFKORTING: eigen })!.afkorting;
    assert.equal(afk("Kris"), "K");
    assert.equal(afk("Build Software"), "BS");
    assert.equal(afk("Kennisbank van Kris"), "KK");
    assert.equal(afk("Kennisbank Kris", "k"), "K");
    assert.equal(afk("Kennisbank Kris", "abc"), "AB");
    assert.equal(afk("éénhoorn"), "É");
    assert.equal(afk("🚀 Team"), "🚀T");
    // Per teken zoals een lezer het ziet: vlag heel, ß eerst naar hoofdletters.
    assert.equal(afk("Kennisbank 🇧🇪"), "K🇧🇪");
    assert.equal(afk("ßtraße Wiki"), "SW");
    assert.equal(afk("x", "🇧🇪🇳🇱🇩🇪"), "🇧🇪🇳🇱");
  });

  it("knipt de naam nooit midden in een teken en laat geen ongeldige tekens door", () => {
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_NAAM: "🇧🇪".repeat(50) })!.naam, "🇧🇪".repeat(40));
    assert.equal(leesInstallatieWeergave({ INSTALLATIE_NAAM: "Kris\ud800￿Test" })!.naam, "KrisTest");
  });

  it("kiest het logo", () => {
    const logo = (l?: string) => leesInstallatieWeergave({ INSTALLATIE_NAAM: "x", INSTALLATIE_LOGO: l })!.logo;
    assert.equal(logo(undefined), "afbeelding");
    assert.equal(logo("afbeelding"), "afbeelding");
    assert.equal(logo(" Tekst "), "tekst");
    assert.equal(logo("iets anders"), "afbeelding");
  });

  it("geeft een stabiele versie die meeverandert met het icoon", () => {
    const v = (env: Record<string, string>) => leesInstallatieWeergave({ INSTALLATIE_NAAM: "Kris", ...env })!.versie;
    assert.match(v({}), /^[0-9a-z]+$/);
    assert.equal(v({}), v({}));
    assert.notEqual(v({}), v({ INSTALLATIE_KLEUR: "60A5FA" }));
    assert.notEqual(v({}), v({ INSTALLATIE_AFKORTING: "X" }));
    // De naam zelf staat niet op het icoon: andere naam met dezelfde afkorting = zelfde icoon.
    assert.equal(v({}), leesInstallatieWeergave({ INSTALLATIE_NAAM: "Kim" })!.versie);
  });
});

describe("paginaTitel", () => {
  it("zet de naam vooraan, of toont de gewone titel", () => {
    assert.equal(paginaTitel(null), "Knowledge Build");
    assert.equal(paginaTitel(leesInstallatieWeergave({ INSTALLATIE_NAAM: "Build Software" })), "Build Software · Knowledge Build");
  });
});

describe("icoonSvg", () => {
  it("is een SVG met kleur en geëscapete afkorting", () => {
    const svg = icoonSvg(leesInstallatieWeergave({ INSTALLATIE_NAAM: "x", INSTALLATIE_KLEUR: "60A5FA", INSTALLATIE_AFKORTING: "<&" })!);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(svg.includes('fill="#60A5FA"'));
    assert.ok(svg.includes("&lt;&amp;</text>"));
    assert.ok(!svg.includes("<&"));
  });
});
