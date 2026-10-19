"use client";

/**
 * The right-hand panel, opened from any page: a source document, a saved
 * form, the template editor, a notification, or a new task / schedule.
 * Which one is open is part of the address (see lib/routes.ts).
 */
import { useRouter } from "next/navigation";
import { NewSchedulePanel, NewTaskPanel } from "@/components/automation/new-panels";
import { SubmissionPanel } from "@/components/forms/submission-panel";
import { TemplateEditor } from "@/components/forms/template-editor";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { useFeedback } from "@/components/ui/feedback";
import { SourceViewer } from "@/components/viewer/source-viewer";
import { notificationHref, routes, type Panel } from "@/lib/routes";
import { useWorkspace } from "./workspace-context";

export function RightPanel({ panel }: { panel: Panel }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const ws = useWorkspace();
  const { workspaceId, forms, documents } = ws;

  switch (panel.kind) {
    case "source":
      return (
        <SourceViewer
          key={panel.documentId}
          document={documents.documents.find((doc) => doc.id === panel.documentId)}
          loading={documents.loading}
          page={panel.page}
          onPageChange={(page) => ws.replacePanel({ ...panel, page })}
          onClose={ws.closePanel}
        />
      );

    case "notification":
      return (
        <NotificationPanel
          key={panel.notificationId}
          notificationId={panel.notificationId}
          workspaceId={workspaceId}
          documents={documents.documents
            .filter((d) => d.status === "ready")
            .map(({ id, fileName }) => ({ id, fileName }))}
          onOpenCitation={(documentId, page) => ws.openPanel({ kind: "source", documentId, page })}
          onOpenElsewhere={(otherWorkspaceId) => router.push(notificationHref(otherWorkspaceId, panel.notificationId))}
          onOpenTasks={() => router.push(routes.tasks(workspaceId))}
          onOpened={ws.notifications.markedRead}
          onDelete={async (id) => {
            await ws.notifications.remove(id);
            toast("Notification deleted");
          }}
          onClose={ws.closePanel}
        />
      );

    case "new-task":
      return <NewTaskPanel onClose={ws.closePanel} />;

    case "new-schedule":
      return <NewSchedulePanel onClose={ws.closePanel} />;

    case "submission": {
      const submission = forms.submissions.find((s) => s.id === panel.submissionId);
      if (!submission) {
        return <MissingItem text={forms.loading ? "Loading…" : "This saved form no longer exists."} onClose={ws.closePanel} />;
      }
      const conversationId = submission.conversationId;
      return (
        <SubmissionPanel
          key={submission.id}
          submission={submission}
          onSave={async (values) => {
            await forms.updateSubmission(submission.id, values);
            toast("Form saved");
          }}
          onDelete={async () => {
            const ok = await confirm({
              title: `Delete this ${submission.templateName}?`,
              message: "The saved form is removed. This can't be undone.",
              confirmLabel: "Delete",
              danger: true,
            });
            if (!ok) return;
            await forms.deleteSubmission(submission.id);
            toast("Saved form deleted");
            ws.closePanel();
          }}
          onClose={ws.closePanel}
          onOpenConversation={
            conversationId ? () => router.push(routes.chat(workspaceId, conversationId)) : undefined
          }
        />
      );
    }

    case "template": {
      const template = panel.templateId ? forms.templates.find((t) => t.id === panel.templateId) : null;
      if (panel.templateId && !template) {
        return <MissingItem text={forms.loading ? "Loading…" : "This template no longer exists."} onClose={ws.closePanel} />;
      }
      return (
        <TemplateEditor
          key={panel.templateId ?? "new"}
          template={template ?? null}
          onSave={async (input) => {
            const saved = await forms.saveTemplate(panel.templateId, input);
            toast(panel.templateId ? "Template saved" : `Template “${saved.name}” created`);
            if (!panel.templateId) ws.replacePanel({ kind: "template", templateId: saved.id }); // now editing the new one
          }}
          onDelete={
            template
              ? async () => {
                  const ok = await confirm({
                    title: `Delete the “${template.name}” template?`,
                    message: "Forms already saved with it are kept. The assistant can no longer fill it in.",
                    confirmLabel: "Delete template",
                    danger: true,
                  });
                  if (!ok) return;
                  await forms.deleteTemplate(template.id);
                  toast("Template deleted");
                  ws.closePanel();
                }
              : undefined
          }
          onClose={ws.closePanel}
        />
      );
    }
  }
}

function MissingItem({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-8 text-sm text-slate">
      <p>{text}</p>
      <button type="button" onClick={onClose} className="text-ledger underline-offset-2 hover:underline">
        Close
      </button>
    </div>
  );
}
