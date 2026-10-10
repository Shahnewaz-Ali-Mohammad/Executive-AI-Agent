/**
 * Forms: shared types and rules, used by the browser and the server.
 *
 * A form template is a name plus a list of fields. A saved form keeps its own
 * copy of the fields next to the values, so editing a template later never
 * changes how an old saved form reads.
 *
 * Values are checked here (types, required fields, dropdown choices) both in
 * the browser before saving and on the server before writing to the database.
 */
import { z } from "zod";

export const FIELD_TYPES = ["text", "long_text", "number", "date", "select", "checkbox", "email", "phone"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Yes / no",
  email: "Email",
  phone: "Phone",
};

export interface FormField {
  /** Stable machine name, e.g. "start_date". Generated from the label. */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Choices for a dropdown. */
  options?: string[];
  /** Extra guidance for whoever fills it in (shown under the field, and given to the AI). */
  hint?: string;
}

export type FieldValue = string | number | boolean | null;
export type FormValues = Record<string, FieldValue>;

// --- Template input (from the editor or the AI) ------------------------------------

export const fieldInputSchema = z.object({
  key: z.string().trim().max(64).optional(),
  label: z.string().trim().min(1, "Every field needs a label.").max(120),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  hint: z.string().trim().max(300).optional(),
});

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "The form needs a name.").max(120),
  description: z.string().trim().max(500).optional().default(""),
  fields: z.array(fieldInputSchema).min(1, "Add at least one field.").max(60, "A form can have at most 60 fields."),
});

export type TemplateInput = z.input<typeof templateInputSchema>;

/** "Start date" → "start_date" */
export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || "field";
}

/**
 * Turn editor/AI input into clean fields: unique keys (existing keys are kept
 * so saved forms still match), dropdowns must have choices.
 */
export function normalizeFields(input: z.output<typeof templateInputSchema>["fields"]): FormField[] {
  const used = new Set<string>();
  return input.map((field) => {
    let key = field.key && /^[a-z0-9_]+$/.test(field.key) ? field.key : slugify(field.label);
    const base = key;
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
    used.add(key);

    const options = field.type === "select" ? [...new Set(field.options ?? [])] : undefined;
    if (field.type === "select" && (!options || options.length === 0)) {
      throw new Error(`The dropdown "${field.label}" needs at least one choice.`);
    }
    return {
      key,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(options ? { options } : {}),
      ...(field.hint ? { hint: field.hint } : {}),
    };
  });
}

// --- Values -------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/**
 * Clean one value for its field type. Returns the cleaned value, or an error
 * message when it can't be used.
 */
function normalizeValue(field: FormField, raw: unknown): { value: FieldValue; error?: string } {
  if (field.type === "checkbox") {
    if (raw === true || raw === "true" || raw === "yes") return { value: true };
    if (raw === false || raw === "false" || raw === "no") return { value: false };
    return { value: null };
  }
  if (isEmpty(raw)) return { value: null };

  const text = String(raw).trim();
  switch (field.type) {
    case "number": {
      const number = typeof raw === "number" ? raw : Number(text.replace(/[,\s]/g, ""));
      return Number.isFinite(number) ? { value: number } : { value: text, error: "Must be a number." };
    }
    case "date":
      return DATE_RE.test(text) && !Number.isNaN(Date.parse(text))
        ? { value: text }
        : { value: text, error: "Must be a date (YYYY-MM-DD)." };
    case "select": {
      const match = field.options?.find((option) => option.toLowerCase() === text.toLowerCase());
      return match ? { value: match } : { value: text, error: "Pick one of the listed choices." };
    }
    case "email":
      return EMAIL_RE.test(text) ? { value: text } : { value: text, error: "Must be an email address." };
    case "phone":
      return /^[+()\d\s-]{5,}$/.test(text) ? { value: text } : { value: text, error: "Must be a phone number." };
    default:
      return { value: text.slice(0, field.type === "long_text" ? 5000 : 500) };
  }
}

export interface ValidationResult {
  values: FormValues;
  /** Field key → problem. Empty when the form can be saved. */
  errors: Record<string, string>;
  /** Required fields that are still empty. */
  missing: string[];
}

/** Check every field; unknown keys are dropped. */
export function validateValues(fields: FormField[], raw: Record<string, unknown>): ValidationResult {
  const values: FormValues = {};
  const errors: Record<string, string> = {};
  const missing: string[] = [];
  for (const field of fields) {
    const { value, error } = normalizeValue(field, raw[field.key]);
    values[field.key] = value;
    if (error) errors[field.key] = error;
    else if (field.required && (value === null || (field.type === "checkbox" && value !== true && value !== false))) {
      missing.push(field.key);
      errors[field.key] = "Required.";
    }
  }
  return { values, errors, missing };
}

/** "Rahim", "12 Oct 2026", "Yes" … for read-only display. */
export function formatValue(field: FormField, value: FieldValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (field.type === "date" && typeof value === "string" && DATE_RE.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(value);
}

// --- Forms inside chat messages -------------------------------------------------------

/** A form the AI filled in from the conversation, shown as a card in the chat. */
export interface FormFillAttachment {
  kind: "fill";
  templateId: string;
  templateName: string;
  fields: FormField[];
  values: FormValues;
  /** Set once the CEO saved it. */
  submissionId?: string | null;
}

/** A new form template the AI drafted from a description, shown as a card in the chat. */
export interface FormTemplateAttachment {
  kind: "template";
  name: string;
  description: string;
  fields: FormField[];
  /** Set once the CEO saved it as a template. */
  templateId?: string | null;
}

export type FormAttachment = FormFillAttachment | FormTemplateAttachment;

/**
 * Short text version of a form card, given to the AI as conversation history
 * so a follow-up ("the department is Finance") updates the same form.
 */
export function describeAttachment(attachment: FormAttachment): string {
  if (attachment.kind === "template") {
    const status = attachment.templateId ? "saved" : "not saved yet";
    return `[Form template draft "${attachment.name}" (${status}) with fields: ${attachment.fields
      .map((f) => `${f.label} (${f.type}${f.required ? ", required" : ""})`)
      .join("; ")}]`;
  }
  const status = attachment.submissionId ? "saved" : "not saved yet";
  const values = attachment.fields
    .map((f) => `${f.label}: ${attachment.values[f.key] === null || attachment.values[f.key] === undefined ? "(empty)" : String(attachment.values[f.key])}`)
    .join("; ");
  return `[Form "${attachment.templateName}" (${status}) — ${values}]`;
}
