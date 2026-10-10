/**
 * Citations: finding "[File name, p. 4]" references in an answer and linking
 * them to real documents.
 *
 * The AI is instructed to cite every claim as `[<file name>, p. <page>]`.
 * After an answer is complete, the server runs `extractCitations` to resolve
 * each reference to a document id, and sends the list to the browser. The
 * browser uses `linkifyCitations` to turn the references into clickable chips
 * that open the cited page in the viewer.
 *
 * Shared by client and server — keep it free of server-only imports.
 */

export interface Citation {
  /** The exact text found in the answer, e.g. "[Q3_Report.pdf, p. 4]". */
  label: string;
  /** File name as written by the AI. */
  fileName: string;
  /** 1-based page number. */
  page: number;
  /** Matching document id, or null if no uploaded file matches the name. */
  documentId: string | null;
}

/** Minimal document info needed to resolve a citation. */
export interface CitableDocument {
  id: string;
  fileName: string;
}

/**
 * Matches "[Q3 Report.pdf, p. 4]", "[Q3 Report.pdf, page 4]",
 * "[Q3 Report, Page 4]" and ranges like "[Deck.pdf, pp. 4-5]" (first page wins).
 */
const CITATION_PATTERN = /\[([^[\]\n]{1,200}?),\s*(?:pp?\.|pages?|pg\.?)\s*(\d{1,5})(?:\s*[-–]\s*\d{1,5})?\]/gi;

/** Lower-case, drop the extension and anything that isn't a letter or digit. */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Find the uploaded document a cited file name refers to. */
function resolveDocument(fileName: string, documents: CitableDocument[]): string | null {
  const wanted = normalizeName(fileName);
  if (!wanted) return null;

  const exact = documents.find((doc) => normalizeName(doc.fileName) === wanted);
  if (exact) return exact.id;

  // The AI sometimes shortens long names; accept an unambiguous prefix match.
  const partial = documents.filter((doc) => {
    const name = normalizeName(doc.fileName);
    return name.startsWith(wanted) || wanted.startsWith(name);
  });
  return partial.length === 1 ? partial[0].id : null;
}

/** All citations in `text`, de-duplicated, in order of first appearance. */
export function extractCitations(text: string, documents: CitableDocument[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const [label, rawName, rawPage] = match;
    if (seen.has(label)) continue;
    seen.add(label);

    const fileName = rawName.trim();
    citations.push({
      label,
      fileName,
      page: Number(rawPage),
      documentId: resolveDocument(fileName, documents),
    });
  }
  return citations;
}

/** Prefix used for citation links inside rendered Markdown: "#cite:<index>". */
export const CITATION_HREF_PREFIX = "#cite:";

/** Read the citation index back out of a "#cite:<index>" link. */
export function parseCitationHref(href: string): number | null {
  if (!href.startsWith(CITATION_HREF_PREFIX)) return null;
  const index = Number(href.slice(CITATION_HREF_PREFIX.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * Replace every citation in Markdown text with a Markdown link pointing at its
 * position in `citations` ("#cite:0", "#cite:1", …), so the renderer can draw
 * it as a clickable tab.
 */
export function linkifyCitations(text: string, citations: Citation[]): string {
  if (citations.length === 0) return text;
  const indexByLabel = new Map(citations.map((citation, index) => [citation.label, index]));

  return text.replace(CITATION_PATTERN, (label) => {
    const index = indexByLabel.get(label);
    if (index === undefined) return label;
    const citation = citations[index];
    const linkText = `${citation.fileName} p. ${citation.page}`.replace(/[[\]]/g, "");
    return `[${linkText}](${CITATION_HREF_PREFIX}${index})`;
  });
}
