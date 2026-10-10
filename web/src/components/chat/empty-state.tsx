/**
 * What the CEO sees in a workspace with no conversation yet: a nudge to
 * upload documents if there are none, otherwise a few useful first questions.
 */
import type { ResponseModeId } from "@/lib/response-modes";

const STARTERS: { question: string; mode: ResponseModeId }[] = [
  { question: "Brief me on these documents in two minutes.", mode: "brief" },
  { question: "What are the biggest risks, and where do the documents contradict each other?", mode: "risk_scan" },
  { question: "What will the board most likely push back on?", mode: "prep_me" },
  { question: "What important data is missing from these documents?", mode: "risk_scan" },
];

interface EmptyStateProps {
  workspaceName: string;
  readyCount: number;
  processingCount: number;
  onAsk: (question: string, mode: ResponseModeId) => void;
  onUploadClick: () => void;
}

export function EmptyState({ workspaceName, readyCount, processingCount, onAsk, onUploadClick }: EmptyStateProps) {
  if (readyCount === 0) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h2 className="font-serif text-2xl text-ink">{workspaceName}</h2>
        <p className="mt-3 text-slate">
          {processingCount > 0
            ? `Reading ${processingCount} document${processingCount > 1 ? "s" : ""}. You can ask questions as soon as one is ready.`
            : "Add board packs, reports, contracts or photos of slides. Every answer will point to the exact page it came from."}
        </p>
        {processingCount === 0 && (
          <button
            type="button"
            onClick={onUploadClick}
            className="mt-6 rounded-md bg-ledger px-4 py-2.5 text-sm font-medium text-surface hover:opacity-90"
          >
            Add documents
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
      <h2 className="font-serif text-2xl text-ink">{workspaceName}</h2>
      <p className="mt-2 text-slate">
        {readyCount} document{readyCount > 1 ? "s" : ""} ready. Ask anything, or start with one of these.
      </p>
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {STARTERS.map((starter) => (
          <li key={starter.question}>
            <button
              type="button"
              onClick={() => onAsk(starter.question, starter.mode)}
              className="w-full py-3.5 text-left font-serif text-[1.05rem] text-ink transition-colors hover:text-ledger"
            >
              {starter.question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
