"use client";

/**
 * "Add documents" area: click to pick files, or drag them onto it.
 * The hidden file input is exposed through `inputRef` so other buttons
 * (the paperclip in the chat box, the empty state) can open the same picker.
 */
import { Upload } from "lucide-react";
import { useState, type DragEvent, type RefObject } from "react";
import { FILE_INPUT_ACCEPT } from "@/lib/file-types";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  inputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onFiles: (files: File[]) => void;
}

export function UploadDropzone({ inputRef, uploading, onFiles }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className="px-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        disabled={uploading}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center transition-colors",
          dragging ? "border-ledger bg-ledger-soft" : "border-rule hover:border-slate",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Upload className="size-4 text-ledger" aria-hidden />
          {uploading ? "Uploading…" : "Add documents"}
        </span>
        <span className="text-xs text-slate">PDF, photos and scans, Word, Excel or PowerPoint</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = ""; // allow picking the same file again
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
