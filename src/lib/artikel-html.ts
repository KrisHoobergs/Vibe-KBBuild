import type { JSONContent } from "@tiptap/core";

// Voorbereiding van de Tiptap-inhoud vóór generateHTML (leesweergave,
// afdrukken, mail), zodat de HTML er hetzelfde uitziet als in de editor.
// Geen imports van Tiptap zelf: ook de afbeeldingsroute gebruikt dit.

/**
 * In de editor zet ProseMirror na een harde return (Shift+Enter) aan het einde
 * van een alinea nog een extra <br>, zodat die lege regel zichtbaar blijft. In
 * gewone HTML valt hij weg. Daarom hier nog een hardBreak erbij.
 */
export function metSlotBreak(node: JSONContent): JSONContent {
  if (!node.content) return node;
  const kinderen = node.content.map(metSlotBreak);
  const laatste = kinderen[kinderen.length - 1];
  if (laatste?.type === "hardBreak") {
    kinderen.push({ type: "hardBreak", ...(laatste.marks ? { marks: laatste.marks } : {}) });
  }
  return { ...node, content: kinderen };
}

// Base64-afbeeldingen (oude geplakte schermafbeeldingen) in de inhoud. Bewust
// alleen deze vier types: een SVG op ons eigen adres zou scripts kunnen bevatten.
const DATA_AFBEELDING = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/;

function isDataAfbeelding(node: JSONContent): node is JSONContent & { attrs: { src: string } } {
  return node.type === "image" && typeof node.attrs?.src === "string" && DATA_AFBEELDING.test(node.attrs.src);
}

/** Alle base64-afbeeldingen, in de volgorde van het document. */
export function dataAfbeeldingen(doc: JSONContent): string[] {
  const lijst: string[] = [];
  const bezoek = (node: JSONContent) => {
    if (isDataAfbeelding(node)) lijst.push(node.attrs.src);
    node.content?.forEach(bezoek);
  };
  bezoek(doc);
  return lijst;
}

/**
 * Kopie van het document waarin de n-de base64-afbeelding de URL `url(n)`
 * krijgt (dezelfde volgorde als dataAfbeeldingen). Zo blijft de pagina klein,
 * en laadt en cachet de browser de afbeeldingen apart.
 */
export function metAfbeeldingUrls(doc: JSONContent, url: (n: number) => string): JSONContent {
  let n = 0;
  const vervang = (node: JSONContent): JSONContent => {
    const kopie = isDataAfbeelding(node) ? { ...node, attrs: { ...node.attrs, src: url(n++) } } : node;
    return kopie.content ? { ...kopie, content: kopie.content.map(vervang) } : kopie;
  };
  return vervang(doc);
}

/** Het echte type uit de eerste bytes (sommige geplakte GIF's heten "image/png"). */
function echtType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** De bytes en het type van een base64-afbeelding, of null. */
export function decodeerDataAfbeelding(src: string): { type: string; bytes: Buffer } | null {
  const m = DATA_AFBEELDING.exec(src);
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  return { type: echtType(bytes) ?? m[1], bytes };
}
