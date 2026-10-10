/**
 * GET /api/documents/:documentId/file → the original uploaded file.
 *
 * Used by the citation viewer (PDFs and images are shown in the page) and
 * for downloading. `?download=1` forces a download instead of inline display.
 */
import type { NextRequest } from "next/server";
import { requireDocument } from "@/lib/data/documents";
import { handleRouteError } from "@/lib/http";
import { openFile } from "@/lib/storage";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/[documentId]/file">) {
  try {
    const { documentId } = await ctx.params;
    const document = await requireDocument(documentId);
    const { stream, size } = await openFile(document.storageKey);

    const disposition = request.nextUrl.searchParams.get("download") ? "attachment" : "inline";
    return new Response(stream, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        // Private: confidential documents must never be cached by shared proxies.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
