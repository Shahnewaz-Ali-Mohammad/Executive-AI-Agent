/**
 * GET /api/documents/:documentId/pages/:pageNumber → the parsed text of one page.
 *
 * Shown in the citation viewer under the page image, and on its own for file
 * types the browser can't preview (Word, Excel, PowerPoint).
 */
import { getDocumentPage } from "@/lib/data/documents";
import { handleRouteError, HttpError } from "@/lib/http";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/documents/[documentId]/pages/[pageNumber]">,
) {
  try {
    const { documentId, pageNumber } = await ctx.params;
    const page = Number(pageNumber);
    if (!Number.isInteger(page) || page < 1) throw new HttpError(400, "Invalid page number.");
    return Response.json(await getDocumentPage(documentId, page));
  } catch (error) {
    return handleRouteError(error);
  }
}
