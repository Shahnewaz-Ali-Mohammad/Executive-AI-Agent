"use client";

/**
 * The Forms tab in the sidebar.
 *
 *   Saved forms   everything filled in and saved in this workspace, newest
 *                 first, grouped by date, searchable (form name or any value)
 *                 and filterable by form.
 *   Templates     the forms the AI can fill in, with "New template".
 */
import { ClipboardList, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { SearchField } from "@/components/ui/search-field";
import { formatDateTime, formatFullDateTime, formatRecencyGroup } from "@/lib/dates";
import { formatValue } from "@/lib/forms";
import type { FormSubmissionDTO, FormTemplateDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FormsPanelProps {
  templates: FormTemplateDTO[];
  submissions: FormSubmissionDTO[];
  loading: boolean;
  openSubmissionId: string | null;
  openTemplateId: string | null;
  onOpenSubmission: (id: string) => void;
  onOpenTemplate: (id: string) => void;
  onNewTemplate: () => void;
}

/** "Rahim · Finance · Sick": the first few filled values, to tell saved forms apart. */
function summary(submission: FormSubmissionDTO): string {
  return submission.fields
    .filter((field) => field.type !== "long_text" && field.type !== "checkbox")
    .map((field) => ({ field, value: submission.values[field.key] }))
    .filter(({ value }) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(({ field, value }) => formatValue(field, value))
    .join(" · ");
}

function searchableText(submission: FormSubmissionDTO): string {
  return [submission.templateName, ...Object.values(submission.values).map((v) => (v === null ? "" : String(v)))]
    .join(" ")
    .toLowerCase();
}

export function FormsPanel({
  templates,
  submissions,
  loading,
  openSubmissionId,
  openTemplateId,
  onOpenSubmission,
  onOpenTemplate,
  onNewTemplate,
}: FormsPanelProps) {
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState<string | null>(null);

  const formNames = useMemo(() => [...new Set(submissions.map((s) => s.templateName))].sort(), [submissions]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = submissions.filter(
      (s) => (!formFilter || s.templateName === formFilter) && (!needle || searchableText(s).includes(needle)),
    );
    const result: { label: string; items: FormSubmissionDTO[] }[] = [];
    for (const submission of visible) {
      const label = formatRecencyGroup(submission.createdAt);
      const last = result.at(-1);
      if (last?.label === label) last.items.push(submission);
      else result.push({ label, items: [submission] });
    }
    return result;
  }, [submissions, query, formFilter]);

  if (loading) return <p className="px-4 py-3 text-sm text-slate">Loading forms…</p>;

  return (
    <div className="space-y-5">
      {/* ---------- Saved forms ---------- */}
      <section aria-label="Saved forms" className="space-y-2">
        <h3 className="px-4 text-[0.7rem] font-medium tracking-wide text-slate uppercase">
          Saved forms <span className="tabular-nums">{submissions.length}</span>
        </h3>

        {submissions.length === 0 ? (
          <p className="px-4 text-sm text-slate">
            Nothing saved yet. Ask in the chat, for example: <em>“Fill a leave request for Rahim from Finance, sick
            leave 12–14 October.”</em>
          </p>
        ) : (
          <>
            <div className="space-y-2 px-3">
              <SearchField value={query} onChange={setQuery} placeholder="Search saved forms" label="Search saved forms" />
              {formNames.length > 1 && (
                <div className="flex gap-0.5 overflow-x-auto" role="group" aria-label="Filter by form">
                  {[null, ...formNames].map((name) => (
                    <button
                      key={name ?? "all"}
                      type="button"
                      onClick={() => setFormFilter(name)}
                      aria-pressed={formFilter === name}
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-xs whitespace-nowrap transition-colors",
                        formFilter === name ? "bg-ink text-paper" : "text-slate hover:bg-paper hover:text-ink",
                      )}
                    >
                      {name ?? "All"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {groups.length === 0 && <p className="px-4 text-sm text-slate">No saved forms match.</p>}
            {groups.map((group) => (
              <div key={group.label}>
                <h4 className="px-4 pb-1 text-[0.7rem] text-slate">{group.label}</h4>
                <ul className="px-2">
                  {group.items.map((submission) => (
                    <li key={submission.id}>
                      <button
                        type="button"
                        onClick={() => onOpenSubmission(submission.id)}
                        aria-current={openSubmissionId === submission.id ? "true" : undefined}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-paper",
                          openSubmissionId === submission.id && "bg-paper shadow-[inset_2px_0_0_var(--ledger)]",
                        )}
                      >
                        <ClipboardList className="mt-0.5 size-4 shrink-0 text-ledger" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{submission.templateName}</span>
                          {summary(submission) && (
                            <span className="block truncate text-xs text-ink/80">{summary(submission)}</span>
                          )}
                          <time
                            dateTime={submission.createdAt}
                            title={`Saved ${formatFullDateTime(submission.createdAt)}`}
                            className="block text-xs text-slate tabular-nums"
                          >
                            {formatDateTime(submission.createdAt)}
                          </time>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </section>

      {/* ---------- Templates ---------- */}
      <section aria-label="Form templates" className="space-y-2 border-t border-rule pt-4">
        <div className="flex items-center justify-between px-4">
          <h3 className="text-[0.7rem] font-medium tracking-wide text-slate uppercase">
            Templates <span className="tabular-nums">{templates.length}</span>
          </h3>
          <button
            type="button"
            onClick={onNewTemplate}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ledger hover:bg-paper"
          >
            <Plus className="size-3.5" aria-hidden /> New template
          </button>
        </div>
        {templates.length === 0 ? (
          <p className="px-4 text-sm text-slate">
            No templates yet. Ask in the chat, for example: <em>“Create a visitor log form with name, company, host
            and purpose.”</em>
          </p>
        ) : (
          <ul className="px-2">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => onOpenTemplate(template.id)}
                  aria-current={openTemplateId === template.id ? "true" : undefined}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-paper",
                    openTemplateId === template.id && "bg-paper shadow-[inset_2px_0_0_var(--ledger)]",
                  )}
                >
                  <span className="block truncate text-sm text-ink">{template.name}</span>
                  <span className="block text-xs text-slate">
                    {template.fields.length} fields · {template.submissionCount} saved
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 text-xs text-slate">
          Tip: describe a new form in the chat and it&apos;s built for you.
        </p>
      </section>
    </div>
  );
}
