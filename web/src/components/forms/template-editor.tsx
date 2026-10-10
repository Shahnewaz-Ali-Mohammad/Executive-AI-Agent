"use client";

/**
 * Edit a form template by hand: name, description and fields (label, type,
 * required, dropdown choices, hint), reorder and remove. Usually the AI drafts
 * the template from a description and this is only for small changes.
 *
 * Field keys are kept when a field is renamed, so forms saved earlier still
 * line up with the template.
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { FIELD_TYPE_LABELS, FIELD_TYPES, type FieldType, type FormField, type TemplateInput } from "@/lib/forms";
import type { FormTemplateDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SidePanel } from "./side-panel";

interface DraftField {
  /** Kept from the saved template; empty for new fields (the server makes one). */
  key?: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Dropdown choices, one per line while editing. */
  optionsText: string;
  hint: string;
  /** For React lists only. */
  uid: string;
}

function toDraft(field: FormField): DraftField {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    optionsText: (field.options ?? []).join("\n"),
    hint: field.hint ?? "",
    uid: crypto.randomUUID(),
  };
}

function newField(): DraftField {
  return { label: "", type: "text", required: false, optionsText: "", hint: "", uid: crypto.randomUUID() };
}

interface TemplateEditorProps {
  /** null = a new template. */
  template: FormTemplateDTO | null;
  onSave: (input: TemplateInput) => Promise<unknown>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const INPUT =
  "w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-slate/60 focus:border-ledger focus:outline-none";

export function TemplateEditor({ template, onSave, onDelete, onClose }: TemplateEditorProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [fields, setFields] = useState<DraftField[]>(template ? template.fields.map(toDraft) : [newField()]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  function update(uid: string, patch: Partial<DraftField>) {
    setFields((list) => list.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
    setSavedNote(null);
  }

  function move(index: number, by: -1 | 1) {
    setFields((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      await onSave({
        name,
        description,
        fields: fields
          .filter((f) => f.label.trim())
          .map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            options:
              f.type === "select"
                ? f.optionsText.split(/\n|,/).map((o) => o.trim()).filter(Boolean)
                : undefined,
            hint: f.hint.trim() || undefined,
          })),
      });
      setSavedNote("Saved.");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save the template.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete || !template) return;
    const note = template.submissionCount
      ? ` The ${template.submissionCount} form(s) already saved with it are kept.`
      : "";
    if (!window.confirm(`Delete the "${template.name}" template?${note}`)) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
    }
  }

  return (
    <SidePanel
      label="Form template"
      title={template ? `Edit template: ${template.name}` : "New form template"}
      subtitle={template ? `${template.submissionCount} saved form(s) use it` : "Or describe the form in the chat and it's drafted for you."}
      onClose={onClose}
      footer={
        <>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : template ? "Save template" : "Create template"}
          </Button>
          {savedNote && <span className="text-xs text-ledger">{savedNote}</span>}
          {template && onDelete && (
            <Button variant="ghost" className="ml-auto hover:text-alert" onClick={remove} disabled={busy}>
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="template-name" className="text-xs font-medium text-slate">
            Form name
          </label>
          <input
            id="template-name"
            value={name}
            maxLength={120}
            placeholder="e.g. Leave request"
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="template-description" className="text-xs font-medium text-slate">
            What it&apos;s for
          </label>
          <input
            id="template-description"
            value={description}
            maxLength={500}
            placeholder="One sentence"
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate">Fields</h3>
          <ol className="space-y-2">
            {fields.map((field, index) => (
              <li key={field.uid} className="space-y-2 rounded-md border border-rule p-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-xs text-slate tabular-nums">{index + 1}.</span>
                  <input
                    aria-label={`Field ${index + 1} label`}
                    value={field.label}
                    maxLength={120}
                    placeholder="Field label"
                    onChange={(e) => update(field.uid, { label: e.target.value })}
                    className={INPUT}
                  />
                  <IconButton aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="size-7">
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label="Move down"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, 1)}
                    className="size-7"
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label={`Remove ${field.label || "field"}`}
                    onClick={() => setFields((list) => list.filter((f) => f.uid !== field.uid))}
                    className="size-7 hover:text-alert"
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
                <div className="space-y-2 pl-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      aria-label={`Field ${index + 1} type`}
                      value={field.type}
                      onChange={(e) => update(field.uid, { type: e.target.value as FieldType })}
                      className={cn(INPUT, "w-auto")}
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {FIELD_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => update(field.uid, { required: e.target.checked })}
                        className="size-4 accent-[var(--ledger)]"
                      />
                      Required
                    </label>
                  </div>
                  {field.type === "select" && (
                    <textarea
                      aria-label={`Field ${index + 1} choices`}
                      rows={3}
                      value={field.optionsText}
                      placeholder={"Choices, one per line\ne.g. Annual\nSick"}
                      onChange={(e) => update(field.uid, { optionsText: e.target.value })}
                      className={INPUT}
                    />
                  )}
                  <input
                    aria-label={`Field ${index + 1} hint`}
                    value={field.hint}
                    maxLength={300}
                    placeholder="Hint (optional), e.g. Total including tax"
                    onChange={(e) => update(field.uid, { hint: e.target.value })}
                    className={INPUT}
                  />
                </div>
              </li>
            ))}
          </ol>
          <Button variant="quiet" onClick={() => setFields((list) => [...list, newField()])}>
            <Plus className="size-3.5" aria-hidden /> Add field
          </Button>
        </div>

        {problem && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
      </div>
    </SidePanel>
  );
}
