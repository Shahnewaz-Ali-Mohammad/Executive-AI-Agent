"use client";

/**
 * Documents: every file the assistant reads in this workspace.
 *
 *   - add files (button or drag and drop anywhere on the list)
 *   - search by name, filter by kind, list or picture grid
 *   - each file: status (reading / ready / failed), pages, size, upload time,
 *     and the three-sentence digest
 *   - open (viewer on the right), ask about it (new conversation), delete
 */
import { LayoutGrid, List, MessageSquarePlus, Trash2, Upload } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, IconButton } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { EmptyBlock, FilterChips, ListSkeleton, Page, PageHeader } from "@/components/ui/page";
import { SearchField } from "@/components/ui/search-field";
import { api } from "@/lib/api-client";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { fileTypeLabel, getExtension, isImage, isPdf } from "@/lib/file-types";
import type { DocumentDTO } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

type Filter = "all" | "images" | "pdfs" | "office" | "attention";

const FILTERS: { id: Filter; label: string; matches: (doc: DocumentDTO) => boolean }[] = [
  { id: "all", label: "All", matches: () => true },
  { id: "pdfs", label: "PDFs", matches: (doc) => isPdf(doc.mimeType) },
  { id: "images", label: "Images", matches: (doc) => isImage(doc.mimeType) },
  { id: "office", label: "Office files", matches: (doc) => !isImage(doc.mimeType) && !isPdf(doc.mimeType) },
  { id: "attention", label: "Not ready", matches: (doc) => doc.status !== "ready" },
];

export function DocumentsPage() {
  const ws = useWorkspace();
  const { confirm, toast } = useFeedback();
  const { documents, loading, uploading, error } = ws.documents;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [grid, setGrid] = useState(false);
  const [dragging, setDragging] = useState(false);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, documents.filter(f.matches).length])) as Record<Filter, number>,
    [documents],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = FILTERS.find((f) => f.id === filter)!.matches;
    return documents.filter((doc) => matches(doc) && (!needle || doc.fileName.toLowerCase().includes(needle)));
  }, [documents, filter, query]);

  const ready = documents.filter((d) => d.status === "ready");
  const pages = ready.reduce((sum, d) => sum + (d.pageCount ?? 0), 0);
  const openDocumentId = ws.panel?.kind === "source" ? ws.panel.documentId : null;

  async function remove(doc: DocumentDTO) {
    const ok = await confirm({
      title: `Delete “${doc.fileName}”?`,
      message: "It's removed from this workspace and no longer used in answers. Earlier answers keep their text.",
      confirmLabel: "Delete document",
      danger: true,
    });
    if (!ok) return;
    if (openDocumentId === doc.id) ws.closePanel();
    if (await ws.documents.remove(doc.id)) toast("Document deleted");
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) ws.uploadFiles(files);
  }

  return (
    <Page>
      <PageHeader
        title="Documents"
        description={
          documents.length
            ? `${ready.length} of ${documents.length} ready · ${pages} pages the assistant can read and cite.`
            : "Board packs, reports, contracts, spreadsheets, decks and photos of documents. Every answer cites the page it came from."
        }
        actions={
          <Button onClick={ws.pickFiles} disabled={uploading}>
            <Upload className="size-4" aria-hidden /> {uploading ? "Uploading…" : "Add documents"}
          </Button>
        }
      />

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          <p className="flex-1">{error}</p>
          <button type="button" onClick={ws.documents.clearError} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn("rounded-xl transition-colors", dragging && "bg-ledger-soft outline-2 outline-dashed outline-ledger")}
      >
        {loading && documents.length === 0 ? (
          <ListSkeleton />
        ) : documents.length === 0 ? (
          <button
            type="button"
            onClick={ws.pickFiles}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-rule bg-surface px-6 py-14 text-center transition-colors hover:border-ledger"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-ledger-soft text-ledger">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium text-ink">Add your first documents</span>
            <span className="text-sm text-slate">Click to choose files, or drop them here. PDF, scans, photos, Word, Excel, PowerPoint.</span>
          </button>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-72">
                <SearchField value={query} onChange={setQuery} placeholder="Search by file name" label="Search documents" />
              </div>
              <div className="min-w-0 flex-1">
                <FilterChips
                  label="Show"
                  value={filter}
                  onChange={(next) => {
                    setFilter(next);
                    if (next !== "images") setGrid(false);
                  }}
                  options={FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => ({
                    id: f.id,
                    label: f.label,
                    count: counts[f.id],
                  }))}
                />
              </div>
              {counts.images > 0 && (
                <IconButton
                  aria-label={grid ? "Show as a list" : "Show images as a grid"}
                  onClick={() => {
                    if (!grid) setFilter("images");
                    setGrid(!grid);
                  }}
                >
                  {grid ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
                </IconButton>
              )}
            </div>

            {visible.length === 0 ? (
              <EmptyBlock title="No documents match">Try another name, or show all documents.</EmptyBlock>
            ) : grid ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Images">
                {visible.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => ws.openPanel({ kind: "source", documentId: doc.id, page: 1 })}
                      className={cn(
                        "block w-full overflow-hidden rounded-lg border bg-surface text-left transition-colors",
                        openDocumentId === doc.id ? "border-ledger" : "border-rule hover:border-slate",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- private file behind login */}
                      <img src={api.documentFileUrl(doc.id)} alt="" loading="lazy" className="aspect-[4/3] w-full bg-desk object-cover" />
                      <span className="block truncate px-3 pt-2 text-sm text-ink">{doc.fileName}</span>
                      <span className="block px-3 pb-2 text-xs text-slate tabular-nums">{formatDateTime(doc.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface" aria-label="Documents">
                {visible.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    document={doc}
                    open={openDocumentId === doc.id}
                    onOpen={() => ws.openPanel({ kind: "source", documentId: doc.id, page: 1 })}
                    onAsk={() => ws.newConversation(`About ${doc.fileName}: `)}
                    onDelete={() => void remove(doc)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

function DocumentRow({
  document: doc,
  open,
  onOpen,
  onAsk,
  onDelete,
}: {
  document: DocumentDTO;
  open: boolean;
  onOpen: () => void;
  onAsk: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={cn("group flex gap-3 px-4 py-3.5 transition-colors", open ? "bg-ledger-soft/50" : "hover:bg-paper")}>
      <button type="button" onClick={onOpen} className="shrink-0 self-start" aria-label={`Open ${doc.fileName}`}>
        <FileThumb document={doc} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={onOpen}
            className="max-w-full truncate text-left text-sm font-medium text-ink hover:text-ledger"
            title={doc.fileName}
          >
            {doc.fileName}
          </button>
          <StatusBadge document={doc} />
        </div>
        <p className="mt-0.5 text-xs text-slate tabular-nums">
          {fileTypeLabel(doc.mimeType)}
          {doc.pageCount ? ` · ${doc.pageCount} page${doc.pageCount > 1 ? "s" : ""}` : ""} · {formatBytes(doc.sizeBytes)} ·{" "}
          <time dateTime={doc.createdAt} title={`Uploaded ${formatFullDateTime(doc.createdAt)}`}>
            {formatDateTime(doc.createdAt)}
          </time>
        </p>
        {doc.status === "failed" && doc.error && <p className="mt-1.5 text-sm text-alert">{doc.error}</p>}
        {doc.summary && <p className="mt-1.5 line-clamp-2 font-serif text-[0.95rem] leading-snug text-ink/90">{doc.summary}</p>}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        {doc.status === "ready" && (
          <IconButton aria-label={`Ask about ${doc.fileName}`} onClick={onAsk}>
            <MessageSquarePlus className="size-4" />
          </IconButton>
        )}
        <IconButton aria-label={`Delete ${doc.fileName}`} onClick={onDelete} className="hover:text-alert">
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}

function StatusBadge({ document: doc }: { document: DocumentDTO }) {
  if (doc.status === "processing") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-amber-soft px-2 py-0.5 text-[0.7rem] text-amber">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" aria-hidden />
        Reading
      </span>
    );
  }
  if (doc.status === "failed") {
    return <span className="rounded-full bg-alert-soft px-2 py-0.5 text-[0.7rem] text-alert">Couldn&apos;t be read</span>;
  }
  return null;
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
        className="size-11 rounded-md border border-rule bg-desk object-cover"
      />
    );
  }
  const extension = getExtension(document.fileName).replace(".", "").toUpperCase() || "FILE";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 items-center justify-center rounded-md border text-[0.65rem] font-semibold tracking-wide",
        isPdf(document.mimeType) ? "border-alert/30 bg-alert-soft text-alert" : "border-ledger/30 bg-ledger-soft text-ledger",
      )}
    >
      {extension.slice(0, 4)}
    </span>
  );
}
