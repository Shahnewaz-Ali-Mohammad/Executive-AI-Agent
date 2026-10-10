/**
 * GET  /api/workspaces → list all workspaces
 * POST /api/workspaces → create one   body: { name, description? }
 */
import { z } from "zod";
import { createWorkspace, listWorkspaces } from "@/lib/data/workspaces";
import { handleRouteError, HttpError } from "@/lib/http";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  description: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    return Response.json(await listWorkspaces());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid workspace.");
    return Response.json(await createWorkspace(parsed.data), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
