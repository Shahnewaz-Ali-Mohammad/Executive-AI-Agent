/**
 * A new conversation: what the assistant can do here, as one-click starters.
 *
 *   Ask your documents   (needs at least one document ready)
 *   Get things done      fill a form · assign a task · schedule a report · set a reminder
 *
 * Questions are asked straight away; the "get things done" starters put the
 * beginning of a sentence in the question box to finish.
 */
import { BellRing, CalendarClock, ClipboardList, FileUp, ListTodo } from "lucide-react";
import type { ReactNode } from "react";
import type { ResponseModeId } from "@/lib/response-modes";

const QUESTIONS: { question: string; mode: ResponseModeId }[] = [
  { question: "Brief me on these documents in two minutes.", mode: "brief" },
  { question: "What are the biggest risks, and where do the documents contradict each other?", mode: "risk_scan" },
  { question: "What will the board most likely push back on?", mode: "prep_me" },
  { question: "What renews, expires or falls due in the next 90 days, and what notice do I need to give?", mode: "brief" },
];

const ACTIONS: { label: string; hint: string; draft: string; icon: ReactNode }[] = [
  {
    label: "Fill in a form",
    hint: "Leave request, expense claim, or any template",
    draft: "Fill a leave request for ",
    icon: <ClipboardList className="size-4" aria-hidden />,
  },
  {
    label: "Assign a task",
    hint: "Emails them, and reminds them when it's due",
    draft: "Ask ",
    icon: <ListTodo className="size-4" aria-hidden />,
  },
  {
    label: "Schedule a report",
    hint: "Answered from your documents, on time",
    draft: "Every Monday at 8:00 give me ",
    icon: <CalendarClock className="size-4" aria-hidden />,
  },
  {
    label: "Set a reminder",
    hint: "Arrives under the bell (and by email)",
    draft: "Remind me tomorrow at ",
    icon: <BellRing className="size-4" aria-hidden />,
  },
];

interface EmptyStateProps {
  workspaceName: string;
  readyCount: number;
  processingCount: number;
  onAsk: (question: string, mode: ResponseModeId) => void;
  onDraft: (text: string) => void;
  onUploadClick: () => void;
}

export function EmptyState({ workspaceName, readyCount, processingCount, onAsk, onDraft, onUploadClick }: EmptyStateProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <h2 className="font-serif text-[1.75rem] leading-tight text-ink">{workspaceName}</h2>
      <p className="mt-2 text-slate">
        {readyCount > 0
          ? `${readyCount} document${readyCount > 1 ? "s" : ""} ready. Ask anything: every answer points to the page it came from.`
          : processingCount > 0
            ? `Reading ${processingCount} document${processingCount > 1 ? "s" : ""}. You can ask questions as soon as one is ready.`
            : "Add board packs, reports, contracts or photos of slides, then ask anything about them."}
      </p>

      <h3 className="mt-8 text-xs font-medium tracking-wide text-slate uppercase">Ask your documents</h3>
      {readyCount > 0 ? (
        <ul className="mt-2 divide-y divide-rule border-y border-rule">
          {QUESTIONS.map((starter) => (
            <li key={starter.question}>
              <button
                type="button"
                onClick={() => onAsk(starter.question, starter.mode)}
                className="w-full py-3 text-left font-serif text-[1.05rem] text-ink transition-colors hover:text-ledger"
              >
                {starter.question}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={onUploadClick}
          className="mt-2 flex w-full items-center gap-3 rounded-lg border border-dashed border-rule bg-surface px-4 py-4 text-left transition-colors hover:border-ledger"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ledger-soft text-ledger">
            <FileUp className="size-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-medium text-ink">
              {processingCount > 0 ? "Add more documents" : "Add your first documents"}
            </span>
            <span className="block text-xs text-slate">PDF, scans and photos, Word, Excel, PowerPoint</span>
          </span>
        </button>
      )}

      <h3 className="mt-8 text-xs font-medium tracking-wide text-slate uppercase">Get things done</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {ACTIONS.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              onClick={() => onDraft(action.draft)}
              className="flex h-full w-full items-start gap-3 rounded-lg border border-rule bg-surface px-3.5 py-3 text-left transition-colors hover:border-ledger"
            >
              <span className="mt-0.5 text-ledger">{action.icon}</span>
              <span>
                <span className="block text-sm font-medium text-ink">{action.label}</span>
                <span className="block text-xs text-slate">{action.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
