"use server";

import { Resend } from "resend";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import type { ActionResult } from "@/types";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendArticleByEmail(data: {
  to: string;
  articleTitle: string;
  articleContent: Record<string, unknown>;
  articleExcerpt: string | null;
  senderName: string;
}): Promise<ActionResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "Email service is niet geconfigureerd (RESEND_API_KEY ontbreekt)" };
  }

  if (!data.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)) {
    return { success: false, error: "Ongeldig emailadres" };
  }

  // Generate HTML from Tiptap JSON using server-compatible extensions
  const extensions = [
    StarterKit.configure({ codeBlock: false }),
    Image,
    Link,
    Underline,
  ];

  let contentHtml: string;
  try {
    contentHtml = generateHTML(data.articleContent as Parameters<typeof generateHTML>[0], extensions);
  } catch {
    return { success: false, error: "Kon artikelinhoud niet converteren naar HTML" };
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px;">
      <h1 style="color: #1A4C58; font-size: 28px; font-weight: 700; margin: 0 0 8px 0;">
        ${escapeHtml(data.articleTitle)}
      </h1>
      ${data.articleExcerpt ? `<p style="color: #666; font-size: 16px; margin: 0 0 16px 0; line-height: 1.5;">${escapeHtml(data.articleExcerpt)}</p>` : ""}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <div style="font-size: 15px; line-height: 1.7; color: #333;">
        ${contentHtml}
      </div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px 0;" />
      <p style="color: #999; font-size: 12px; margin: 0;">
        Verstuurd door ${escapeHtml(data.senderName)} via Know-How Space
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: "Know-How Space <onboarding@resend.dev>",
      to: data.to,
      subject: `Artikel: ${data.articleTitle}`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Fout bij het versturen van de email" };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
