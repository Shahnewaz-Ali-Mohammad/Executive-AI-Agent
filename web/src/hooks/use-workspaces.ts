"use client";

/**
 * The workspace list. Which workspace is open comes from the address
 * (/w/:workspaceId); this hook only loads and changes the list.
 * On first use (no workspaces yet) it creates a "General" workspace so the
 * CEO can start uploading straight away.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { WorkspaceDTO } from "@/lib/types";

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await api.listWorkspaces();
        if (list.length === 0) list = [await api.createWorkspace("General")];
        if (!cancelled) setWorkspaces(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load workspaces.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async (name: string) => {
    const workspace = await api.createWorkspace(name);
    setWorkspaces((list) => [...list, workspace]);
    return workspace;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    const updated = await api.renameWorkspace(id, name);
    setWorkspaces((list) => list.map((w) => (w.id === id ? updated : w)));
  }, []);

  /** Delete one; returns the workspaces left (a new "General" one if none). */
  const remove = useCallback(
    async (id: string) => {
      await api.deleteWorkspace(id);
      const remaining = workspaces.filter((w) => w.id !== id);
      if (remaining.length === 0) remaining.push(await api.createWorkspace("General"));
      setWorkspaces(remaining);
      return remaining;
    },
    [workspaces],
  );

  return { workspaces, loading, error, create, rename, remove };
}
