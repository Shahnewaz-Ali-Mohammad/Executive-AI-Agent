"use client";

/**
 * The inputs for a task and for a scheduled report / reminder. Used by the
 * cards the assistant proposes in the chat and by "New task" / "New
 * schedule" on the Tasks page, so both look and behave the same.
 */
import { Field, INPUT_CLASS } from "@/components/ui/field";
import { RESPONSE_MODES, type ResponseModeId } from "@/lib/response-modes";
import type { Recurrence } from "@/lib/schedule";
import { RecurrenceEditor } from "./recurrence-editor";

export interface TaskDraft {
  title: string;
  details: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  dueTime: string | null;
}

export function TaskFields({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: TaskDraft;
  onChange: (value: TaskDraft) => void;
  disabled?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const set = <K extends keyof TaskDraft>(key: K, v: TaskDraft[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <Field id={id("title")} label="Task" wide>
        <input
          id={id("title")}
          className={INPUT_CLASS}
          value={value.title}
          placeholder="e.g. Send the Q3 sales figures"
          onChange={(e) => set("title", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field id={id("who")} label="Assigned to">
        <input
          id={id("who")}
          className={INPUT_CLASS}
          value={value.assigneeName ?? ""}
          placeholder="Name"
          onChange={(e) => set("assigneeName", e.target.value || null)}
          disabled={disabled}
        />
      </Field>
      <Field id={id("email")} label="Their email" hint="optional">
        <input
          id={id("email")}
          type="email"
          className={INPUT_CLASS}
          value={value.assigneeEmail ?? ""}
          placeholder="name@company.com"
          onChange={(e) => set("assigneeEmail", e.target.value || null)}
          disabled={disabled}
        />
      </Field>
      <Field id={id("date")} label="Due date" hint="optional">
        <input
          id={id("date")}
          type="date"
          className={INPUT_CLASS}
          value={value.dueDate ?? ""}
          onChange={(e) => set("dueDate", e.target.value || null)}
          disabled={disabled}
        />
      </Field>
      <Field id={id("time")} label="Time" hint={value.dueDate && !value.dueTime ? "17:00 if empty" : undefined}>
        <input
          id={id("time")}
          type="time"
          className={INPUT_CLASS}
          value={value.dueTime ?? ""}
          onChange={(e) => set("dueTime", e.target.value || null)}
          disabled={disabled || !value.dueDate}
        />
      </Field>
      <Field id={id("details")} label="Details" hint="optional" wide>
        <textarea
          id={id("details")}
          rows={2}
          className={`${INPUT_CLASS} resize-y`}
          value={value.details}
          onChange={(e) => set("details", e.target.value)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export interface ScheduleDraft {
  scheduleKind: "report" | "reminder";
  title: string;
  prompt: string;
  mode: ResponseModeId | null;
  recurrence: Recurrence;
  notifyEmail: string | null;
}

export function ScheduleFields({
  idPrefix,
  value,
  onChange,
  disabled,
  showKind = false,
}: {
  idPrefix: string;
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  disabled?: boolean;
  /** Let the CEO choose report or reminder (on "New schedule"). */
  showKind?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const set = <K extends keyof ScheduleDraft>(key: K, v: ScheduleDraft[K]) => onChange({ ...value, [key]: v });
  const isReport = value.scheduleKind === "report";

  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      {showKind && (
        <fieldset className="space-y-1 sm:col-span-2" disabled={disabled}>
          <legend className="text-xs font-medium text-slate">What should run</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "report", label: "Report", hint: "Answers a question from your documents" },
                { id: "reminder", label: "Reminder", hint: "Delivers a message to you" },
              ] as const
            ).map((option) => (
              <label
                key={option.id}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors ${
                  value.scheduleKind === option.id ? "border-ledger bg-ledger-soft" : "border-rule hover:border-slate"
                }`}
              >
                <input
                  type="radio"
                  name={id("kind")}
                  className="sr-only"
                  checked={value.scheduleKind === option.id}
                  onChange={() =>
                    onChange({ ...value, scheduleKind: option.id, mode: option.id === "report" ? (value.mode ?? "brief") : null })
                  }
                />
                <span className="block font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-slate">{option.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field id={id("title")} label="Name" wide>
        <input
          id={id("title")}
          className={INPUT_CLASS}
          value={value.title}
          placeholder={isReport ? "e.g. Weekly cash position" : "e.g. Call the bank"}
          onChange={(e) => set("title", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <Field id={id("prompt")} label={isReport ? "What the report should answer" : "Message"} wide>
        <textarea
          id={id("prompt")}
          rows={3}
          className={`${INPUT_CLASS} resize-y`}
          value={value.prompt}
          placeholder={
            isReport
              ? "e.g. What is our cash runway, and what changed since last week?"
              : "e.g. Call the bank about the credit line renewal."
          }
          onChange={(e) => set("prompt", e.target.value)}
          disabled={disabled}
        />
      </Field>
      <RecurrenceEditor idPrefix={id("when")} value={value.recurrence} onChange={(r) => set("recurrence", r)} disabled={disabled} />
      {isReport && (
        <Field id={id("mode")} label="Style">
          <select
            id={id("mode")}
            className={INPUT_CLASS}
            value={value.mode ?? "brief"}
            onChange={(e) => set("mode", e.target.value as ResponseModeId)}
            disabled={disabled}
          >
            {RESPONSE_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id={id("email")} label="Also email to" hint="optional">
        <input
          id={id("email")}
          type="email"
          className={INPUT_CLASS}
          value={value.notifyEmail ?? ""}
          placeholder="you@company.com"
          onChange={(e) => set("notifyEmail", e.target.value || null)}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}
