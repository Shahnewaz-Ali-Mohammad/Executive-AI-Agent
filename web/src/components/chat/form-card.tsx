"use client";

/**
 * A form card under an answer in the chat.
 *
 *   - Filled form: the AI's values in real inputs. The CEO checks or corrects
 *     them and presses Save; nothing is stored before that. Once saved, the
 *     card says so and further changes are saved to the same record.
 *   - Template draft: the fields the AI proposed for a new form, with
 *     "Save template".
 */
import { ClipboardList, ExternalLink, FilePlus2 } from "lucide-react";
import { useState } from "react";
import { CardFrame, DraftBadge, SavedBadge } from "./card-frame";
import { FormFieldInputs } from "@/components/forms/form-field-inputs";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import {
  FIELD_TYPE_LABELS,
  validateValues,
  type FieldValue,
  type FormFillAttachment,
  type FormTemplateAttachment,
} from "@/lib/forms";

interface FormCardContext {
  messageId: string;
  workspaceId: string;
  conversationId: string | null;
  /** Called with the card's new state after a save. */
  onUpdated: (form: FormFillAttachment | FormTemplateAttachment) => void;
  /** Refresh the Forms section after something was saved. */
  onSaved: () => void;
  onOpenSubmission: (submissionId: string) => void;
  onOpenTemplate: (templateId: string) => void;
}

export function FormCard({ form, ...context }: FormCardContext & { form: FormFillAttachment | FormTemplateAttachment }) {
  return form.kind === "fill" ? <FillCard form={form} {...context} /> : <TemplateCard form={form} {...context} />;
}

function FillCard({
  form,
  messageId,
  workspaceId,
  conversationId,
  onUpdated,
  onSaved,
  onOpenSubmission,
}: FormCardContext & { form: FormFillAttachment }) {
  const [values, setValues] = useState(form.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const saved = Boolean(form.submissionId);

  function change(key: string, value: FieldValue) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setDirty(true);
  }

  async function save() {
    const check = validateValues(form.fields, values);
    const problems = Object.fromEntries(Object.entries(check.errors).filter(([, message]) => message));
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setProblem("Some fields need attention before saving.");
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const submission = form.submissionId
        ? await api.updateSubmission(form.submissionId, check.values)
        : await api.createSubmission(workspaceId, {
            templateId: form.templateId,
            values: check.values,
            conversationId,
            messageId,
          });
      setValues(submission.values);
      setDirty(false);
      onUpdated({ ...form, values: submission.values, submissionId: submission.id });
      onSaved();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save the form.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardFrame
      icon={<ClipboardList className="size-4 text-ledger" aria-hidden />}
      title={form.templateName}
      status={saved && !dirty ? <SavedBadge label="Saved" /> : <DraftBadge />}
    >
      <FormFieldInputs
        idPrefix={`card-${messageId}`}
        fields={form.fields}
        values={values}
        errors={errors}
        disabled={saving}
        onChange={change}
      />
      {problem && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {(!saved || dirty) && (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : saved ? "Save changes" : "Save"}
          </Button>
        )}
        {saved && form.submissionId && (
          <Button variant="quiet" onClick={() => onOpenSubmission(form.submissionId!)}>
            <ExternalLink className="size-3.5" aria-hidden /> Open in Forms
          </Button>
        )}
        {!saved && <span className="text-xs text-slate">Check the values; nothing is stored until you save.</span>}
      </div>
    </CardFrame>
  );
}

function TemplateCard({
  form,
  messageId,
  workspaceId,
  onUpdated,
  onSaved,
  onOpenTemplate,
}: FormCardContext & { form: FormTemplateAttachment }) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const saved = Boolean(form.templateId);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      const template = await api.createTemplate({
        name: form.name,
        description: form.description,
        fields: form.fields,
        messageId,
        workspaceId,
      });
      onUpdated({ ...form, templateId: template.id, fields: template.fields });
      onSaved();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardFrame
      icon={<FilePlus2 className="size-4 text-ledger" aria-hidden />}
      title={`New form: ${form.name}`}
      status={saved ? <SavedBadge label="Saved as template" /> : <DraftBadge />}
    >
      {form.description && <p className="text-sm text-slate">{form.description}</p>}
      <ol className="divide-y divide-rule rounded-md border border-rule">
        {form.fields.map((field, index) => (
          <li key={field.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
            <span className="w-5 text-xs text-slate tabular-nums">{index + 1}.</span>
            <span className="min-w-0 flex-1 text-ink">
              {field.label}
              {field.required && <span className="text-alert"> *</span>}
              {field.options && <span className="block text-xs text-slate">{field.options.join(" · ")}</span>}
            </span>
            <span className="text-xs text-slate">{FIELD_TYPE_LABELS[field.type]}</span>
          </li>
        ))}
      </ol>
      {problem && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {saved && form.templateId ? (
          <Button variant="quiet" onClick={() => onOpenTemplate(form.templateId!)}>
            Edit template
          </Button>
        ) : (
          <>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
            <span className="text-xs text-slate">Ask me for changes, or edit it after saving.</span>
          </>
        )}
      </div>
    </CardFrame>
  );
}
