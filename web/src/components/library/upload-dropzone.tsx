"use client";

/**
 * "Add documents" area: click to pick files, or drag them onto it.
 * The file picker itself lives once in the app shell (so the paperclip in the
 * question box works whichever sidebar tab is open); this only opens it.
 */
import { Upload } from "lucide-react";
import { useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  uploading: boolean;
  onPick: () => void;
  onFiles: (files: File[]) => void;
}

export function UploadDropzone({ uploading, onPick, onFiles }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      disabled={uploading}
      className={cn(
        "flex w-full flex-col items-center gap-0.5 rounded-lg border border-dashed px-3 py-3 text-center transition-colors",
        dragging ? "border-ledger bg-ledger-soft" : "border-rule hover:border-slate",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <Upload className="size-4 text-ledger" aria-hidden />
        {uploading ? "Uploading…" : "Add documents"}
      </span>
      <span className="text-xs text-slate">PDF, photos, Word, Excel, PowerPoint · or drop files here</span>
    </button>
  );
}
