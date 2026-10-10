"use client";

/**
 * Form templates (shared by all workspaces) and the saved forms of the open
 * workspace. `refresh` is called after anything is saved from the chat, so the
 * Forms section stays current.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { FormValues, TemplateInput } from "@/lib/forms";
import type { FormSubmissionDTO, FormTemplateDTO } from "@/lib/types";

export function useForms(workspaceId: string) {
  const [templates, setTemplates] = useState<FormTemplateDTO[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmissionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listTemplates(), api.listSubmissions(workspaceId)])
      .then(([templateList, submissionList]) => {
        if (cancelled) return;
        setTemplates(templateList);
        setSubmissions(submissionList);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load forms."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    const [templateList, submissionList] = await Promise.all([
      api.listTemplates().catch(() => null),
      api.listSubmissions(workspaceId).catch(() => null),
    ]);
    if (templateList) setTemplates(templateList);
    if (submissionList) setSubmissions(submissionList);
  }, [workspaceId]);

  /** Create (id null) or update a template; returns the saved one. */
  const saveTemplate = useCallback(
    async (id: string | null, input: TemplateInput) => {
      const saved = id ? await api.updateTemplate(id, input) : await api.createTemplate(input);
      await refresh();
      return saved;
    },
    [refresh],
  );

  const deleteTemplate = useCallback(async (id: string) => {
    await api.deleteTemplate(id);
    setTemplates((list) => list.filter((t) => t.id !== id));
  }, []);

  const updateSubmission = useCallback(async (id: string, values: FormValues) => {
    const saved = await api.updateSubmission(id, values);
    setSubmissions((list) => list.map((s) => (s.id === id ? saved : s)));
    return saved;
  }, []);

  const deleteSubmission = useCallback(
    async (id: string) => {
      await api.deleteSubmission(id);
      setSubmissions((list) => list.filter((s) => s.id !== id));
      void refresh(); // template counts change
    },
    [refresh],
  );

  return {
    templates,
    submissions,
    loading,
    error,
    refresh,
    saveTemplate,
    deleteTemplate,
    updateSubmission,
    deleteSubmission,
  };
}
