import { APP_NAME } from "./constants";

// Hoe deze installatie zich toont: naam op het tabblad, tabblad-icoon, logo
// linksboven en op de inlogpagina. Zo zie je meteen in welke kennisbank je zit
// als je er meerdere hebt (bv. privé en werk). Alles optioneel: zonder
// INSTALLATIE_NAAM ziet alles eruit zoals altijd.
//
// Bewust niet in config.ts: een fout in de database-instellingen mag de naam
// niet verbergen (op /status wil je juist zien welke installatie het is).
// Geen "server-only": de unittests importeren dit; client-componenten
// importeren hieruit alleen het type.

export type InstallatieWeergave = {
  naam: string;
  /** #RRGGBB */
  kleur: string;
  /** Tekst op de kleur: donker of wit, wat het best leesbaar is. */
  tekstkleur: string;
  /** 1–2 tekens op het tabblad-icoon en in het tekstlogo. */
  afkorting: string;
  /** "afbeelding": het standaardlogo; "tekst": de naam als logo. */
  logo: "afbeelding" | "tekst";
  /**
   * Eigen tabblad-icoon (INSTALLATIE_ICOON): een bestand in public/ of het oude
   * standaardicoon. null: het gegenereerde icoon met de afkorting (/api/icoon).
   */
  icoon: { url: string; type: string } | null;
  /** Verandert als het icoon verandert (cache-busting van /api/icoon). */
  versie: string;
};

export const STANDAARD_KLEUR = "#FCB50D";
const DONKER = "#0A2028";
const WIT = "#FFFFFF";
/** Ophogen als het ontwerp van icoonSvg wijzigt, zodat browsers het nieuwe ophalen. */
const ICOON_VERSIE = "1";
const MAX_NAAM = 40;

type Env = Record<string, string | undefined>;

function schoon(waarde: string | undefined): string {
  return (
    (waarde ?? "")
      // Losse surrogaten en de niet-tekens U+FFFE/U+FFFF zijn ongeldig in XML (het icoon).
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]|[￾￿]/g, "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

const segmenter = new Intl.Segmenter("nl", { granularity: "grapheme" });

/** De eerste `max` tekens zoals een lezer ze ziet (een vlag of é telt als één). */
function grafemen(tekst: string, max: number): string {
  return Array.from(segmenter.segment(tekst), (s) => s.segment)
    .slice(0, max)
    .join("");
}

/** Accepteert RRGGBB met of zonder # (in .env en YAML begint # een commentaar). */
function leesKleur(waarde: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(schoon(waarde));
  return m ? `#${m[1].toUpperCase()}` : STANDAARD_KLEUR;
}

function luminantie(hex: string): number {
  const kanaal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanaal(1) + 0.7152 * kanaal(3) + 0.0722 * kanaal(5);
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminantie(a), luminantie(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Eerste letter van het eerste en het laatste woord (in hoofdletters, per teken). */
function standaardAfkorting(naam: string): string {
  const woorden = naam.split(" ").filter(Boolean);
  const eerste = (woord: string) => grafemen(woord.toLocaleUpperCase("nl"), 1);
  return woorden.length > 1 ? eerste(woorden[0]) + eerste(woorden[woorden.length - 1]) : eerste(woorden[0] ?? "");
}

const ICOON_TYPES: Record<string, string> = {
  png: "image/png",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

/**
 * INSTALLATIE_ICOON: "standaard" (het oude favicon.ico) of het pad van een
 * bestand in public/ (bv. /iconen/build-software-32.png). Alleen een eenvoudig
 * pad op deze site: geen andere website, geen "..". Anders null (het
 * gegenereerde icoon).
 */
function leesIcoon(waarde: string | undefined): InstallatieWeergave["icoon"] {
  const pad = schoon(waarde);
  if (pad.toLowerCase() === "standaard") return { url: "/favicon.ico", type: "image/x-icon" };
  const m = /^\/(?!\/)[a-z0-9_\-/]+\.(png|ico|svg)$/i.exec(pad);
  if (!m || pad.split("/").some((deel) => deel === "." || deel === "..")) return null;
  return { url: pad, type: ICOON_TYPES[m[1].toLowerCase()] };
}

/** Korte, stabiele hash (FNV-1a) voor de icoon-URL. */
function hash(tekst: string): string {
  let h = 0x811c9dc5;
  for (const c of tekst) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function leesInstallatieWeergave(env: Env = process.env): InstallatieWeergave | null {
  const naam = grafemen(schoon(env.INSTALLATIE_NAAM), MAX_NAAM).trim();
  if (!naam) return null;

  const kleur = leesKleur(env.INSTALLATIE_KLEUR);
  const tekstkleur = contrast(kleur, DONKER) >= contrast(kleur, WIT) ? DONKER : WIT;
  const eigen = grafemen(schoon(env.INSTALLATIE_AFKORTING).toLocaleUpperCase("nl"), 2);
  const afkorting = eigen || standaardAfkorting(naam) || "?";
  const logo = schoon(env.INSTALLATIE_LOGO).toLowerCase() === "tekst" ? "tekst" : "afbeelding";
  const icoon = leesIcoon(env.INSTALLATIE_ICOON);

  return {
    naam,
    kleur,
    tekstkleur,
    afkorting,
    logo,
    icoon,
    versie: hash(`${ICOON_VERSIE}|${kleur}|${tekstkleur}|${afkorting}`),
  };
}

/** Titel op het tabblad. De naam vooraan: zo blijft ze zichtbaar in smalle tabbladen. */
export function paginaTitel(w: InstallatieWeergave | null): string {
  return w ? `${w.naam} · ${APP_NAME}` : APP_NAME;
}

function xml(tekst: string): string {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Tabblad-icoon: een afgerond vierkant in de kleur met de afkorting. De donkere
 * rand houdt het zichtbaar op een witte tabbladbalk.
 */
export function icoonSvg(w: InstallatieWeergave): string {
  const grootte = Array.from(segmenter.segment(w.afkorting)).length > 1 ? 15 : 20;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
    `<rect x="1" y="1" width="30" height="30" rx="7" fill="${w.kleur}" stroke="#023B49" stroke-width="2"/>` +
    `<text x="16" y="16" dy="0.35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" ` +
    `font-size="${grootte}" font-weight="700" fill="${w.tekstkleur}">${xml(w.afkorting)}</text>` +
    `</svg>`
  );
}
