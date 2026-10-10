/**
 * Split long text with no natural pages (Word, plain text, CSV) into
 * "sections" of about one printed page, so citations like "p. 3" still point
 * to a specific, readable part of the document.
 */

/** Roughly one printed page of text. */
export const SECTION_SIZE = 3000;

export function splitIntoSections(text: string, size = SECTION_SIZE): string[] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const sections: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    // Start a new section rather than cut a paragraph in half...
    if (current && current.length + paragraph.length + 2 > size) {
      sections.push(current);
      current = "";
    }
    // ...unless a single paragraph is longer than a whole section.
    if (paragraph.length > size) {
      for (let i = 0; i < paragraph.length; i += size) sections.push(paragraph.slice(i, i + size));
      continue;
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) sections.push(current);
  return sections;
}
