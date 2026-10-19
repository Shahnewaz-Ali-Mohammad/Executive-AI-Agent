"use client";

/**
 * The source viewer: shows the exact page an answer cites, so the CEO can
 * check the claim in one click.
 *
 *  - PDFs:   the real page, rendered on a "desk" background
 *  - Images: the photo or scan itself
 *  - Others: (Word, Excel, PowerPoint) the parsed text of that page
 * For every type, the text the AI actually read is available underneath.
 *
 * On wide screens it sits beside the chat; on phones it covers the screen.
 */
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconButton } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { isImage, isPdf } from "@/lib/file-types";
import type { DocumentDTO } from "@/lib/types";

// pdf.js only runs in the browser.
const PdfPage = dynamic(() => import("./pdf-page"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-slate">Opening document…</p>,
});

interface SourceViewerProps {
  document: DocumentDTO | undefined;
  /** The workspace's documents are still loading (so "not found" isn't known yet). */
  loading?: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

type PageText = { status: "loading" } | { status: "loaded"; content: string } | { status: "error"; message: string };

/** A page-text result, remembered together with the page it belongs to. */
type LoadedPageText = { page: number; text: PageText };

export function SourceViewer({ document, loading = false, page, onPageChange, onClose }: SourceViewerProps) {
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<LoadedPageText | null>(null);

  const documentId = document?.id;
  const pageCount = pdfPageCount ?? document?.pageCount ?? null;

  // Load the parsed text of the current page. Until it arrives, the result we
  // hold belongs to another page, so we show "loading".
  const pageText: PageText = loaded?.page === page ? loaded.text : { status: "loading" };
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    api
      .getDocumentPage(documentId, page)
      .then((result) => !cancelled && setLoaded({ page, text: { status: "loaded", content: result.content } }))
      .catch((err) => !cancelled && setLoaded({ page, text: { status: "error", message: err.message } }));
    return () => {
      cancelled = true;
    };
  }, [documentId, page]);

  if (!document && loading) {
    return (
      <ViewerFrame title="Opening…" onClose={onClose}>
        <p className="p-6 text-sm text-slate">Opening document…</p>
      </ViewerFrame>
    );
  }
  if (!document) {
    return (
      <ViewerFrame title="Source not found" onClose={onClose}>
        <p className="p-6 text-sm text-slate">This document has been deleted or moved to another workspace.</p>
      </ViewerFrame>
    );
  }

  const fileUrl = api.documentFileUrl(document.id);
  const canGoBack = page > 1;
  const canGoForward = pageCount === null || page < pageCount;
  const showsOriginal = isPdf(document.mimeType) || isImage(document.mimeType);

  return (
    <ViewerFrame
      title={document.fileName}
      onClose={onClose}
      toolbar={
        <>
          <IconButton aria-label="Previous page" disabled={!canGoBack} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <span className="min-w-16 text-center text-xs tabular-nums text-slate" aria-live="polite">
            Page {page}
            {pageCount ? ` of ${pageCount}` : ""}
          </span>
          <IconButton aria-label="Next page" disabled={!canGoForward} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="size-4" />
          </IconButton>
          <a
            href={`${fileUrl}?download=1`}
            title="Download original"
            aria-label="Download original"
            className="inline-flex size-9 items-center justify-center rounded-md text-slate hover:bg-paper hover:text-ink"
          >
            <Download className="size-4" />
          </a>
        </>
      }
    >
      <div className="bg-desk px-4 py-5 sm:px-6">
        {isPdf(document.mimeType) && <PdfPage url={fileUrl} page={page} onPageCount={setPdfPageCount} />}
        {isImage(document.mimeType) && (
          // eslint-disable-next-line @next/next/no-img-element -- private file behind login; next/image can't optimise it
          <img src={fileUrl} alt={document.fileName} className="mx-auto max-h-[70vh] rounded-sm shadow-md" />
        )}
        {!showsOriginal && <PageTextBlock text={pageText} emphasised />}
      </div>

      {showsOriginal && (
        <details className="group border-t border-rule">
          <summary className="cursor-pointer px-5 py-3 text-sm text-slate hover:text-ink">
            Text the assistant read from this page
          </summary>
          <div className="px-5 pb-6">
            <PageTextBlock text={pageText} />
          </div>
        </details>
      )}
    </ViewerFrame>
  );
}

function PageTextBlock({ text, emphasised }: { text: PageText; emphasised?: boolean }) {
  if (text.status === "loading") return <p className="text-sm text-slate">Loading page text…</p>;
  if (text.status === "error") return <p className="text-sm text-alert">{text.message}</p>;
  if (!text.content.trim()) return <p className="text-sm text-slate">No text was found on this page.</p>;
  return (
    <div className={emphasised ? "briefing mx-auto rounded-sm bg-surface p-6 shadow-md" : "briefing text-[0.95rem]"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text.content}</ReactMarkdown>
    </div>
  );
}

/** Header (title, toolbar, close) and scrollable body shared by all states. */
function ViewerFrame({
  title,
  toolbar,
  onClose,
  children,
}: {
  title: string;
  toolbar?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label="Source document" className="flex h-full flex-col bg-surface">
      <header className="flex items-center gap-1 border-b border-rule px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-ink" title={title}>
          {title}
        </h2>
        {toolbar}
        <IconButton aria-label="Close source" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
