"use client";

/** Pick how often something runs: once, every day, every weekday, weekly on chosen days, or monthly. */
import { Field, INPUT_CLASS } from "@/components/ui/field";
import { FREQUENCIES, WEEKDAY_NAMES, type Frequency, type Recurrence } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: "Once",
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** Monday first, the way calendars at work read. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RecurrenceEditor({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: Recurrence;
  onChange: (value: Recurrence) => void;
  disabled?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch });

  return (
    <>
      <Field id={id("frequency")} label="Repeats">
        <select
          id={id("frequency")}
          className={INPUT_CLASS}
          value={value.frequency}
          disabled={disabled}
          onChange={(e) => {
            const frequency = e.target.value as Frequency;
            set({
              frequency,
              weekdays: frequency === "weekly" ? (value.weekdays?.length ? value.weekdays : [1]) : undefined,
              dayOfMonth: frequency === "monthly" ? (value.dayOfMonth ?? 1) : undefined,
            });
          }}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABELS[f]}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id("time")} label="At">
        <input
          id={id("time")}
          type="time"
          required
          className={INPUT_CLASS}
          value={value.time}
          disabled={disabled}
          onChange={(e) => e.target.value && set({ time: e.target.value })}
        />
      </Field>

      {value.frequency === "once" && (
        <Field id={id("date")} label="On">
          <input
            id={id("date")}
            type="date"
            className={INPUT_CLASS}
            value={value.date ?? ""}
            disabled={disabled}
            onChange={(e) => set({ date: e.target.value || undefined })}
          />
        </Field>
      )}

      {value.frequency === "monthly" && (
        <Field id={id("day")} label="Day of the month" hint="short months use their last day">
          <input
            id={id("day")}
            type="number"
            min={1}
            max={31}
            className={INPUT_CLASS}
            value={value.dayOfMonth ?? 1}
            disabled={disabled}
            onChange={(e) => set({ dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </Field>
      )}

      {value.frequency === "weekly" && (
        <fieldset className="space-y-1 sm:col-span-2" disabled={disabled}>
          <legend className="text-xs font-medium text-slate">On</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((day) => {
              const on = value.weekdays?.includes(day) ?? false;
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const days = new Set(value.weekdays ?? []);
                    if (on) days.delete(day);
                    else days.add(day);
                    set({ weekdays: [...days].sort() });
                  }}
                  className={cn(
                    "min-w-11 rounded-md border px-2 py-1 text-xs transition-colors",
                    on ? "border-ledger bg-ledger-soft text-ledger" : "border-rule text-slate hover:border-slate",
                  )}
                >
                  {WEEKDAY_NAMES[day].slice(0, 3)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </>
  );
}
