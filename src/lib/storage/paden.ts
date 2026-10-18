import type { Bucket } from "./types";

// Gedeelde regels voor opslagpaden. Alleen paden zoals de app ze zelf maakt:
// mappen van [A-Za-z0-9_-] en een bestandsnaam "naam.ext". Zo kan een pad met
// bv. "..", een (gecodeerde) backslash, "?" of "#" nooit ergens anders uitkomen.

export const BUCKETS: Bucket[] = ["articles", "avatars"];

/** Grootste stuk dat één antwoord op een bereikaanvraag teruggeeft (4 MiB). */
export const MAX_DEEL = 4 * 1024 * 1024;

export const VEILIG_PAD = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export function isGeldigBestand(bucket: string, pad: string): bucket is Bucket {
  return BUCKETS.includes(bucket as Bucket) && VEILIG_PAD.test(pad);
}

/** Waar de app een bestand uit de eigen opslag (database of map) serveert. */
export const BESTANDEN_PREFIX = "/api/bestanden/";

export function eigenBestandUrl(bucket: Bucket, pad: string): string {
  return `${BESTANDEN_PREFIX}${bucket}/${pad}`;
}

/**
 * Herkent "/api/bestanden/<bucket>/<pad>" (relatief, of absoluut op de eigen
 * host) en geeft bucket en pad terug.
 */
export function parseEigenBestandUrl(
  url: string,
  siteUrl: string | undefined
): { bucket: Bucket; pad: string } | null {
  // Backslashes, spaties en stuurtekens weigeren: de URL-parser (en de
  // browser) maakt van bv. "/\host/..." of "/<tab>/host/..." een andere host.
  if (/[\\\u0000- \u007f]/.test(url)) return null;

  let pathname: string;
  try {
    if (url.startsWith("/")) {
      if (url.startsWith("//")) return null;
      const u = new URL(url, "http://intern");
      if (u.origin !== "http://intern" || u.search || u.hash) return null;
      pathname = u.pathname;
    } else {
      const u = new URL(url);
      if (!siteUrl || u.origin !== new URL(siteUrl).origin) return null;
      if (u.search || u.hash) return null;
      pathname = u.pathname;
    }
  } catch {
    return null;
  }
  if (!pathname.startsWith(BESTANDEN_PREFIX)) return null;

  let rest: string;
  try {
    rest = decodeURIComponent(pathname.slice(BESTANDEN_PREFIX.length));
  } catch {
    return null;
  }
  const [bucket, ...delen] = rest.split("/");
  const pad = delen.join("/");
  return isGeldigBestand(bucket, pad) ? { bucket, pad } : null;
}

const MIME_PER_EXTENSIE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
};

export function mimeVoorPad(pad: string): string {
  const ext = pad.split(".").pop()?.toLowerCase() ?? "";
  return MIME_PER_EXTENSIE[ext] ?? "application/octet-stream";
}
