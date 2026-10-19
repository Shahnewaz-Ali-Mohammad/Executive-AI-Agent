"use client";

/**
 * The inputs for one key date or fact: used to correct one the AI read, and
 * to add one by hand.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, INPUT_CLASS } from "@/components/ui/field";
import { FACT_KIND_LABELS, FACT_KINDS, isDateKind, type FactKind } from "@/lib/facts";
import type { DocumentDTO } from "@/lib/types";

export interface FactDraft {
  documentId: string;
  kind: FactKind;
  label: string;
  date: string | null;
  value: string | null;
  page: number | null;
}

export function FactEditor({
  idPrefix,
  initial,
  documents,
  saveLabel,
  onSave,
  onCancel,
}: {
  idPrefix: string;
  initial: FactDraft;
  /** Given when adding: pick which document it belongs to. */
  documents?: DocumentDTO[];
  saveLabel: string;
  onSave: (draft: FactDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = (name: string) => `${idPrefix}-${name}`;
  const set = <K extends keyof FactDraft>(key: K, value: FactDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const needsDate = isDateKind(draft.kind);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.label.trim()) return setProblem("Say what it is.");
    if (needsDate && !draft.date) return setProblem("Pick the date.");
    if (!draft.documentId) return setProblem("Pick the document it belongs to.");
    setSaving(true);
    setProblem(null);
    const ok = await onSave({ ...draft, date: needsDate ? draft.date : null });
    setSaving(false);
    if (!ok) setProblem("Not saved. See the message above.");
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border border-rule bg-paper/60 p-3">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {documents && (
          <Field id={id("doc")} label="Document" wide>
            <select
              id={id("doc")}
              className={INPUT_CLASS}
              value={draft.documentId}
              onChange={(e) => set("documentId", e.target.value)}
            >
              <option value="">Choose…</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.fileName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id={id("kind")} label="Type">
          <select
            id={id("kind")}
            className={INPUT_CLASS}
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value as FactKind)}
          >
            {FACT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FACT_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        {needsDate ? (
          <Field id={id("date")} label="Date">
            <input
              id={id("date")}
              type="date"
              className={INPUT_CLASS}
              value={draft.date ?? ""}
              onChange={(e) => set("date", e.target.value || null)}
            />
          </Field>
        ) : (
          <Field id={id("value")} label="Detail" hint="optional">
            <input
              id={id("value")}
              className={INPUT_CLASS}
              value={draft.value ?? ""}
              placeholder="e.g. USD 240,000 · Supplier"
              onChange={(e) => set("value", e.target.value || null)}
            />
          </Field>
        )}
        <Field id={id("label")} label="What it is" wide>
          <input
            id={id("label")}
            className={INPUT_CLASS}
            value={draft.label}
            placeholder="e.g. Northwind supply contract renews"
            onChange={(e) => set("label", e.target.value)}
          />
        </Field>
        {needsDate && (
          <Field id={id("value2")} label="Detail" hint="optional">
            <input
              id={id("value2")}
              className={INPUT_CLASS}
              value={draft.value ?? ""}
              placeholder="e.g. 60 days' notice"
              onChange={(e) => set("value", e.target.value || null)}
            />
          </Field>
        )}
        <Field id={id("page")} label="Page" hint="optional">
          <input
            id={id("page")}
            type="number"
            min={1}
            inputMode="numeric"
            className={INPUT_CLASS}
            value={draft.page ?? ""}
            onChange={(e) => set("page", e.target.value ? Math.max(1, Number(e.target.value)) : null)}
          />
        </Field>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-alert">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : saveLabel}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
