/**
 * Recurring schedules: how often something runs and when it runs next.
 *
 * Times are wall-clock times in the CEO's time zone ("every weekday at 07:00
 * Asia/Dhaka"), converted to exact moments with the built-in Intl time-zone
 * data, so daylight-saving changes elsewhere are handled too.
 *
 * Shared by browser (to describe a schedule) and server (to compute the next
 * run). No dependencies.
 */
import { z } from "zod";

export const FREQUENCIES = ["once", "daily", "weekdays", "weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** 0 = Sunday … 6 = Saturday (like Date.getDay). */
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const recurrenceSchema = z.object({
  frequency: z.enum(FREQUENCIES),
  /** Wall-clock time, "HH:MM" (24-hour). */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour)."),
  /** For "weekly": which days (0 = Sunday). */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  /** For "monthly": day of the month (1–31; short months use their last day). */
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  /** For "once": the date; for the others: don't run before this date. "YYYY-MM-DD". */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

/** A valid IANA time zone, or the fallback. */
export function safeTimeZone(timeZone: string | null | undefined, fallback = "UTC"): string {
  if (!timeZone) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return fallback;
  }
}

interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

/** The wall-clock date and time of `date` in `timeZone`. */
export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY_SHORT.indexOf(get("weekday")),
  };
}

/** Milliseconds `timeZone` is ahead of UTC at that moment. */
function offsetMs(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** The exact moment of a wall-clock date and time in `timeZone`. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone); // corrects across a DST change
  return new Date(second);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The first run strictly after `after`, or null when there is none (a
 * one-off that has passed). A one-off whose time has already passed today
 * returns null too; callers decide whether to run it straight away.
 */
export function nextOccurrence(recurrence: Recurrence, timeZone: string, after: Date): Date | null {
  const [hour, minute] = recurrence.time.split(":").map(Number);
  const start = recurrence.date ? recurrence.date.split("-").map(Number) : null;

  if (recurrence.frequency === "once") {
    const today = localParts(after, timeZone);
    const [y, m, d] = start ?? [today.year, today.month, today.day];
    const at = zonedTime(y, m, d, hour, minute, timeZone);
    return at > after ? at : null;
  }

  // Walk forward day by day (local calendar) until a matching day's time is after `after`.
  const today = localParts(after, timeZone);
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
  for (let i = 0; i < 400; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    if (start && Date.UTC(y, m - 1, d) < Date.UTC(start[0], start[1] - 1, start[2])) continue;

    const matches =
      recurrence.frequency === "daily" ||
      (recurrence.frequency === "weekdays" && weekday >= 1 && weekday <= 5) ||
      (recurrence.frequency === "weekly" && (recurrence.weekdays?.length ? recurrence.weekdays : [1]).includes(weekday)) ||
      (recurrence.frequency === "monthly" && d === Math.min(recurrence.dayOfMonth ?? 1, daysInMonth(y, m)));
    if (!matches) continue;

    const at = zonedTime(y, m, d, hour, minute, timeZone);
    if (at > after) return at;
  }
  return null;
}

/** "Every weekday at 07:00", "Every Monday and Thursday at 09:30", "Once on 15 Oct 2026 at 18:00" */
export function describeRecurrence(recurrence: Recurrence): string {
  const at = `at ${recurrence.time}`;
  switch (recurrence.frequency) {
    case "once": {
      if (!recurrence.date) return `Once, ${at}`;
      const [y, m, d] = recurrence.date.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
      return `Once on ${date} ${at}`;
    }
    case "daily":
      return `Every day ${at}`;
    case "weekdays":
      return `Every weekday ${at}`;
    case "weekly": {
      const days = (recurrence.weekdays?.length ? recurrence.weekdays : [1]).map((d) => WEEKDAY_NAMES[d]);
      const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : days[0];
      return `Every ${list} ${at}`;
    }
    case "monthly": {
      const day = recurrence.dayOfMonth ?? 1;
      const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
      return `Every month on the ${day}${suffix} ${at}`;
    }
  }
}
