/**
 * File types the CEO can upload. All are read locally (see lib/extract),
 * except scans and photos, which OpenAI's vision model reads.
 *
 * Shared by client (file picker filter) and server (upload validation).
 */

export const SUPPORTED_FILE_TYPES: Record<string, { mimeType: string; label: string }> = {
  ".pdf": { mimeType: "application/pdf", label: "PDF" },
  ".png": { mimeType: "image/png", label: "Image" },
  ".jpg": { mimeType: "image/jpeg", label: "Image" },
  ".jpeg": { mimeType: "image/jpeg", label: "Image" },
  ".webp": { mimeType: "image/webp", label: "Image" },
  ".docx": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
  },
  ".xlsx": {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
  },
  ".pptx": {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint",
  },
  ".csv": { mimeType: "text/csv", label: "CSV" },
  ".txt": { mimeType: "text/plain", label: "Text" },
  ".md": { mimeType: "text/markdown", label: "Text" },
};

/** Value for <input type="file" accept="…">. */
export const FILE_INPUT_ACCEPT = Object.keys(SUPPORTED_FILE_TYPES).join(",");

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * The trusted MIME type for a file, decided by its extension (browsers report
 * MIME types inconsistently). Returns null for unsupported files.
 */
export function resolveMimeType(fileName: string): string | null {
  return SUPPORTED_FILE_TYPES[getExtension(fileName)]?.mimeType ?? null;
}

export function fileTypeLabel(mimeType: string): string {
  const match = Object.values(SUPPORTED_FILE_TYPES).find((type) => type.mimeType === mimeType);
  return match?.label ?? "File";
}

export function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
