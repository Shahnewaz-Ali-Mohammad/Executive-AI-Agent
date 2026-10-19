"use client";

/**
 * Documents: every file the assistant reads in this workspace.
 *
 *   - add files (button or drag and drop anywhere on the list)
 *   - search by name, filter by kind, list or picture grid
 *   - each file: status (reading / ready / failed), type (contract, invoice …),
 *     tags, pages, size, upload time, the three-sentence digest, its next key
 *     date and anything it seems to be missing
 *   - open (viewer on the right), ask about it (new conversation), its key
 *     dates, read it again for dates, delete
 */
import { AlertTriangle, CalendarDays, LayoutGrid, List, MessageSquarePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type DragEvent } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, IconButton } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { EmptyBlock, FilterChips, ListSkeleton, Page, PageHeader } from "@/components/ui/page";
import { SearchField } from "@/components/ui/search-field";
import { api } from "@/lib/api-client";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { daysBetween, relativeDays, todayHere } from "@/lib/facts";
import { fileTypeLabel, getExtension, isImage, isPdf } from "@/lib/file-types";
import { routes } from "@/lib/routes";
import type { DocumentDTO, FactDTO } from "@/lib/types";
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
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [grid, setGrid] = useState(false);
  const [dragging, setDragging] = useState(false);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, documents.filter(f.matches).length])) as Record<Filter, number>,
    [documents],
  );
  const categories = useMemo(
    () => [...new Set(documents.map((d) => d.category).filter((c): c is string => Boolean(c)))].sort(),
    [documents],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = FILTERS.find((f) => f.id === filter)!.matches;
    return documents.filter(
      (doc) =>
        matches(doc) &&
        (category === "all" || doc.category === category) &&
        (!needle ||
          doc.fileName.toLowerCase().includes(needle) ||
          doc.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          doc.category?.toLowerCase().includes(needle)),
    );
  }, [documents, filter, query, category]);

  // Each document's dates (not dismissed), soonest first.
  const today = todayHere();
  const factsByDocument = useMemo(() => {
    const map = new Map<string, FactDTO[]>();
    for (const fact of ws.keyFacts.facts) {
      if (!fact.date || fact.status === "dismissed") continue;
      map.set(fact.documentId, [...(map.get(fact.documentId) ?? []), fact]);
    }
    return map;
  }, [ws.keyFacts.facts]);

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
                <SearchField value={query} onChange={setQuery} placeholder="Search by name or tag" label="Search documents" />
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
              {categories.length > 0 && (
                <select
                  aria-label="Type of document"
                  className="rounded-md border border-rule bg-surface px-2 py-1.5 text-xs text-ink"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">All types</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c} ({documents.filter((d) => d.category === c).length})
                    </option>
                  ))}
                </select>
              )}
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
                    facts={factsByDocument.get(doc.id) ?? []}
                    today={today}
                    keyDatesHref={routes.keyDates(ws.workspaceId, doc.id)}
                    open={openDocumentId === doc.id}
                    onOpen={() => ws.openPanel({ kind: "source", documentId: doc.id, page: 1 })}
                    onAsk={() => ws.newConversation(`About ${doc.fileName}: `)}
                    onReadAgain={async () => {
                      if (await ws.documents.rescan(doc.id)) toast("Reading it again for dates and facts");
                    }}
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
  facts,
  today,
  keyDatesHref,
  open,
  onOpen,
  onAsk,
  onReadAgain,
  onDelete,
}: {
  document: DocumentDTO;
  facts: FactDTO[];
  today: string;
  keyDatesHref: string;
  open: boolean;
  onOpen: () => void;
  onAsk: () => void;
  onReadAgain: () => void;
  onDelete: () => void;
}) {
  const next = facts.find((f) => daysBetween(today, f.date!) >= 0);
  const readingFacts = doc.status === "ready" && (doc.factsStatus === "pending" || doc.factsStatus === "running");
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
          {doc.category && <span className="rounded-full bg-paper px-2 py-0.5 text-[0.7rem] text-slate">{doc.category}</span>}
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
        {(facts.length > 0 || readingFacts || doc.tags.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {readingFacts ? (
              <span className="flex items-center gap-1.5 text-amber">
                <span className="size-1.5 animate-pulse rounded-full bg-amber" aria-hidden />
                Reading key dates…
              </span>
            ) : (
              facts.length > 0 && (
                <Link href={keyDatesHref} className="flex items-center gap-1 text-ledger underline-offset-2 hover:underline">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {facts.length} key date{facts.length > 1 ? "s" : ""}
                  {next && (
                    <span className="text-slate">
                      {" "}
                      · next: {next.label} {relativeDays(daysBetween(today, next.date!))}
                    </span>
                  )}
                </Link>
              )
            )}
            {doc.tags.slice(0, 5).map((tag) => (
              <span key={tag} className="rounded-full border border-rule px-2 py-0.5 text-slate">
                {tag}
              </span>
            ))}
          </div>
        )}
        {doc.warnings.length > 0 && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{doc.warnings.join(" · ")}</span>
          </p>
        )}
        {doc.status === "ready" && doc.factsStatus === "failed" && (
          <p className="mt-1.5 text-xs text-alert">Key dates couldn&apos;t be read. Use “Read again”.</p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        {doc.status === "ready" && (
          <IconButton aria-label={`Ask about ${doc.fileName}`} onClick={onAsk}>
            <MessageSquarePlus className="size-4" />
          </IconButton>
        )}
        {doc.status === "ready" && (
          <IconButton aria-label={`Read ${doc.fileName} again for key dates`} onClick={onReadAgain} disabled={readingFacts}>
            <RefreshCw className={cn("size-4", readingFacts && "animate-spin")} />
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
