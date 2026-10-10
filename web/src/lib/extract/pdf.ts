/** Text of every page of a PDF, using pdf.js (no external service). */
import "server-only";

export async function extractPdf(data: Uint8Array): Promise<string[]> {
  // Loaded lazily: pdf.js is large. On the server pdf.js runs its "worker" in
  // the same thread; handing it the worker module up front also makes sure the
  // production build includes it.
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      pages.push(text);
    }
    return pages;
  } finally {
    await loadingTask.destroy(); // free pdf.js memory
  }
}
