"use client";

/**
 * The documents in the open workspace, with their indexing status.
 * Selecting a document shows its digest (written when it was uploaded) and
 * lets the CEO open or delete it.
 */
import { FileImage, FileSpreadsheet, FileText, Presentation, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fileTypeLabel, isImage } from "@/lib/file-types";
import type { DocumentDTO } from "@/lib/types";
import { cn, formatBytes, formatDate } from "@/lib/utils";

interface DocumentListProps {
  documents: DocumentDTO[];
  loading: boolean;
  openDocumentId: string | null;
  onOpen: (documentId: string) => void;
  onDelete: (documentId: string) => Promise<void>;
}

function DocumentIcon({ mimeType }: { mimeType: string }) {
  const label = fileTypeLabel(mimeType);
  const className = "size-4 shrink-0 text-slate";
  if (isImage(mimeType)) return <FileImage className={className} aria-hidden />;
  if (label === "Excel" || label === "CSV") return <FileSpreadsheet className={className} aria-hidden />;
  if (label === "PowerPoint") return <Presentation className={className} aria-hidden />;
  return <FileText className={className} aria-hidden />;
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
  const pages = document.pageCount ? `${document.pageCount} page${document.pageCount > 1 ? "s" : ""}` : "Ready";
  return (
    <span>
      {pages}, {formatDate(document.createdAt)}
    </span>
  );
}

export function DocumentList({ documents, loading, openDocumentId, onOpen, onDelete }: DocumentListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading && documents.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate">Loading documents…</p>;
  }
  if (documents.length === 0) {
    return <p className="px-4 py-3 text-sm text-slate">No documents yet.</p>;
  }

  async function handleDelete(document: DocumentDTO) {
    if (window.confirm(`Delete "${document.fileName}"? It will no longer be used in answers.`)) {
      await onDelete(document.id);
    }
  }

  return (
    <ul className="px-2" aria-label="Documents">
      {documents.map((document) => {
        const expanded = expandedId === document.id;
        return (
          <li key={document.id}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpandedId(expanded ? null : document.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-paper",
                (expanded || openDocumentId === document.id) && "bg-paper",
              )}
            >
              <span className="mt-0.5">
                <DocumentIcon mimeType={document.mimeType} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{document.fileName}</span>
                <span className="mt-0.5 block text-xs text-slate">
                  <StatusLine document={document} />
                </span>
              </span>
            </button>

            {expanded && (
              <div className="mb-2 ml-8 mr-2 space-y-3 pb-1">
                {document.status === "failed" && document.error && (
                  <p className="rounded-md bg-alert-soft px-2.5 py-2 text-xs text-alert">{document.error}</p>
                )}
                {document.summary && (
                  <p className="font-serif text-[0.9rem] leading-snug text-ink">{document.summary}</p>
                )}
                <p className="text-xs text-slate">
                  {fileTypeLabel(document.mimeType)}, {formatBytes(document.sizeBytes)}
                  {document.chunkCount ? `, ${document.chunkCount} search passages` : ""}
                </p>
                <div className="flex gap-2">
                  <Button variant="quiet" className="px-2.5 py-1.5 text-xs" onClick={() => onOpen(document.id)}>
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2.5 py-1.5 text-xs hover:text-alert"
                    onClick={() => handleDelete(document)}
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
  );
}
