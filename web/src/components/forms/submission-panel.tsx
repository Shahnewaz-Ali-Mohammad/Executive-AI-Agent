"use client";

/** A saved form, opened from the Forms page: view and correct its values, or delete it. */
import { MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { validateValues, type FieldValue, type FormValues } from "@/lib/forms";
import type { FormSubmissionDTO } from "@/lib/types";
import { FormFieldInputs } from "./form-field-inputs";
import { SidePanel } from "./side-panel";

interface SubmissionPanelProps {
  submission: FormSubmissionDTO;
  onSave: (values: FormValues) => Promise<unknown>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  /** Open the conversation it was filled in from. */
  onOpenConversation?: () => void;
}

export function SubmissionPanel({ submission, onSave, onDelete, onClose, onOpenConversation }: SubmissionPanelProps) {
  const [values, setValues] = useState(submission.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function change(key: string, value: FieldValue) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setDirty(true);
  }

  async function save() {
    const check = validateValues(submission.fields, values);
    const problems = Object.fromEntries(Object.entries(check.errors).filter(([, m]) => m));
    setErrors(problems);
    if (Object.keys(problems).length) return setProblem("Some fields need attention before saving.");
    setBusy(true);
    setProblem(null);
    try {
      await onSave(check.values);
      setDirty(false);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await onDelete(); // asks for confirmation
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  const edited = submission.updatedAt !== submission.createdAt;

  return (
    <SidePanel
      label="Saved form"
      title={submission.templateName}
      subtitle={
        <>
          <span title={formatFullDateTime(submission.createdAt)}>Saved {formatDateTime(submission.createdAt)}</span>
          {edited && <span title={formatFullDateTime(submission.updatedAt)}> · edited {formatDateTime(submission.updatedAt)}</span>}
        </>
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={save} disabled={!dirty || busy}>
            {busy && dirty ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
          {onOpenConversation && (
            <Button variant="quiet" onClick={onOpenConversation}>
              <MessageSquare className="size-3.5" aria-hidden /> Conversation
            </Button>
          )}
          <Button variant="ghost" className="ml-auto hover:text-alert" onClick={remove} disabled={busy}>
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </Button>
        </>
      }
    >
      <FormFieldInputs
        idPrefix={`saved-${submission.id}`}
        fields={submission.fields}
        values={values}
        errors={errors}
        disabled={busy}
        onChange={change}
      />
      {problem && <p className="mt-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
    </SidePanel>
  );
}
