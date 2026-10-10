/**
 * Word (.docx) → Markdown-like text, split into page-sized sections.
 * mammoth converts the document to HTML (keeping headings, lists and
 * tables); we then turn that HTML into readable Markdown.
 */
import "server-only";
import mammoth from "mammoth";
import { splitIntoSections } from "./split";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Turn one HTML table into a Markdown table. */
function tableToMarkdown(tableHtml: string): string {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => stripTags(cell[1]).replace(/\|/g, "/")),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}

function htmlToMarkdown(html: string): string {
  return decode(
    html
      .replace(/<table[\s\S]*?<\/table>/g, (table) => `\n\n${tableToMarkdown(table)}\n\n`)
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, level, text) => `\n\n${"#".repeat(Number(level))} ${stripTags(text)}\n\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, text) => `\n- ${stripTags(text)}`)
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/g, "_$2_")
      .replace(/<\/p>|<br\s*\/?>/g, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocx(data: Uint8Array): Promise<string[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
  return splitIntoSections(htmlToMarkdown(html));
}
