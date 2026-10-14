/**
 * Email content for what n8n sends (report results, reminders, task emails).
 *
 * The app writes the email; n8n only delivers it through the SMTP account
 * set up there. Reports are Markdown, so they're converted to simple, safe
 * HTML here (headings, bold/italic, lists, tables, paragraphs), with a plain
 * text version alongside for mail clients that prefer it.
 */
import "server-only";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, '<code style="background:#f3f1ec;padding:0 3px;border-radius:3px">$1</code>')
    .replace(/\[([^\]]+?, p\. ?\d+[^\]]*)\]/g, '<span style="color:#8a6d3b;font-size:12px">[$1]</span>');
}

const CELL = 'style="border:1px solid #ddd8cc;padding:6px 8px;text-align:left;vertical-align:top"';

/** Small Markdown → HTML conversion for emails (no scripts, no raw HTML passes through). */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p style="margin:0 0 12px">${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag} style="margin:0 0 12px;padding-left:22px">${list.items.map((i) => `<li style="margin:2px 0">${inline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // GFM table: header row, separator row, body rows.
    if (trimmed.startsWith("|") && /^\|?\s*:?-{2,}/.test(lines[i + 1]?.trim() ?? "")) {
      flushParagraph();
      flushList();
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      out.push(
        `<table style="border-collapse:collapse;margin:0 0 12px;font-size:13px"><thead><tr>${header
          .map((c) => `<th ${CELL}>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td ${CELL}>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);

    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const size = [20, 17, 15, 14][heading[1].length - 1];
      out.push(`<h${heading[1].length + 1} style="font-size:${size}px;margin:16px 0 8px">${inline(heading[2])}</h${heading[1].length + 1}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      out.push('<hr style="border:none;border-top:1px solid #ddd8cc;margin:16px 0">');
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();
  return out.join("\n");
}

/** A complete email in the app's style, with a link back to the app. */
export function buildEmail(input: { to: string; subject: string; heading: string; markdown: string; footer?: string }): EmailMessage {
  const link = env.APP_PUBLIC_URL;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f1d1a">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a8478;margin-bottom:8px">Executive Agent</div>
  <div style="background:#fff;border:1px solid #e6e1d6;border-radius:10px;padding:24px;font-size:14px;line-height:1.55">
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.heading)}</h1>
    ${markdownToHtml(input.markdown)}
  </div>
  <div style="font-size:12px;color:#8a8478;margin-top:12px">${input.footer ? `${escapeHtml(input.footer)} · ` : ""}<a href="${escapeHtml(link)}" style="color:#8a6d3b">Open Executive Agent</a></div>
</div></body></html>`;
  const text = `${input.heading}\n\n${input.markdown}\n\n${input.footer ? `${input.footer}\n` : ""}Open Executive Agent: ${link}\n`;
  return { to: input.to, subject: input.subject, text, html };
}
