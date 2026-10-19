"use client";

/**
 * Key dates: renewals, expiries, deadlines, notice dates and payments read
 * from the workspace's documents, plus parties and amounts. Each one links to
 * the page it came from and can be confirmed, corrected or dismissed.
 * Reminders go out before each date (see ReminderSettings).
 */
import { AlertTriangle, CalendarDays, CalendarRange, Download, List, Loader2, Plus, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FactCalendar } from "@/components/key-dates/fact-calendar";
import { FactEditor } from "@/components/key-dates/fact-editor";
import { FactRow, kindLabel } from "@/components/key-dates/fact-row";
import { ReminderSettings } from "@/components/key-dates/reminder-settings";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, buttonStyles } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { EmptyBlock, FilterChips, ListSkeleton, Page, PageHeader, Section } from "@/components/ui/page";
import { api } from "@/lib/api-client";
import { daysBetween, DATE_FACT_KINDS, isDateKind, todayHere } from "@/lib/facts";
import { routes } from "@/lib/routes";
import type { FactDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

type Range = "next30" | "next90" | "upcoming" | "past" | "unchecked" | "dismissed";

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

function inRange(fact: FactDTO, range: Range, today: string): boolean {
  if (range === "dismissed") return fact.status === "dismissed";
  if (fact.status === "dismissed") return false;
  if (range === "unchecked") return fact.status === "unchecked";
  const days = daysBetween(today, fact.date!);
  if (range === "past") return days < 0;
  if (range === "next30") return days >= 0 && days <= 30;
  if (range === "next90") return days >= 0 && days <= 90;
  return days >= 0;
}

export function KeyDatesPage() {
  const ws = useWorkspace();
  const { confirm, toast } = useFeedback();
  const params = useSearchParams();
  const { facts, loading, error, clearError } = ws.keyFacts;
  const docs = ws.documents.documents;
  const today = todayHere();

  const documentFilter = params.get("document");
  const filterDoc = documentFilter ? docs.find((d) => d.id === documentFilter) : null;

  const [range, setRange] = useState<Range>("next90");
  const [kind, setKind] = useState<string>("all");
  const [layout, setLayout] = useState<"list" | "calendar">("list");
  const [adding, setAdding] = useState(false);

  const scoped = filterDoc ? facts.filter((f) => f.documentId === filterDoc.id) : facts;
  const dated = scoped.filter((f) => f.date && isDateKind(f.kind));
  const others = scoped.filter((f) => !f.date && f.status !== "dismissed");
  const ofKind = dated.filter((f) => kind === "all" || f.kind === kind);
  const visible = ofKind
    .filter((f) => inRange(f, range, today))
    // Past dates: most recent first.
    .sort((a, b) => (range === "past" ? b.date!.localeCompare(a.date!) : a.date!.localeCompare(b.date!)));

  const count = (r: Range) => ofKind.filter((f) => inRange(f, r, today)).length;
  const overdueUnchecked = dated.filter(
    (f) => f.status === "unchecked" && daysBetween(today, f.date!) < 0 && daysBetween(today, f.date!) >= -30,
  ).length;

  const ready = docs.filter((d) => d.status === "ready");
  const reading = ready.filter((d) => d.factsStatus === "pending" || d.factsStatus === "running");
  const failed = ready.filter((d) => d.factsStatus === "failed");
  const notRead = ready.filter((d) => d.factsStatus === "not_read");
  const withWarnings = (filterDoc ? [filterDoc] : ready).filter((d) => d.warnings.length > 0);

  // Group the list by month.
  const groups: { month: string; items: FactDTO[] }[] = [];
  for (const fact of visible) {
    const month = fact.date!.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) last.items.push(fact);
    else groups.push({ month, items: [fact] });
  }

  // Parties, amounts and other undated facts, grouped by document.
  const otherByDoc = new Map<string, FactDTO[]>();
  for (const fact of others) otherByDoc.set(fact.fileName, [...(otherByDoc.get(fact.fileName) ?? []), fact]);

  async function readAgain() {
    const ok = await confirm({
      title: filterDoc ? `Read “${filterDoc.fileName}” again?` : "Read all documents again?",
      message:
        "The AI reads them again for dates and facts. Entries you confirmed, corrected or dismissed are kept; the rest are replaced.",
      confirmLabel: "Read again",
    });
    if (!ok) return;
    const queued = await ws.documents.rescan(filterDoc?.id);
    if (queued > 0) toast(`Reading ${queued} document${queued > 1 ? "s" : ""} · new dates appear here`);
  }

  const kindOptions = [
    { id: "all", label: "All types" },
    ...DATE_FACT_KINDS.filter((k) => dated.some((f) => f.kind === k)).map((k) => ({ id: k, label: kindLabel(k) })),
  ];

  return (
    <Page>
      <PageHeader
        title="Key dates"
        description="Renewals, expiries, deadlines, notice dates and payments found in your documents. Check each one against its page; you're reminded before each date."
        actions={
          <>
            <Button variant="quiet" onClick={() => void readAgain()} disabled={ready.length === 0 || reading.length > 0}>
              <RefreshCw className={cn("size-4", reading.length > 0 && "animate-spin")} aria-hidden /> Read again
            </Button>
            <a
              href={api.keyFactsExportUrl(ws.workspaceId)}
              className={buttonStyles("quiet", facts.length === 0 ? "pointer-events-none opacity-50" : undefined)}
              aria-disabled={facts.length === 0}
              download
            >
              <Download className="size-4" aria-hidden /> Excel
            </a>
            <Button onClick={() => setAdding((v) => !v)} disabled={ready.length === 0} aria-expanded={adding}>
              <Plus className="size-4" aria-hidden /> Add a date
            </Button>
          </>
        }
      />

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss message">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {filterDoc && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-surface px-3 py-2 text-sm">
          <span className="text-slate">Showing</span>
          <span className="font-medium text-ink">{filterDoc.fileName}</span>
          {filterDoc.category && <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-slate">{filterDoc.category}</span>}
          <Link href={routes.keyDates(ws.workspaceId)} className="ml-auto text-ledger underline-offset-2 hover:underline">
            Show all documents
          </Link>
        </div>
      )}

      {reading.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading {reading.length} document{reading.length > 1 ? "s" : ""} for dates and facts…
        </p>
      )}
      {notRead.length > 0 && !filterDoc && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-surface px-3 py-2 text-sm" role="status">
          <CalendarDays className="size-4 text-ledger" aria-hidden />
          <span className="flex-1 text-ink">
            {notRead.length} document{notRead.length > 1 ? "s were" : " was"} added before key dates were read automatically.
          </span>
          <Button
            variant="quiet"
            className="py-1 text-xs"
            onClick={async () => {
              const count = await ws.documents.rescan(undefined, { onlyNotRead: true });
              if (count) toast(`Reading ${count} document${count > 1 ? "s" : ""} · new dates appear here`);
            }}
          >
            Read them now
          </Button>
        </div>
      )}
      {failed.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert" role="alert">
          <AlertTriangle className="size-4" aria-hidden />
          <span className="flex-1">
            Couldn&apos;t read dates from {failed.map((d) => d.fileName).join(", ")}.
          </span>
          <Button variant="quiet" className="py-1 text-xs" onClick={() => void ws.documents.rescan(failed.length === 1 ? failed[0].id : undefined)}>
            Try again
          </Button>
        </div>
      )}

      {adding && (
        <div className="mb-6">
          <FactEditor
            idPrefix="new-fact"
            documents={ready}
            initial={{ documentId: filterDoc?.id ?? "", kind: "renewal", label: "", date: null, value: null, page: null }}
            saveLabel="Add"
            onCancel={() => setAdding(false)}
            onSave={async (draft) => {
              const ok = await ws.keyFacts.add(draft);
              if (ok) {
                setAdding(false);
                toast("Added · you'll be reminded before it");
              }
              return ok;
            }}
          />
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : ready.length === 0 && facts.length === 0 ? (
        <EmptyBlock icon={<CalendarDays className="size-5" aria-hidden />} title="No documents yet">
          Upload contracts, invoices or board packs. Their renewal dates, deadlines and payments appear here
          automatically.
          <div className="mt-3">
            <Button onClick={ws.pickFiles}>Upload documents</Button>
          </div>
        </EmptyBlock>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {layout === "list" ? (
              <FilterChips
                label="Show"
                value={range}
                onChange={setRange}
                options={[
                  { id: "next30", label: "Next 30 days", count: count("next30") },
                  { id: "next90", label: "Next 90 days", count: count("next90") },
                  { id: "upcoming", label: "All upcoming", count: count("upcoming") },
                  { id: "past", label: "Past", count: count("past") },
                  { id: "unchecked", label: "To check", count: count("unchecked") },
                  ...(count("dismissed") > 0 ? [{ id: "dismissed" as const, label: "Dismissed", count: count("dismissed") }] : []),
                ]}
              />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {kindOptions.length > 2 && (
                <select
                  aria-label="Type of date"
                  className="rounded-md border border-rule bg-surface px-2 py-1 text-xs text-ink"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {kindOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex rounded-md border border-rule bg-surface p-0.5" role="group" aria-label="View">
                {(
                  [
                    { id: "list", label: "List", Icon: List },
                    { id: "calendar", label: "Calendar", Icon: CalendarRange },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={layout === id}
                    onClick={() => setLayout(id)}
                    className={cn(
                      "flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
                      layout === id ? "bg-ink text-paper" : "text-slate hover:text-ink",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {overdueUnchecked > 0 && range !== "past" && layout === "list" && (
            <p className="mb-4 text-sm text-alert">
              {overdueUnchecked} date{overdueUnchecked > 1 ? "s" : ""} passed in the last 30 days without being checked.{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => setRange("past")}>
                Show past dates
              </button>
            </p>
          )}

          {layout === "calendar" ? (
            <FactCalendar facts={ofKind.filter((f) => f.status !== "dismissed")} today={today} />
          ) : visible.length === 0 ? (
            <EmptyBlock icon={<CalendarDays className="size-5" aria-hidden />} title="Nothing here">
              {dated.length === 0
                ? reading.length > 0
                  ? "The documents are still being read."
                  : "No dates were found in the documents yet. Add one yourself, or read the documents again."
                : "No dates match this filter."}
            </EmptyBlock>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.month} aria-label={MONTH.format(new Date(`${group.month}-01T00:00:00Z`))}>
                  <h2 className="mb-2 text-xs font-medium tracking-wide text-slate uppercase">
                    {MONTH.format(new Date(`${group.month}-01T00:00:00Z`))}
                  </h2>
                  <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
                    {group.items.map((fact) => (
                      <FactRow key={fact.id} fact={fact} today={today} showDocument={!filterDoc} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {otherByDoc.size > 0 && (
            <Section title="Parties, amounts and other facts" count={others.length} className="mt-10">
              <div className="space-y-4">
                {[...otherByDoc.entries()].map(([fileName, items]) => (
                  <div key={fileName}>
                    {!filterDoc && <p className="mb-1.5 text-sm font-medium text-ink">{fileName}</p>}
                    <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
                      {items.map((fact) => (
                        <FactRow key={fact.id} fact={fact} today={today} showDocument={false} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {withWarnings.length > 0 && (
            <Section title="Possibly missing" count={withWarnings.reduce((n, d) => n + d.warnings.length, 0)} className="mt-10">
              <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
                {withWarnings.map((doc) => (
                  <li key={doc.id} className="flex items-start gap-3 px-4 py-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => ws.openPanel({ kind: "source", documentId: doc.id, page: 1 })}
                        className="text-sm font-medium text-ledger underline-offset-2 hover:underline"
                      >
                        {doc.fileName}
                      </button>
                      <ul className="mt-0.5 list-disc pl-4 text-sm text-slate">
                        {doc.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="mt-10">
            <ReminderSettings />
          </div>
        </>
      )}
    </Page>
  );
}
