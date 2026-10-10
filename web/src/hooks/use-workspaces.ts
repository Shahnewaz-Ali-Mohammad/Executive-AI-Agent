"use client";

/**
 * Loads the workspace list and remembers which one is open.
 * On first use (no workspaces yet) it creates a "General" workspace so the
 * CEO can start uploading straight away.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { WorkspaceDTO } from "@/lib/types";

const LAST_WORKSPACE_KEY = "ea:last-workspace";

function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null; // storage can be blocked (private mode); not important
  }
}

function writeLastWorkspace(id: string) {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, id);
  } catch {
    // ignore
  }
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await api.listWorkspaces();
        if (list.length === 0) list = [await api.createWorkspace("General")];
        if (cancelled) return;

        setWorkspaces(list);
        const last = readLastWorkspace();
        setActiveId(list.some((w) => w.id === last) ? last : list[0].id);
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

  const select = useCallback((id: string) => {
    setActiveId(id);
    writeLastWorkspace(id);
  }, []);

  const create = useCallback(
    async (name: string) => {
      const workspace = await api.createWorkspace(name);
      setWorkspaces((list) => [...list, workspace]);
      select(workspace.id);
      return workspace;
    },
    [select],
  );

  const rename = useCallback(async (id: string, name: string) => {
    const updated = await api.renameWorkspace(id, name);
    setWorkspaces((list) => list.map((w) => (w.id === id ? updated : w)));
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await api.deleteWorkspace(id);
      const remaining = workspaces.filter((w) => w.id !== id);
      if (remaining.length === 0) remaining.push(await api.createWorkspace("General"));
      setWorkspaces(remaining);
      if (activeId === id) select(remaining[0].id);
    },
    [workspaces, activeId, select],
  );

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  return { workspaces, active, loading, error, select, create, rename, remove };
}
