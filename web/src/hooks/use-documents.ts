"use client";

/**
 * The documents of the open workspace.
 *
 * While any document is still "processing", the list is re-fetched every few
 * seconds so the CEO sees it turn "ready" (with its digest) without reloading.
 *
 * The screen is re-mounted per workspace (keyed by its id), so this hook
 * always starts fresh for one workspace and never mixes two workspaces' files.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { DocumentDTO } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

export function useDocuments(workspaceId: string) {
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await api.listDocuments(workspaceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents.");
    }
  }, [workspaceId]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    api
      .listDocuments(workspaceId)
      .then((list) => !cancelled && setDocuments(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load documents."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Poll while something is still being indexed.
  const hasProcessing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasProcessing, refresh]);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const created = await api.uploadDocuments(workspaceId, files);
        setDocuments((list) => [...created, ...list]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [workspaceId],
  );

  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      await api.deleteDocument(id);
      setDocuments((list) => list.filter((doc) => doc.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the document.");
    }
  }, []);

  return {
    documents,
    loading,
    uploading,
    error,
    clearError: () => setError(null),
    upload,
    remove,
  };
}
