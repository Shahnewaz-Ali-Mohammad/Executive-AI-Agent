"use client";

/**
 * One key date or fact: when, what, where it comes from (opens the page),
 * and Confirm / Edit / Dismiss.
 */
import { Check, FileText, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button, IconButton } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { daysBetween, FACT_KIND_LABELS, isFactKind, relativeDays, type FactKind } from "@/lib/facts";
import type { FactDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FactEditor } from "./fact-editor";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });

function dayParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return { day: d.getUTCDate(), weekday: WEEKDAY.format(d) };
}

export function kindLabel(kind: string): string {
  return isFactKind(kind) ? FACT_KIND_LABELS[kind] : kind;
}

/** Colour of "in 5 days": overdue red, this week amber, otherwise quiet. */
export function urgencyClass(days: number | null): string {
  if (days === null) return "text-slate";
  if (days < 0) return "text-alert";
  if (days <= 7) return "text-amber";
  return "text-slate";
}

export function FactRow({ fact, today, showDocument = true }: { fact: FactDTO; today: string; showDocument?: boolean }) {
  const ws = useWorkspace();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const days = fact.date ? daysBetween(today, fact.date) : null;
  const dismissed = fact.status === "dismissed";

  if (editing) {
    return (
      <li className="px-3 py-3 sm:px-4">
        <FactEditor
          idPrefix={`fact-${fact.id}`}
          initial={{
            documentId: fact.documentId,
            kind: (isFactKind(fact.kind) ? fact.kind : "other") as FactKind,
            label: fact.label,
            date: fact.date,
            value: fact.value,
            page: fact.page,
          }}
          saveLabel="Save"
          onCancel={() => setEditing(false)}
          onSave={async (draft) => {
            const ok = await ws.keyFacts.update(fact.id, {
              kind: draft.kind,
              label: draft.label,
              date: draft.date,
              value: draft.value,
              page: draft.page,
              status: "confirmed",
            });
            if (ok) {
              setEditing(false);
              toast("Saved and confirmed");
            }
            return ok;
          }}
        />
      </li>
    );
  }

  return (
    <li className={cn("flex items-start gap-3 px-3 py-3 sm:px-4", dismissed && "opacity-60")}>
      {fact.date ? (
        <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-rule bg-paper py-1 text-center">
          <span className="text-[0.65rem] text-slate uppercase">{dayParts(fact.date).weekday}</span>
          <span className="text-lg leading-tight font-semibold text-ink tabular-nums">{dayParts(fact.date).day}</span>
        </div>
      ) : (
        <div className="flex w-12 shrink-0 items-center justify-center pt-1 text-slate">
          <FileText className="size-4" aria-hidden />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-ink">{fact.label}</span>
          {days !== null && (
            <span className={cn("text-xs tabular-nums", urgencyClass(days), days <= 7 && "font-medium")}>
              {relativeDays(days)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate">
          <span className="rounded-full bg-ledger-soft px-2 py-0.5 text-ledger">{kindLabel(fact.kind)}</span>
          {fact.value && <span className="text-ink">{fact.value}</span>}
          {showDocument && (
            <button
              type="button"
              onClick={() => ws.openPanel({ kind: "source", documentId: fact.documentId, page: fact.page ?? 1 })}
              className="max-w-full truncate text-ledger underline-offset-2 hover:underline"
              title="Open the document at this page"
            >
              {fact.fileName}
              {fact.page ? `, p. ${fact.page}` : ""}
            </button>
          )}
          {!showDocument && fact.page && (
            <button
              type="button"
              onClick={() => ws.openPanel({ kind: "source", documentId: fact.documentId, page: fact.page ?? 1 })}
              className="text-ledger underline-offset-2 hover:underline"
            >
              p. {fact.page}
            </button>
          )}
          {fact.source === "manual" && <span>added by you</span>}
        </div>
        {fact.quote && <p className="mt-1 line-clamp-2 text-xs text-slate italic">“{fact.quote}”</p>}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {dismissed ? (
          <>
            <IconButton aria-label="Restore" onClick={() => void ws.keyFacts.update(fact.id, { status: "unchecked" })}>
              <RotateCcw className="size-4" aria-hidden />
            </IconButton>
            <IconButton
              aria-label="Delete for good"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete this entry?",
                  message: "It is removed from the register. Reading the document again may find it again.",
                  confirmLabel: "Delete",
                  danger: true,
                });
                if (ok && (await ws.keyFacts.remove(fact.id))) toast("Deleted");
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </IconButton>
          </>
        ) : (
          <>
            {fact.status === "confirmed" ? (
              <span className="mr-1 hidden items-center gap-1 text-xs text-ledger sm:flex" title="Checked against the document">
                <Check className="size-3.5" aria-hidden /> Confirmed
              </span>
            ) : (
              <Button
                variant="quiet"
                className="mr-1 px-2.5 py-1 text-xs"
                onClick={async () => {
                  if (await ws.keyFacts.update(fact.id, { status: "confirmed" })) toast("Confirmed");
                }}
              >
                <Check className="size-3.5" aria-hidden /> Confirm
              </Button>
            )}
            <IconButton aria-label="Edit" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
            </IconButton>
            <IconButton
              aria-label="Dismiss (not relevant or wrong)"
              onClick={async () => {
                if (await ws.keyFacts.update(fact.id, { status: "dismissed" })) toast("Dismissed · no reminders for it");
              }}
            >
              <X className="size-4" aria-hidden />
            </IconButton>
          </>
        )}
      </div>
    </li>
  );
}
