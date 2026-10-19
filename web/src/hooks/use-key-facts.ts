"use client";

/**
 * The key dates and facts register of the open workspace, for the Key dates
 * page, the sidebar count and the documents page.
 *
 * Reloads whenever a document finishes being read (the documents list
 * changes its "reading" state), so new dates appear on their own.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { DocumentDTO, FactDTO, KeyFactsSettingsDTO } from "@/lib/types";

type FactChange = Parameters<typeof api.updateFact>[1];

export function useKeyFacts(workspaceId: string, documents: DocumentDTO[]) {
  const [facts, setFacts] = useState<FactDTO[]>([]);
  const [settings, setSettings] = useState<KeyFactsSettingsDTO>({ reminderEmail: null, weeklySummaryScheduleId: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Changes when a document is added, removed, or finishes being read.
  const signature = documents.map((d) => `${d.id}:${d.status}:${d.factsStatus}`).join("|");

  useEffect(() => {
    let cancelled = false;
    api
      .keyFacts(workspaceId)
      .then((data) => {
        if (cancelled) return;
        setFacts(data.facts);
        setSettings(data.settings);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load key dates."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId, signature]);

  const refresh = useCallback(async () => {
    const data = await api.keyFacts(workspaceId).catch(() => null);
    if (data) {
      setFacts(data.facts);
      setSettings(data.settings);
    }
  }, [workspaceId]);

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    return false;
  };

  /** Correct, confirm or dismiss one. Updates the list straight away. */
  const update = useCallback(async (id: string, change: FactChange): Promise<boolean> => {
    setError(null);
    try {
      const updated = await api.updateFact(id, change);
      setFacts((list) => list.map((f) => (f.id === id ? updated : f)));
      return true;
    } catch (err) {
      return fail(err, "Could not save the change.");
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      await api.deleteFact(id);
      setFacts((list) => list.filter((f) => f.id !== id));
      return true;
    } catch (err) {
      return fail(err, "Could not remove it.");
    }
  }, []);

  const add = useCallback(
    async (input: Parameters<typeof api.addFact>[1]): Promise<boolean> => {
      setError(null);
      try {
        await api.addFact(workspaceId, input);
        await refresh();
        return true;
      } catch (err) {
        return fail(err, "Could not add the date.");
      }
    },
    [workspaceId, refresh],
  );

  const saveSettings = useCallback(
    async (change: Parameters<typeof api.saveFactSettings>[1]): Promise<boolean> => {
      setError(null);
      try {
        setSettings(await api.saveFactSettings(workspaceId, change));
        return true;
      } catch (err) {
        return fail(err, "Could not save the settings.");
      }
    },
    [workspaceId],
  );

  return {
    facts,
    settings,
    loading,
    error,
    clearError: () => setError(null),
    refresh,
    update,
    remove,
    add,
    saveSettings,
  };
}
