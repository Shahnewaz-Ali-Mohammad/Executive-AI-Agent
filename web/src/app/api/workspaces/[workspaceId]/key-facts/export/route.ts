/** GET /api/workspaces/:workspaceId/key-facts/export → the register as an Excel file */
import { exportFactsWorkbook } from "@/lib/data/facts";
import { requireWorkspace } from "@/lib/data/workspaces";
import { handleRouteError } from "@/lib/http";

type Context = RouteContext<"/api/workspaces/[workspaceId]/key-facts/export">;

export async function GET(_request: Request, ctx: Context) {
  try {
    const { workspaceId } = await ctx.params;
    const workspace = await requireWorkspace(workspaceId);
    const data = await exportFactsWorkbook(workspaceId, workspace.name);
    const safeName = workspace.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "workspace";
    const fileName = `${safeName}-key-dates-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
