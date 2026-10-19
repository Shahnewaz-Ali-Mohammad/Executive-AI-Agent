"use client";

/**
 * Forms: what was filled in and saved in this workspace, and the templates
 * the assistant can fill in.
 *
 *   Saved forms   newest first, searchable (form name or any value),
 *                 filterable by form; open one to correct it
 *   Templates     shared by all workspaces; open to edit, or create a new one
 *   "Fill in a form" starts a conversation with the request half-written.
 */
import { ClipboardList, FilePlus2, MessageSquarePlus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button } from "@/components/ui/button";
import { EmptyBlock, FilterChips, ListSkeleton, Page, PageHeader, Section } from "@/components/ui/page";
import { SearchField } from "@/components/ui/search-field";
import { formatDateTime, formatFullDateTime } from "@/lib/dates";
import { formatValue } from "@/lib/forms";
import type { FormSubmissionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Rahim · Finance · Sick": the first few filled values, to tell saved forms apart. */
function summary(submission: FormSubmissionDTO): string {
  return submission.fields
    .filter((field) => field.type !== "long_text" && field.type !== "checkbox")
    .map((field) => ({ field, value: submission.values[field.key] }))
    .filter(({ value }) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(({ field, value }) => formatValue(field, value))
    .join(" · ");
}

function searchableText(submission: FormSubmissionDTO): string {
  return [submission.templateName, ...Object.values(submission.values).map((v) => (v === null ? "" : String(v)))]
    .join(" ")
    .toLowerCase();
}

export function FormsPage() {
  const ws = useWorkspace();
  const { templates, submissions, loading } = ws.forms;
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState("all");

  const formNames = useMemo(() => [...new Set(submissions.map((s) => s.templateName))].sort(), [submissions]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return submissions.filter(
      (s) => (formFilter === "all" || s.templateName === formFilter) && (!needle || searchableText(s).includes(needle)),
    );
  }, [submissions, query, formFilter]);

  const panel = ws.panel;
  const openSubmissionId = panel?.kind === "submission" ? panel.submissionId : null;
  const openTemplateId = panel?.kind === "template" ? panel.templateId : undefined;

  return (
    <Page>
      <PageHeader
        title="Forms"
        description="Describe a form in the chat and it's filled in for you. Nothing is saved until you check it and press Save."
        actions={
          <>
            <Button variant="quiet" onClick={() => ws.openPanel({ kind: "template", templateId: null })}>
              <FilePlus2 className="size-4" aria-hidden /> New template
            </Button>
            <Button onClick={() => ws.newConversation("Fill a ")}>
              <MessageSquarePlus className="size-4" aria-hidden /> Fill in a form
            </Button>
          </>
        }
      />

      <Section title="Saved forms" count={submissions.length}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : submissions.length === 0 ? (
          <EmptyBlock icon={<ClipboardList className="size-5" aria-hidden />} title="No saved forms yet">
            Ask in the chat, for example: <em>“Fill a leave request for Rahim from Finance, sick leave 12–14 October.”</em>
          </EmptyBlock>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-72">
                <SearchField value={query} onChange={setQuery} placeholder="Search names, values…" label="Search saved forms" />
              </div>
              {formNames.length > 1 && (
                <div className="min-w-0 flex-1">
                  <FilterChips
                    label="Filter by form"
                    value={formFilter}
                    onChange={setFormFilter}
                    options={[
                      { id: "all", label: "All", count: submissions.length },
                      ...formNames.map((name) => ({
                        id: name,
                        label: name,
                        count: submissions.filter((s) => s.templateName === name).length,
                      })),
                    ]}
                  />
                </div>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyBlock title="No saved forms match">Try another word, or show all forms.</EmptyBlock>
            ) : (
              <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface">
                {visible.map((submission) => (
                  <li key={submission.id}>
                    <button
                      type="button"
                      onClick={() => ws.openPanel({ kind: "submission", submissionId: submission.id })}
                      aria-current={openSubmissionId === submission.id ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                        openSubmissionId === submission.id ? "bg-ledger-soft/50" : "hover:bg-paper",
                      )}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-ledger-soft text-ledger">
                        <ClipboardList className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{submission.templateName}</span>
                        {summary(submission) && <span className="block truncate text-sm text-ink/80">{summary(submission)}</span>}
                      </span>
                      <time
                        dateTime={submission.createdAt}
                        title={`Saved ${formatFullDateTime(submission.createdAt)}`}
                        className="shrink-0 text-xs text-slate tabular-nums"
                      >
                        {formatDateTime(submission.createdAt)}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section
        title="Templates"
        count={templates.length}
        actions={
          <button
            type="button"
            onClick={() => ws.openPanel({ kind: "template", templateId: null })}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ledger hover:bg-surface"
          >
            <Plus className="size-3.5" aria-hidden /> New template
          </button>
        }
      >
        {loading ? (
          <ListSkeleton rows={2} />
        ) : templates.length === 0 ? (
          <EmptyBlock icon={<FilePlus2 className="size-5" aria-hidden />} title="No templates yet">
            Describe one in the chat: <em>“Create a visitor log form with name, company, host and purpose.”</em>
          </EmptyBlock>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id}>
                <div
                  className={cn(
                    "flex h-full flex-col rounded-xl border bg-surface p-4 transition-colors",
                    openTemplateId === template.id ? "border-ledger" : "border-rule hover:border-slate",
                  )}
                >
                  <p className="text-sm font-medium text-ink">{template.name}</p>
                  {template.description && <p className="mt-1 line-clamp-2 text-xs text-slate">{template.description}</p>}
                  <p className="mt-2 text-xs text-slate tabular-nums">
                    {template.fields.length} fields · used {template.submissionCount}×
                  </p>
                  <div className="mt-auto flex gap-2 pt-3">
                    <Button
                      variant="quiet"
                      className="px-2.5 py-1.5 text-xs"
                      onClick={() => ws.newConversation(`Fill a ${template.name.toLowerCase()}: `)}
                    >
                      Fill in
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2.5 py-1.5 text-xs"
                      onClick={() => ws.openPanel({ kind: "template", templateId: template.id })}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
