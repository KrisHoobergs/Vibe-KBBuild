import "server-only";
// Expliciet de servervariant: "@tiptap/html" kiest anders op basis van
// export-condities, en de browservariant werkt niet in Node.
import { generateHTML } from "@tiptap/html/server";
import { imageSize } from "image-size";
import { serverExtensions } from "@/components/editor/extensions/server";
import { APP_NAME } from "@/lib/constants";
import type { ArticleWithRelations } from "@/types";

/** Breedste afbeelding in de mail; klassiek Outlook negeert max-width. */
const MAX_IMAGE_WIDTH = 600;
/** Gmail laat 25 MB per mail toe; houd marge voor de HTML en de codering. */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

export interface ArticleEmail {
  html: string;
  text: string;
  attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
    cid: string;
  }[];
}

/**
 * Bouwt de mail voor een artikel: opgemaakte HTML met ingesloten
 * afbeeldingen (CID), plus een tekstversie.
 */
export async function buildArticleEmail(params: {
  article: ArticleWithRelations;
  senderName: string;
  message?: string;
  articleUrl: string;
}): Promise<ArticleEmail> {
  const { article, senderName, message, articleUrl } = params;

  let contentHtml = "";
  if (Object.keys(article.content).length > 0) {
    contentHtml = generateHTML(
      article.content as Parameters<typeof generateHTML>[0],
      serverExtensions
    );
  } else if (article.content_text) {
    contentHtml = `<p style="white-space: pre-wrap;">${escapeHtml(article.content_text)}</p>`;
  }

  const { html: bodyHtml, attachments } = await embedImages(contentHtml);

  const messageHtml = message
    ? `<div style="background: #f3f4f6; border-radius: 6px; padding: 12px 16px; margin: 0 0 24px 0;">
      <p style="color: #5A7A83; font-size: 13px; margin: 0 0 4px 0;">Bericht van ${escapeHtml(senderName)}:</p>
      <p style="color: #333; font-size: 15px; line-height: 1.5; margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px;">
    ${messageHtml}
    <h1 style="color: #1A4C58; font-size: 28px; font-weight: 700; margin: 0 0 8px 0;">${escapeHtml(article.title)}</h1>
    ${article.excerpt ? `<p style="color: #666; font-size: 16px; margin: 0 0 16px 0; line-height: 1.5;">${escapeHtml(article.excerpt)}</p>` : ""}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
    <div style="font-size: 15px; line-height: 1.7; color: #333;">${bodyHtml}</div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px 0;" />
    <p style="color: #999; font-size: 12px; margin: 0;">Gedeeld door ${escapeHtml(senderName)} via ${APP_NAME}. Heb je toegang tot de kennisbank? <a href="${escapeHtml(articleUrl)}">Open het artikel online</a>.</p>
  </div>
</body>
</html>`;

  const text = [
    ...(message ? [`Bericht van ${senderName}:`, message, "", "---", ""] : []),
    article.title,
    ...(article.excerpt ? [article.excerpt] : []),
    "",
    article.content_text,
    "",
    "--",
    `Gedeeld door ${senderName} via ${APP_NAME}.`,
    `Heb je toegang tot de kennisbank? ${articleUrl}`,
  ].join("\n");

  return { html, text, attachments };
}

/**
 * Vervangt afbeeldingen door CID-bijlagen, zodat ze niet als externe link
 * geblokkeerd worden, en geeft ze een vaste breedte voor klassiek Outlook.
 * Alleen data:-afbeeldingen en afbeeldingen uit onze eigen Supabase Storage
 * worden opgehaald, nooit willekeurige URL's.
 */
async function embedImages(html: string): Promise<{
  html: string;
  attachments: ArticleEmail["attachments"];
}> {
  const attachments: ArticleEmail["attachments"] = [];
  const cidBySrc = new Map<string, { cid: string; width: number; height: number } | null>();
  let totalBytes = 0;

  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const src = decodeHtml(getAttribute(tag, "src") ?? "");
    if (!src || cidBySrc.has(src)) continue;

    const image = await loadImage(src);
    if (!image || totalBytes + image.content.length > MAX_INLINE_BYTES) {
      cidBySrc.set(src, null);
      continue;
    }

    let natural: { width?: number; height?: number } = {};
    try {
      natural = imageSize(image.content);
    } catch {
      // Onbekend formaat: dan zonder vaste afmetingen insluiten.
    }

    const styleWidth = Number(getAttribute(tag, "style")?.match(/width:\s*(\d+)px/)?.[1]);
    const naturalWidth = natural.width ?? MAX_IMAGE_WIDTH;
    const width = Math.min(styleWidth || naturalWidth, naturalWidth, MAX_IMAGE_WIDTH);
    const height = natural.width && natural.height
      ? Math.round((natural.height * width) / natural.width)
      : 0;

    const index = attachments.length + 1;
    const cid = `afbeelding-${index}@kennisbank`;
    attachments.push({
      filename: `afbeelding-${index}.${image.extension}`,
      content: image.content,
      contentType: image.contentType,
      cid,
    });
    totalBytes += image.content.length;
    cidBySrc.set(src, { cid, width, height });
  }

  const result = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = decodeHtml(getAttribute(tag, "src") ?? "");
    const embedded = cidBySrc.get(src);
    const alt = escapeHtml(decodeHtml(getAttribute(tag, "alt") ?? ""));
    const style = "display: block; max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0;";

    if (!embedded) {
      // Niet ingesloten (andere host of te groot): link laten staan.
      return `<img src="${escapeHtml(src)}" alt="${alt}" style="${style}" />`;
    }
    const size = `width="${embedded.width}"${embedded.height ? ` height="${embedded.height}"` : ""}`;
    return `<img src="cid:${embedded.cid}" alt="${alt}" ${size} style="${style}" />`;
  });

  return { html: result, attachments };
}

async function loadImage(src: string): Promise<{
  content: Buffer;
  contentType: string;
  extension: string;
} | null> {
  const dataUri = src.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataUri) {
    return {
      content: Buffer.from(dataUri[2], "base64"),
      contentType: dataUri[1],
      extension: extensionFor(dataUri[1]),
    };
  }

  if (!isOwnStorageUrl(src)) return null;

  try {
    const response = await fetch(src, { signal: AbortSignal.timeout(10_000) });
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return null;
    return {
      content: Buffer.from(await response.arrayBuffer()),
      contentType,
      extension: extensionFor(contentType),
    };
  } catch {
    return null;
  }
}

function isOwnStorageUrl(src: string): boolean {
  try {
    const url = new URL(src);
    const storageHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;
    return (
      url.protocol === "https:" &&
      url.host === storageHost &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

function extensionFor(contentType: string): string {
  const subtype = contentType.split("/")[1] ?? "png";
  return subtype === "jpeg" ? "jpg" : subtype.replace(/\+.*$/, "");
}

function getAttribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
