/**
 * Date and time formatting used across the interface.
 *
 * One locale (en-GB: "8 Oct", 24-hour clock) so dates read the same on every
 * device. Times are shown in the device's own time zone.
 */
const LOCALE = "en-GB";
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days between `date` and today (0 = today, 1 = yesterday). */
function daysAgo(date: Date, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

/** "15:56" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Date and time, as short as is still unambiguous:
 * "Today, 15:56" · "Yesterday, 13:53" · "Thu 8 Oct, 13:53" · "8 Oct 2025, 13:53"
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = daysAgo(date, now);
  const time = formatTime(iso);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
  }
  return `${date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

/** Full date and time for tooltips: "Saturday 10 October 2026 at 15:56" */
export function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: "full", timeStyle: "short" });
}

/** Divider between chat messages of different days: "Today" · "Yesterday" · "Thursday 8 October" · "8 October 2025" */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = daysAgo(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  }
  return date.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

/** True when both timestamps fall on the same calendar day. */
export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/**
 * Which group a conversation goes under in the list, by its last activity:
 * "Today" · "Yesterday" · "Previous 7 days" · "Earlier this month" · "September 2026"
 */
export function formatRecencyGroup(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = daysAgo(date, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return "Earlier this month";
  return date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}
