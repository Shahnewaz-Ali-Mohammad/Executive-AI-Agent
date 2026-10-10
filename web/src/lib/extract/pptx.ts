/**
 * PowerPoint (.pptx) → one page per slide.
 * A .pptx file is a zip of XML files; the slide text lives in <a:t> elements,
 * grouped into paragraphs by <a:p>. Speaker notes are added when present,
 * since executives' decks often keep the real numbers there.
 */
import "server-only";
import JSZip from "jszip";

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** All paragraphs of text in one slide (or notes) XML file. */
function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
    .map((paragraph) => [...paragraph[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((run) => decode(run[1])).join(""))
    .map((text) => text.trim())
    .filter(Boolean);
}

/** Slide files sorted by number: slide1.xml, slide2.xml, … slide10.xml. */
function slideNumber(path: string): number {
  return Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

export async function extractPptx(data: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const pages: string[] = [];
  for (const path of slidePaths) {
    const number = slideNumber(path);
    const text = paragraphs(await zip.file(path)!.async("string"));
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${number}.xml`);
    // Notes include the slide number placeholder; drop bare numbers.
    const notes = notesFile ? paragraphs(await notesFile.async("string")).filter((line) => !/^\d+$/.test(line)) : [];

    const lines = [`## Slide ${number}`, "", ...text];
    if (notes.length > 0) lines.push("", "Speaker notes:", ...notes);
    pages.push(lines.join("\n"));
  }
  return pages;
}
