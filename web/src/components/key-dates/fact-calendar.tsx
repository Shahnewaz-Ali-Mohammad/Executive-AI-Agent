"use client";

/**
 * Month calendar of the key dates. Each day shows its dates (coloured by
 * how soon they are); pick a day to list them underneath.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { daysBetween } from "@/lib/facts";
import type { FactDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FactRow } from "./fact-row";

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function FactCalendar({ facts, today }: { facts: FactDTO[]; today: string }) {
  const [ty, tm] = today.split("-").map(Number);
  const [month, setMonth] = useState({ y: ty, m: tm - 1 });
  const [picked, setPicked] = useState<string | null>(null);

  const byDay = new Map<string, FactDTO[]>();
  for (const fact of facts) {
    if (!fact.date) continue;
    byDay.set(fact.date, [...(byDay.get(fact.date) ?? []), fact]);
  }

  const first = new Date(Date.UTC(month.y, month.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(month.y, month.m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  const move = (delta: number) => {
    setPicked(null);
    setMonth(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };
  const pickedFacts = picked ? (byDay.get(picked) ?? []) : [];
  const inMonth = facts.filter((f) => f.date?.startsWith(iso(month.y, month.m, 1).slice(0, 7))).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <IconButton aria-label="Previous month" onClick={() => move(-1)}>
          <ChevronLeft className="size-4" aria-hidden />
        </IconButton>
        <p className="text-sm font-medium text-ink" aria-live="polite">
          {MONTH.format(first)} <span className="font-normal text-slate">· {inMonth} date{inMonth === 1 ? "" : "s"}</span>
        </p>
        <IconButton aria-label="Next month" onClick={() => move(1)}>
          <ChevronRight className="size-4" aria-hidden />
        </IconButton>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-rule bg-rule gap-px">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-paper py-1.5 text-center text-[0.7rem] text-slate" aria-hidden>
            {d}
          </div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div key={`e${index}`} className="min-h-16 bg-paper/50 sm:min-h-24" />;
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setPicked(day === picked ? null : day)}
              aria-pressed={picked === day}
              aria-label={`${day}${list.length ? `, ${list.length} date${list.length > 1 ? "s" : ""}` : ""}`}
              className={cn(
                "flex min-h-16 flex-col items-stretch gap-0.5 bg-surface p-1 text-left align-top transition-colors hover:bg-paper sm:min-h-24 sm:p-1.5",
                picked === day && "bg-ledger-soft/60",
              )}
            >
              <span
                className={cn(
                  "self-start rounded-full px-1.5 text-xs tabular-nums",
                  isToday ? "bg-ledger font-semibold text-surface" : "text-slate",
                )}
              >
                {Number(day.slice(8))}
              </span>
              {list.slice(0, 2).map((fact) => {
                const days = daysBetween(today, day);
                return (
                  <span
                    key={fact.id}
                    className={cn(
                      "hidden truncate rounded px-1 py-0.5 text-[0.68rem] sm:block",
                      days < 0 ? "bg-alert-soft text-alert" : days <= 7 ? "bg-amber-soft text-amber" : "bg-ledger-soft text-ledger",
                      fact.status === "unchecked" && "border border-dashed border-current",
                    )}
                  >
                    {fact.label}
                  </span>
                );
              })}
              {list.length > 0 && (
                <span className="flex gap-0.5 sm:hidden" aria-hidden>
                  {list.slice(0, 3).map((f) => (
                    <span key={f.id} className="size-1.5 rounded-full bg-ledger" />
                  ))}
                </span>
              )}
              {list.length > 2 && <span className="hidden text-[0.65rem] text-slate sm:block">+{list.length - 2} more</span>}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-slate uppercase">
            {new Date(`${picked}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          </p>
          {pickedFacts.length === 0 ? (
            <p className="text-sm text-slate">Nothing on this day.</p>
          ) : (
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
              {pickedFacts.map((fact) => (
                <FactRow key={fact.id} fact={fact} today={today} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
