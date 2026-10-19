"use client";

/**
 * A document the CEO asked to see ("show me the Northwind contract"): its
 * type, tags and coming dates, with buttons to open it (at the right page)
 * and to see all its key dates.
 */
import { CalendarDays, FileText } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, buttonStyles } from "@/components/ui/button";
import type { DocumentCard as DocumentCardData } from "@/lib/cards";
import { formatCalendarDate } from "@/lib/dates";
import { daysBetween, FACT_KIND_LABELS, isFactKind, relativeDays, todayIn } from "@/lib/facts";
import { routes } from "@/lib/routes";
import { CardFrame } from "./card-frame";

export function DocumentCard({ card }: { card: DocumentCardData }) {
  const ws = useWorkspace();
  const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const missing = !card.documentId || !ws.documents.documents.some((d) => d.id === card.documentId);

  return (
    <CardFrame
      icon={<FileText className="size-4 text-ledger" aria-hidden />}
      title={card.fileName}
      status={card.category && <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-slate">{card.category}</span>}
    >
      {card.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {card.tags.map((tag) => (
            <li key={tag} className="rounded-full border border-rule px-2 py-0.5 text-xs text-slate">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {card.facts.length > 0 && (
        <ul className="divide-y divide-rule rounded-md border border-rule text-sm">
          {card.facts.map((fact, index) => (
            <li key={index} className="flex items-baseline gap-3 px-3 py-2">
              <span className="w-28 shrink-0 text-xs text-slate">{isFactKind(fact.kind) ? FACT_KIND_LABELS[fact.kind] : fact.kind}</span>
              <span className="min-w-0 flex-1 text-ink">
                {fact.label}
                {fact.value && <span className="text-slate"> · {fact.value}</span>}
              </span>
              {fact.date && (
                <span className="shrink-0 text-right text-xs tabular-nums text-slate">
                  {formatCalendarDate(fact.date)}
                  <span className="block">{relativeDays(daysBetween(today, fact.date))}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {missing ? (
        <p className="text-sm text-slate">This document is no longer in the workspace.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => ws.openPanel({ kind: "source", documentId: card.documentId!, page: card.page ?? 1 })}>
            <FileText className="size-4" aria-hidden /> Open{card.page ? ` at page ${card.page}` : ""}
          </Button>
          <Link href={routes.keyDates(ws.workspaceId, card.documentId)} className={buttonStyles("quiet")}>
            <CalendarDays className="size-4" aria-hidden /> Key dates
          </Link>
        </div>
      )}
    </CardFrame>
  );
}
