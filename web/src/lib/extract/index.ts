/**
 * Reading uploaded files into page-by-page text — locally, for free.
 *
 * Every upload passes through `extractPages` before it is indexed:
 *
 *   PDF with real text  → one page per PDF page (pdf.js)
 *   Word (.docx)        → sections of about one printed page
 *   Excel (.xlsx)       → one page per worksheet, as a Markdown table
 *   PowerPoint (.pptx)  → one page per slide
 *   CSV / text          → sections of about one printed page
 *   Photos and scans    → no text here: `needsVision` is set, and the n8n
 *                         workflow asks OpenAI's vision model to read them
 *
 * Page numbers matter: they become the "p. N" in every citation.
 */
import "server-only";
import { extractDocx } from "./docx";
import { extractPdf } from "./pdf";
import { extractPptx } from "./pptx";
import { splitIntoSections } from "./split";
import { extractXlsx } from "./xlsx";

export interface ExtractedDocument {
  /** Text of each page, in order (page 1 = index 0). */
  pages: string[];
  /**
   * True when the file has little or no machine-readable text (a scan or a
   * photo), so the text must come from OpenAI's vision model instead.
   */
  needsVision: boolean;
}

/** A PDF page with fewer characters than this probably is a scanned image. */
const MIN_TEXT_PER_PAGE = 40;

/** Decide whether a PDF is (mostly) scanned. */
function looksScanned(pages: string[]): boolean {
  if (pages.length === 0) return true;
  const nearlyEmpty = pages.filter((page) => page.trim().length < MIN_TEXT_PER_PAGE).length;
  return nearlyEmpty / pages.length > 0.3;
}

export async function extractPages(file: {
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}): Promise<ExtractedDocument> {
  const { mimeType, data } = file;

  if (mimeType === "application/pdf") {
    const pages = await extractPdf(data);
    return { pages, needsVision: looksScanned(pages) };
  }
  if (mimeType.startsWith("image/")) {
    return { pages: [], needsVision: true };
  }
  if (mimeType.includes("wordprocessingml")) {
    return { pages: await extractDocx(data), needsVision: false };
  }
  if (mimeType.includes("spreadsheetml")) {
    return { pages: await extractXlsx(data), needsVision: false };
  }
  if (mimeType.includes("presentationml")) {
    return { pages: await extractPptx(data), needsVision: false };
  }
  if (mimeType.startsWith("text/")) {
    return { pages: splitIntoSections(new TextDecoder().decode(data)), needsVision: false };
  }
  throw new Error(`Files of type ${mimeType} can't be read.`);
}
