// Welke pagina's zonder login bereikbaar zijn. Alles wat hier niet staat, vraagt
// een login (standaard dicht): een nieuwe route is dus automatisch beschermd.
// Geen imports van server-code: de proxy gebruikt dit bestand.

/** Inlogpagina's: wie al ingelogd is, gaat door naar de artikelen. */
export const AUTH_PAGINAS = ["/inloggen", "/registreren", "/wachtwoord-vergeten"];

/** Altijd bereikbaar, ingelogd of niet. */
export const OPEN_PAGINAS = ["/uitnodiging", "/wachtwoord-herstellen", "/status"];

function past(pad: string, prefix: string) {
  return pad === prefix || pad.startsWith(`${prefix}/`);
}

export function isAuthPagina(pad: string) {
  return AUTH_PAGINAS.some((p) => past(pad, p));
}

export function isOpenPagina(pad: string) {
  return OPEN_PAGINAS.some((p) => past(pad, p));
}
