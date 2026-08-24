"use client";

import { FileDown, Link2, Mail } from "lucide-react";
import { generateHTML } from "@tiptap/html";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { serverExtensions } from "@/components/editor/extensions/server";
import { slugify } from "@/lib/utils";
import { toast } from "sonner";
import type { ArticleWithRelations } from "@/types";

interface MailArticleMenuProps {
  article: ArticleWithRelations;
  senderName: string;
}

export function MailArticleMenu({ article, senderName }: MailArticleMenuProps) {
  function articleUrl() {
    return `${window.location.origin}/artikelen/${article.slug}`;
  }

  // Opent het standaard mailprogramma (bijv. Outlook) met een nieuw bericht:
  // titel, samenvatting en link. mailto: kan geen opmaak of bijlagen meegeven.
  function handleMailLink() {
    const subject = `Artikel: ${article.title}`;
    const body = [
      "Bekijk dit artikel in Know-How Space:",
      "",
      article.title,
      ...(article.excerpt ? [article.excerpt] : []),
      "",
      articleUrl(),
    ].join("\n");

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  // Downloadt een .eml-bestand met het volledige opgemaakte artikel.
  // X-Unsent: 1 laat (klassiek) Outlook het openen als bewerkbaar concept.
  function handleDownloadEml() {
    let contentHtml: string;
    try {
      contentHtml = generateHTML(
        article.content as Parameters<typeof generateHTML>[0],
        serverExtensions
      );
    } catch {
      toast.error("Kon artikelinhoud niet converteren");
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="nl">
<body style="margin: 0; padding: 0;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px;">
    <h1 style="color: #1A4C58; font-size: 28px; font-weight: 700; margin: 0 0 8px 0;">${escapeHtml(article.title)}</h1>
    ${article.excerpt ? `<p style="color: #666; font-size: 16px; margin: 0 0 16px 0; line-height: 1.5;">${escapeHtml(article.excerpt)}</p>` : ""}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
    <div style="font-size: 15px; line-height: 1.7; color: #333;">${contentHtml}</div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px 0;" />
    <p style="color: #999; font-size: 12px; margin: 0;">Gedeeld door ${escapeHtml(senderName)} via Know-How Space &mdash; <a href="${articleUrl()}">bekijk online</a></p>
  </div>
</body>
</html>`;

    const eml = [
      "X-Unsent: 1",
      `Subject: ${encodeSubject(`Artikel: ${article.title}`)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      toBase64Lines(html),
    ].join("\r\n");

    const blob = new Blob([eml], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(article.title)}.eml`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("Concept gedownload — open het bestand in Outlook");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="mr-2 h-4 w-4" />
          Mailen
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onClick={handleMailLink}>
          <Link2 className="mr-2 h-4 w-4" />
          <div>
            <div>Nieuw bericht met link</div>
            <div className="text-xs text-muted-foreground">
              Opent je mailprogramma; ontvanger leest op de site
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadEml}>
          <FileDown className="mr-2 h-4 w-4" />
          <div>
            <div>Volledig artikel als Outlook-concept</div>
            <div className="text-xs text-muted-foreground">
              Downloadt een .eml-bestand met de hele inhoud
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// RFC 2047 encoded-word, zodat accenten in de onderwerpregel goed aankomen.
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(subject))}?=`;
}

// Base64 met regels van 76 tekens (RFC 2045) en CRLF, zoals .eml verwacht.
function toBase64Lines(text: string): string {
  const base64 = bytesToBase64(new TextEncoder().encode(text));
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? base64;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
