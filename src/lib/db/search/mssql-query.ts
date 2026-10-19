// Zoekinvoer → SQL Server full-text-zoekvoorwaarde (CONTAINS / CONTAINSTABLE),
// met dezelfde regels als websearch_to_tsquery in de Postgres-installaties:
//
//   printer installeren   → beide woorden (AND)
//   "exacte zin"          → frase
//   kat or hond           → OR ("or" als los woord, tussen twee termen; laagste voorrang)
//   -windows, -"oude zin" → AND NOT
//   ! & | ( ) <           → scheidingstekens, net als bij Postgres
//   geen prefix (*), geen NEAR: websearch_to_tsquery kent die ook niet
//
// Eén uitzondering op "geen prefix": op SQL Server 2016–2022 geeft de
// Nederlandse stemmer geen andere woordvormen (zie heeftOudeStemmer). Daar
// zoekt de app zelf ook op het begin van de ruwe stam (stamPrefix), zodat
// `artikelen` toch `artikel` vindt. De gebruiker kan zelf geen * opgeven.
//
// Nederlandse stopwoorden (dezelfde lijst als Postgres' 'dutch') vallen weg,
// behalve binnen een frase van meerdere woorden. De full-text index gebruikt
// STOPLIST OFF, dus SQL Server kent zelf geen ruiswoorden: een query met alleen
// ruiswoorden kan dan geen lege of nul-rijen-voorwaarde meer geven.
//
// Puur en zonder imports (geen "server-only"), zodat node:test dit bestand
// rechtstreeks kan laden.

export type ZoekTerm = {
  /** Eén woord, of de woorden van een frase. Zonder " of *. */
  woorden: string[];
  /** Eén woord van alleen letters: dan FORMSOF(INFLECTIONAL, …) (stemming). */
  vervoegbaar: boolean;
  negatief: boolean;
};

/** Termen die allemaal moeten kloppen (AND / AND NOT). */
export type ZoekGroep = ZoekTerm[];

/** Langere invoer wordt afgekapt: zo blijft de voorwaarde ver onder 4000 tekens. */
export const MAX_INVOER = 512;
/** Meer termen worden genegeerd (positief en negatief samen). */
export const MAX_TERMEN = 24;

/** De stopwoordenlijst van Postgres (share/tsearch_data/dutch.stop), 101 woorden. */
export const NEDERLANDSE_STOPWOORDEN: ReadonlySet<string> = new Set(
  (
    "de en van ik te dat die in een hij het niet zijn is was op aan met als voor had er " +
    "maar om hem dan zou of wat mijn men dit zo door over ze zich bij ook tot je mij uit " +
    "der daar haar naar heb hoe heeft hebben deze u want nog zal me zij nu ge geen omdat " +
    "iets worden toch al waren veel meer doen toen moet ben zonder kan hun dus alles onder " +
    "ja eens hier wie werd altijd doch wordt wezen kunnen ons zelf tegen na reeds wil kon " +
    "niets uw iemand geweest andere"
  ).split(" ")
);

// Scheidt termen: witruimte en ISOPERATOR uit Postgres' tsquery.c (! & | ( ) <).
// Let op: '>' hoort daar niet bij; in "kat <-> hond" is ">" een (lege) term
// die de min opslorpt, zodat Postgres 'kat' & 'hond' geeft.
const SCHEIDING = /[\s!&|()<]/u;
// Alles behalve letters, cijfers en leestekens die binnen een woord voorkomen
// (e-mail, node.js, c#, c++, o'brien) wordt een spatie. Daarmee verdwijnen ook
// " en *, de enige tekens met een betekenis binnen een CONTAINS-frase.
const NIET_TOEGESTAAN = /[^\p{L}\p{M}\p{N}\-_.'’@#+/:,]+/gu;
// Leestekens aan het begin of einde van een woord tellen niet ("kat-", "'kat'").
const RANDTEKENS = /^[-_.'’@/:,]+|[-_.'’@/:,]+$/gu;
const HEEFT_LETTER_OF_CIJFER = /[\p{L}\p{N}]/u;
const ALLEEN_LETTERS = /^[\p{L}\p{M}]+$/u;

type Ruw = { term: ZoekTerm; stopwoord: boolean; ofKandidaat: boolean };

function woordenUit(tekst: string): string[] {
  return tekst
    .replace(NIET_TOEGESTAAN, " ")
    .split(" ")
    .map((w) => w.replace(RANDTEKENS, ""))
    .filter((w) => HEEFT_LETTER_OF_CIJFER.test(w));
}

function maakTerm(tekst: string, negatief: boolean): Ruw | null {
  const woorden = woordenUit(tekst);
  if (woorden.length === 0) return null;
  const vervoegbaar = woorden.length === 1 && ALLEEN_LETTERS.test(woorden[0]);
  return {
    term: { woorden, vervoegbaar, negatief },
    // Een frase valt alleen weg als ze helemaal uit stopwoorden bestaat.
    stopwoord: woorden.every((w) => NEDERLANDSE_STOPWOORDEN.has(w.toLowerCase())),
    ofKandidaat: false,
  };
}

/** Stap 1: invoer → termen en mogelijke OR's, in volgorde. */
function scan(invoer: string): Ruw[] {
  const s = invoer.normalize("NFC").slice(0, MAX_INVOER);
  const uit: Ruw[] = [];
  let negatie = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      // Frase tot het volgende aanhalingsteken, of tot het einde (zoals Postgres).
      const eind = s.indexOf('"', i + 1);
      const inhoud = eind === -1 ? s.slice(i + 1) : s.slice(i + 1, eind);
      i = eind === -1 ? s.length : eind + 1;
      const ruw = maakTerm(inhoud, negatie);
      negatie = false;
      if (ruw) uit.push(ruw);
      continue;
    }
    if (c === "-") {
      // Een min vóór een term keert hem om, ook met spaties ertussen ("kat - hond");
      // twee keer min heft zich op, net als !! in Postgres.
      negatie = !negatie;
      i++;
      continue;
    }
    if (SCHEIDING.test(c)) {
      i++;
      continue;
    }
    let j = i;
    while (j < s.length && s[j] !== '"' && !SCHEIDING.test(s[j])) j++;
    const tekst = s.slice(i, j);
    i = j;
    const ruw = maakTerm(tekst, negatie);
    if (ruw) {
      // "or", "OR", "or." → mogelijke operator; "-or" en "\"or\"" zijn gewone woorden.
      ruw.ofKandidaat =
        !negatie && ruw.term.woorden.length === 1 && ruw.term.woorden[0].toLowerCase() === "or";
      uit.push(ruw);
    }
    negatie = false;
  }
  return uit;
}

function sleutel(t: ZoekTerm): string {
  return `${t.negatief ? "-" : "+"}${t.woorden.join(" ").toLowerCase()}`;
}

/**
 * Zoekinvoer → OR-groepen van AND-termen. Een lege lijst betekent: niets om op
 * te zoeken (alleen stopwoorden, leestekens of uitsluitingen). Dan geen query
 * uitvoeren en geen resultaten tonen, zoals Postgres bij een lege tsquery.
 */
export function parseZoekvraag(invoer: string): ZoekGroep[] {
  const ruw = scan(invoer);

  // Stap 2: "or" is alleen een operator tussen twee termen ("kat or hond");
  // aan het begin, op het einde of direct na een andere OR is het een woord.
  // Dit gebeurt vóór het wegfilteren van stopwoorden, net als in Postgres
  // ("de or kat" → kat).
  const groepen: Ruw[][] = [[]];
  let vorigeWasOf = true;
  for (let k = 0; k < ruw.length; k++) {
    const r = ruw[k];
    if (r.ofKandidaat && !vorigeWasOf && k < ruw.length - 1) {
      groepen.push([]);
      vorigeWasOf = true;
      continue;
    }
    groepen[groepen.length - 1].push(r);
    vorigeWasOf = false;
  }

  // Stap 3: stopwoorden weg, dubbels weg, groepen zonder positieve term weg
  // (SQL Server kent geen "OR NOT" en geen NOT als eerste term).
  const uit: ZoekGroep[] = [];
  let aantal = 0;
  for (const groep of groepen) {
    const gezien = new Set<string>();
    const termen: ZoekTerm[] = [];
    for (const r of groep) {
      if (r.stopwoord) continue;
      const k = sleutel(r.term);
      if (gezien.has(k)) continue;
      gezien.add(k);
      termen.push(r.term);
    }
    // Positieve termen eerst: AND NOT mag niet vooraan staan.
    termen.sort((a, b) => Number(a.negatief) - Number(b.negatief));
    const binnenLimiet = termen.slice(0, Math.max(0, MAX_TERMEN - aantal));
    if (!binnenLimiet.some((t) => !t.negatief)) continue;
    aantal += binnenLimiet.length;
    uit.push(binnenLimiet);
  }
  return uit;
}

/** Vanaf deze hoofdversie (SQL Server 2025) geeft de Nederlandse stemmer andere woordvormen. */
export const HOOFDVERSIE_MET_VERVOEGINGEN = 17;

/**
 * SQL Server 2016–2022 (hoofdversie 13–16): in CI (SQL Server 2022 op Linux)
 * gaf FORMSOF(INFLECTIONAL, …) daar alleen het woord zelf terug (lopen,
 * artikelen, rood); samenstellingen splitsen en accentongevoelig zoeken werkten
 * wel. SQL Server 2025 geeft wel vervoegingen. Onbekend (null): geen oude stemmer.
 */
export function heeftOudeStemmer(hoofdversie: number | null | undefined): boolean {
  return typeof hoofdversie === "number" && hoofdversie < HOOFDVERSIE_MET_VERVOEGINGEN;
}

export type ContainsOpties = {
  /**
   * Op SQL Server 2016–2022: elk woord (alleen letters, minstens 4) vindt ook
   * woorden die met zijn ruwe stam beginnen: (FORMSOF(…, "artikelen") OR "artikel*").
   * Nooit voor frases of uitsluitingen.
   */
  stamPrefix?: boolean;
};

/** Woorden en stammen korter dan dit krijgen geen stamprefix (te veel treffers). */
export const MIN_STAMPREFIX = 4;

function stamVoorPrefix(t: ZoekTerm): string | null {
  if (!t.vervoegbaar || t.negatief) return null;
  const woord = t.woorden[0];
  if (woord.length < MIN_STAMPREFIX) return null;
  const stam = ruweStam(woord);
  return stam.length >= MIN_STAMPREFIX ? stam : null;
}

/** Eén term in CONTAINS-syntax. Binnen "…" staan nooit " of * (zie NIET_TOEGESTAAN). */
export function termNaarContains(t: ZoekTerm, opties: ContainsOpties = {}): string {
  const kern = `"${t.woorden.join(" ")}"`;
  if (!t.vervoegbaar) return kern;
  const vormen = `FORMSOF(INFLECTIONAL, ${kern})`;
  // ruweStam bevat alleen letters (het woord is vervoegbaar), dus nooit " of *.
  const stam = opties.stamPrefix ? stamVoorPrefix(t) : null;
  return stam ? `(${vormen} OR "${stam}*")` : vormen;
}

/** De zoekvoorwaarde (filter): OR van groepen, binnen een groep AND / AND NOT. */
export function naarContains(groepen: ZoekGroep[], opties: ContainsOpties = {}): string | null {
  if (groepen.length === 0) return null;
  const delen = groepen.map((g) => {
    const positief = g.filter((t) => !t.negatief).map((t) => termNaarContains(t, opties));
    const negatief = g.filter((t) => t.negatief).map((t) => `AND NOT ${termNaarContains(t, opties)}`);
    return [positief.join(" AND "), ...negatief].join(" ");
  });
  return delen.length === 1 ? delen[0] : delen.map((d) => `(${d})`).join(" OR ");
}

/**
 * Voorwaarde voor de bonus op titel en excerpt: elke positieve term telt
 * (OR), zodat ook een titel met maar één van de zoekwoorden hoger komt.
 */
export function naarBonus(groepen: ZoekGroep[], opties: ContainsOpties = {}): string | null {
  const termen = new Map<string, string>();
  for (const g of groepen) {
    for (const t of g) if (!t.negatief) termen.set(sleutel(t), termNaarContains(t, opties));
  }
  return termen.size ? [...termen.values()].join(" OR ") : null;
}

// ---------------------------------------------------------------- LIKE-terugval

/** Escape voor LIKE … ESCAPE '!': de jokertekens % _ [ en het escapeteken zelf. */
export function escapeLike(s: string): string {
  return s.replace(/[!%_[]/g, (c) => `!${c}`);
}

/**
 * Heel ruwe Nederlandse stam, voor de LIKE-terugval (zonder full-text is er
 * geen stemmer) en voor het stamprefix op SQL Server 2016–2022 (de stemmer
 * daar geeft geen woordvormen): meervoud op -en/-s eraf, verdubbelde
 * medeklinker terug ("pakketten" → "pakket"). Omdat LIKE (en "stam*") op het
 * begin of een deel van een woord zoekt, vindt "artikel" dan ook "artikelen".
 */
export function ruweStam(woord: string): string {
  const w = woord.toLowerCase();
  if (w.length >= 5 && w.endsWith("en")) {
    let stam = w.slice(0, -2);
    if (/([bdfgklmnprst])\1$/.test(stam)) stam = stam.slice(0, -1);
    return stam.length >= 3 ? stam : w;
  }
  if (w.length >= 5 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export type LikePlan = {
  /** OR van groepen; binnen een groep moeten alle `verplicht` en geen `uitgesloten` passen. */
  groepen: { verplicht: string[]; uitgesloten: string[] }[];
  /** Patronen voor de gewogen rangschikking (titel, excerpt, inhoud). */
  rang: string[];
};

function likePatroon(t: ZoekTerm): string {
  const tekst = t.vervoegbaar ? ruweStam(t.woorden[0]) : t.woorden.join(" ");
  return `%${escapeLike(tekst)}%`;
}

export function naarLike(groepen: ZoekGroep[]): LikePlan | null {
  if (groepen.length === 0) return null;
  const rang = new Set<string>();
  const plan = groepen.map((g) => {
    const verplicht = g.filter((t) => !t.negatief).map(likePatroon);
    verplicht.forEach((p) => rang.add(p));
    return { verplicht, uitgesloten: g.filter((t) => t.negatief).map(likePatroon) };
  });
  return { groepen: plan, rang: [...rang] };
}
