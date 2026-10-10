"use client";

/**
 * The inputs for a form's fields, laid out in a responsive grid. Used by the
 * form card in the chat and by the saved-form panel.
 *
 * Required fields that are still empty are marked "Needed" (amber), and
 * problems found when saving are shown under the field (red).
 */
import type { FieldValue, FormField, FormValues } from "@/lib/forms";
import { cn } from "@/lib/utils";

interface FormFieldInputsProps {
  fields: FormField[];
  values: FormValues;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: FieldValue) => void;
  /** Prefix for input ids, so several forms can be on screen at once. */
  idPrefix: string;
}

const INPUT =
  "w-full rounded-md border bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-slate/60 focus:border-ledger focus:outline-none disabled:opacity-70";

export function FormFieldInputs({ fields, values, errors = {}, disabled, onChange, idPrefix }: FormFieldInputsProps) {
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const value = values[field.key] ?? null;
        const empty = value === null || value === "";
        const needed = field.required && empty && field.type !== "checkbox";
        const error = errors[field.key];
        const wide = field.type === "long_text";
        const border = error ? "border-alert" : needed ? "border-amber" : "border-rule";

        if (field.type === "checkbox") {
          return (
            <div key={field.key} className={cn("flex items-start gap-2 pt-1", wide && "sm:col-span-2")}>
              <input
                id={id}
                type="checkbox"
                checked={value === true}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--ledger)]"
              />
              <label htmlFor={id} className="text-sm text-ink">
                {field.label}
                {field.required && <span className="text-alert"> *</span>}
                {field.hint && <span className="block text-xs text-slate">{field.hint}</span>}
                {error && <span className="block text-xs text-alert">{error}</span>}
              </label>
            </div>
          );
        }

        return (
          <div key={field.key} className={cn("space-y-1", wide && "sm:col-span-2")}>
            <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-medium text-slate">
              <span>
                {field.label}
                {field.required && <span className="text-alert"> *</span>}
              </span>
              {needed && !error && <span className="font-normal text-amber">Needed</span>}
            </label>
            {field.type === "long_text" ? (
              <textarea
                id={id}
                rows={3}
                value={value === null ? "" : String(value)}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
                className={cn(INPUT, border, "resize-y")}
              />
            ) : field.type === "select" ? (
              <select
                id={id}
                value={value === null ? "" : String(value)}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value || null)}
                className={cn(INPUT, border)}
              >
                <option value="">Choose…</option>
                {/* Keep a value the AI gave that isn't one of the choices, so the error makes sense. */}
                {value !== null && !field.options?.includes(String(value)) && (
                  <option value={String(value)}>{String(value)}</option>
                )}
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                inputMode={field.type === "number" ? "decimal" : undefined}
                value={value === null ? "" : String(value)}
                disabled={disabled}
                onChange={(event) => onChange(field.key, event.target.value)}
                className={cn(INPUT, border)}
              />
            )}
            {field.hint && !error && <p className="text-xs text-slate">{field.hint}</p>}
            {error && <p className="text-xs text-alert">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}
