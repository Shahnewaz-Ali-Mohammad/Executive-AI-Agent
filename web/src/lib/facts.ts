/**
 * Key facts read from documents: the kinds, document categories, and small
 * date helpers. Shared by browser and server.
 */

export const DATE_FACT_KINDS = [
  "renewal",
  "expiry",
  "deadline",
  "payment",
  "notice",
  "start",
  "meeting",
  "other_date",
] as const;
export const OTHER_FACT_KINDS = ["party", "amount", "other"] as const;
export const FACT_KINDS = [...DATE_FACT_KINDS, ...OTHER_FACT_KINDS] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FACT_KIND_LABELS: Record<FactKind, string> = {
  renewal: "Renewal",
  expiry: "Expiry",
  deadline: "Deadline",
  payment: "Payment due",
  notice: "Notice / cancel by",
  start: "Start / effective",
  meeting: "Meeting / event",
  other_date: "Other date",
  party: "Party",
  amount: "Amount",
  other: "Other",
};

export function isDateKind(kind: string): boolean {
  return (DATE_FACT_KINDS as readonly string[]).includes(kind);
}

export function isFactKind(value: unknown): value is FactKind {
  return typeof value === "string" && (FACT_KINDS as readonly string[]).includes(value);
}

export const DOCUMENT_CATEGORIES = [
  "Contract",
  "Invoice",
  "Board pack",
  "Financial report",
  "Policy",
  "Proposal",
  "Letter",
  "Minutes",
  "HR",
  "Legal",
  "Other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type FactStatus = "unchecked" | "confirmed" | "dismissed";

/** Today as "YYYY-MM-DD" in a time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "today" · "tomorrow" · "in 23 days" · "yesterday" · "12 days ago" */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Add days to a "YYYY-MM-DD" date. */
export function addDays(dateText: string, days: number): string {
  const [y, m, d] = dateText.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** How many dates (not dismissed) fall in the next `days` days, today included. */
export function countUpcoming(facts: { date: string | null; status: string }[], today: string, days: number): number {
  return facts.filter((f) => {
    if (!f.date || f.status === "dismissed") return false;
    const d = daysBetween(today, f.date);
    return d >= 0 && d <= days;
  }).length;
}

/** Today in the browser's time zone. */
export function todayHere(): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}
