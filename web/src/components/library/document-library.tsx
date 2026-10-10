"use client";

/**
 * The workspace's uploaded files, built for a list that keeps growing:
 *
 *   - search by file name, and filter by kind (Images, PDFs, Office files)
 *   - photos and scans show a thumbnail of the real image; other files show
 *     a tile with their type (PDF, DOCX, XLSX …)
 *   - every file shows when it was uploaded (date and time) and its status
 *   - "Images" switches to a picture grid
 *
 * Selecting a file shows its digest and lets the CEO open or delete it.
 */
import { LayoutGrid, List, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { api } from "@/lib/api-client";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { fileTypeLabel, getExtension, isImage, isPdf } from "@/lib/file-types";
import type { DocumentDTO } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";
import { UploadDropzone } from "./upload-dropzone";

type Filter = "all" | "images" | "pdfs" | "office";

const FILTERS: { id: Filter; label: string; matches: (doc: DocumentDTO) => boolean }[] = [
  { id: "all", label: "All", matches: () => true },
  { id: "images", label: "Images", matches: (doc) => isImage(doc.mimeType) },
  { id: "pdfs", label: "PDFs", matches: (doc) => isPdf(doc.mimeType) },
  { id: "office", label: "Office", matches: (doc) => !isImage(doc.mimeType) && !isPdf(doc.mimeType) },
];

interface DocumentLibraryProps {
  documents: DocumentDTO[];
  loading: boolean;
  uploading: boolean;
  openDocumentId: string | null;
  onPickFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onOpen: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<void>;
}

export function DocumentLibrary({
  documents,
  loading,
  uploading,
  openDocumentId,
  onPickFiles,
  onDropFiles,
  onOpen,
  onDelete,
}: DocumentLibraryProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [grid, setGrid] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, documents.filter(f.matches).length])) as Record<Filter, number>,
    [documents],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = FILTERS.find((f) => f.id === filter)!.matches;
    return documents.filter((doc) => matches(doc) && (!needle || doc.fileName.toLowerCase().includes(needle)));
  }, [documents, filter, query]);

  // The picture grid only makes sense when every visible file is an image.
  const showGrid = grid && visible.length > 0 && visible.every((doc) => isImage(doc.mimeType));

  async function handleDelete(document: DocumentDTO) {
    if (window.confirm(`Delete "${document.fileName}"? It will no longer be used in answers.`)) {
      await onDelete(document.id);
    }
  }

  return (
    <div className="space-y-3">
      <div className="px-3">
        <UploadDropzone uploading={uploading} onPick={onPickFiles} onFiles={onDropFiles} />
      </div>

      {loading && documents.length === 0 && <p className="px-4 text-sm text-slate">Loading documents…</p>}
      {!loading && documents.length === 0 && (
        <p className="px-4 text-sm text-slate">No documents yet. Everything you add is listed here.</p>
      )}

      {documents.length > 0 && (
        <>
          <div className="space-y-2 px-3">
            <SearchField value={query} onChange={setQuery} placeholder="Search files" label="Search files" />
            <div className="flex items-center gap-1">
              <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" role="group" aria-label="Show">
                {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={cn(
                      "shrink-0 rounded-full px-2 py-1 text-xs whitespace-nowrap transition-colors",
                      filter === f.id ? "bg-ink text-paper" : "text-slate hover:bg-paper hover:text-ink",
                    )}
                  >
                    {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              {counts.images > 0 && (
                <IconButton
                  aria-label={showGrid ? "Show as list" : "Show images as a grid"}
                  title={showGrid ? "List" : "Picture grid"}
                  onClick={() => {
                    if (!showGrid) setFilter("images");
                    setGrid(!showGrid);
                  }}
                  className="size-7"
                >
                  {showGrid ? <List className="size-3.5" /> : <LayoutGrid className="size-3.5" />}
                </IconButton>
              )}
            </div>
          </div>

          {visible.length === 0 && <p className="px-4 text-sm text-slate">No files match.</p>}

          {showGrid ? (
            <ul className="grid grid-cols-2 gap-2 px-3" aria-label="Images">
              {visible.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(doc.id)}
                    className={cn(
                      "group block w-full overflow-hidden rounded-md border text-left transition-colors",
                      openDocumentId === doc.id ? "border-ledger" : "border-rule hover:border-slate",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private file behind login */}
                    <img
                      src={api.documentFileUrl(doc.id)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full bg-desk object-cover"
                    />
                    <span className="block truncate px-2 pt-1.5 text-xs text-ink">{doc.fileName}</span>
                    <span className="block truncate px-2 pb-1.5 text-[0.7rem] text-slate tabular-nums">
                      {formatDateTime(doc.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="px-2" aria-label="Documents">
              {visible.map((doc) => {
                const expanded = expandedId === doc.id;
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : doc.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-paper",
                        (expanded || openDocumentId === doc.id) && "bg-paper",
                      )}
                    >
                      <FileThumb document={doc} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{doc.fileName}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate">
                          <StatusLine document={doc} />
                        </span>
                      </span>
                    </button>

                    {expanded && (
                      <div className="mb-2 ml-[3.25rem] mr-2 space-y-3 pt-1 pb-1">
                        {doc.status === "failed" && doc.error && (
                          <p className="rounded-md bg-alert-soft px-2.5 py-2 text-xs text-alert">{doc.error}</p>
                        )}
                        {doc.summary && <p className="font-serif text-[0.9rem] leading-snug text-ink">{doc.summary}</p>}
                        <p className="text-xs text-slate">
                          {fileTypeLabel(doc.mimeType)} · {formatBytes(doc.sizeBytes)}
                          {doc.chunkCount ? ` · ${doc.chunkCount} search passages` : ""}
                          <br />
                          Uploaded {formatFullDateTime(doc.createdAt)}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="quiet" className="px-2.5 py-1.5 text-xs" onClick={() => onOpen(doc.id)}>
                            Open
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2.5 py-1.5 text-xs hover:text-alert"
                            onClick={() => handleDelete(doc)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** A real thumbnail for images; a labelled tile (PDF, DOCX, XLSX …) for everything else. */
function FileThumb({ document }: { document: DocumentDTO }) {
  if (isImage(document.mimeType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private file behind login
      <img
        src={api.documentFileUrl(document.id)}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-9 shrink-0 rounded border border-rule bg-desk object-cover"
      />
    );
  }
  const extension = getExtension(document.fileName).replace(".", "").toUpperCase() || "FILE";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded border text-[0.6rem] font-semibold tracking-wide",
        isPdf(document.mimeType)
          ? "border-alert/30 bg-alert-soft text-alert"
          : "border-ledger/30 bg-ledger-soft text-ledger",
      )}
    >
      {extension.slice(0, 4)}
    </span>
  );
}

function StatusLine({ document }: { document: DocumentDTO }) {
  if (document.status === "processing") {
    return (
      <span className="flex items-center gap-1.5 text-amber">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" aria-hidden />
        Reading and indexing
      </span>
    );
  }
  if (document.status === "failed") return <span className="text-alert">Couldn&apos;t be indexed</span>;
  const pages = document.pageCount ? `${document.pageCount} page${document.pageCount > 1 ? "s" : ""} · ` : "";
  return (
    <span className="tabular-nums" title={`Uploaded ${formatFullDateTime(document.createdAt)}`}>
      {pages}
      {formatDateTime(document.createdAt)}
    </span>
  );
}
