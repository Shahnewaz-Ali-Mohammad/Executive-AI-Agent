/**
 * Workspace data access. Route handlers call these functions instead of
 * querying the database directly, so the SQL lives in one place.
 */
import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { HttpError, isUuid } from "@/lib/http";
import type { WorkspaceDTO } from "@/lib/types";

const { workspaces } = schema;

function toDTO(row: schema.Workspace): WorkspaceDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWorkspaces(): Promise<WorkspaceDTO[]> {
  const rows = await db.select().from(workspaces).orderBy(asc(workspaces.createdAt));
  return rows.map(toDTO);
}

export async function createWorkspace(input: { name: string; description?: string }): Promise<WorkspaceDTO> {
  const [row] = await db
    .insert(workspaces)
    .values({ name: input.name, description: input.description ?? null })
    .returning();
  return toDTO(row);
}

export async function renameWorkspace(id: string, name: string): Promise<WorkspaceDTO> {
  await requireWorkspace(id);
  const [row] = await db.update(workspaces).set({ name }).where(eq(workspaces.id, id)).returning();
  return toDTO(row);
}

/**
 * Delete a workspace and (via ON DELETE CASCADE) its documents, pages and chat.
 * The caller is responsible for removing stored files and search vectors first.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id));
}

/** Load a workspace or throw 404. Use at the start of every workspace-scoped route. */
export async function requireWorkspace(id: string): Promise<WorkspaceDTO> {
  if (!isUuid(id)) throw new HttpError(404, "Workspace not found.");
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!row) throw new HttpError(404, "Workspace not found.");
  return toDTO(row);
}
