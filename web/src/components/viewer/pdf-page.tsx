"use client";

/**
 * Renders one page of a PDF with pdf.js (via react-pdf), including the text
 * layer so the CEO can select and copy text from the cited page.
 *
 * Browser-only: import it with next/dynamic and `ssr: false`.
 */
// Must load before pdf.js: adds JavaScript methods older browsers lack.
import "@/lib/polyfills/map-upsert";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Must be set in the same module that renders <Document> (see react-pdf docs).
// The "legacy" worker build supports a wider range of browsers (incl. older Safari).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfPageProps {
  url: string;
  page: number;
  onPageCount: (count: number) => void;
}

export default function PdfPage({ url, page, onPageCount }: PdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  // Fit the page to the panel width, and re-fit when the panel is resized.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => onPageCount(numPages)}
        loading={<p className="py-10 text-center text-sm text-slate">Opening document…</p>}
        error={<p className="py-10 text-center text-sm text-alert">This PDF couldn&apos;t be displayed.</p>}
      >
        {width && (
          <Page
            pageNumber={page}
            width={width}
            className="overflow-hidden rounded-sm shadow-[0_1px_3px_rgba(24,33,43,0.18),0_8px_24px_rgba(24,33,43,0.10)]"
            loading={<div className="aspect-[1/1.3] w-full animate-pulse bg-surface" />}
            error={<p className="py-10 text-center text-sm text-alert">Page {page} doesn&apos;t exist in this file.</p>}
          />
        )}
      </Document>
    </div>
  );
}
