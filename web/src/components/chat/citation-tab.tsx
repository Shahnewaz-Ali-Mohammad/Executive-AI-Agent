/**
 * A citation, drawn as a small index tab: file name, then the page number in
 * a solid block. Clicking it opens that page in the source viewer.
 * Citations the server couldn't match to an uploaded file are shown greyed
 * out, so the CEO can see the AI referred to something that isn't there.
 */
import { cn } from "@/lib/utils";

interface CitationTabProps {
  fileName: string;
  page: number;
  /** False when the cited file isn't in the workspace. */
  resolved: boolean;
  active?: boolean;
  onOpen?: () => void;
}

/** Drop the extension and shorten very long names so tabs stay compact. */
function shortName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
  return base.length > 28 ? `${base.slice(0, 26)}…` : base;
}

export function CitationTab({ fileName, page, resolved, active, onOpen }: CitationTabProps) {
  const label = `${fileName}, page ${page}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!resolved}
      title={resolved ? `Open ${label}` : `${fileName} isn't in this workspace`}
      aria-label={resolved ? `Open source: ${label}` : `Unmatched source: ${label}`}
      className={cn(
        "mx-0.5 inline-flex translate-y-[-1px] items-stretch overflow-hidden rounded-[4px] align-middle font-sans text-[0.72rem] leading-none transition-colors",
        resolved
          ? "bg-ledger-soft text-ledger hover:bg-ledger hover:text-surface"
          : "cursor-not-allowed bg-paper text-slate line-through decoration-slate/50",
        active && "bg-ledger text-surface",
      )}
    >
      <span className="px-1.5 py-[3px]">{shortName(fileName)}</span>
      <span
        className={cn(
          "px-1.5 py-[3px] font-semibold tabular-nums",
          resolved ? "bg-ledger text-surface" : "bg-rule text-slate",
        )}
      >
        {page}
      </span>
    </button>
  );
}
