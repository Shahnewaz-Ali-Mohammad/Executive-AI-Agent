"use client";

/**
 * One notification in the right-hand panel: a finished report (with its
 * sources, which open in the viewer), a reminder, a task falling due, a key
 * date coming up, or a
 * failure with what to do about it.
 */
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnswerMarkdown } from "@/components/chat/answer-markdown";
import { CitationTab } from "@/components/chat/citation-tab";
import { SidePanel } from "@/components/forms/side-panel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import type { CitableDocument } from "@/lib/citations";
import { formatFullDateTime } from "@/lib/dates";
import { getResponseMode } from "@/lib/response-modes";
import type { NotificationDetailDTO, NotificationKind } from "@/lib/types";

const KIND_LABELS: Record<NotificationKind, string> = {
  report: "Scheduled report",
  reminder: "Reminder",
  task_due: "Task due",
  key_date: "Key date",
  error: "Problem",
};

interface NotificationPanelProps {
  notificationId: string;
  /** The workspace on screen: sources of a report from another workspace can't open here. */
  workspaceId: string;
  documents: CitableDocument[];
  onOpenCitation: (documentId: string, page: number) => void;
  /** Open it inside its own workspace (so its sources can be opened). */
  onOpenElsewhere: (workspaceId: string) => void;
  onOpenTasks: () => void;
  onOpenKeyDates: () => void;
  /** Called once it has been opened (and so marked read). */
  onOpened: () => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function NotificationPanel({
  notificationId,
  workspaceId,
  documents,
  onOpenCitation,
  onOpenElsewhere,
  onOpenTasks,
  onOpenKeyDates,
  onOpened,
  onDelete,
  onClose,
}: NotificationPanelProps) {
  const [notification, setNotification] = useState<NotificationDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .openNotification(notificationId)
      .then((n) => {
        if (cancelled) return;
        setNotification(n);
        onOpened();
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not open it."));
    return () => {
      cancelled = true;
    };
  }, [notificationId, onOpened]);

  const elsewhere = notification !== null && notification.workspaceId !== workspaceId;
  // Sources from another workspace are shown, but can't be opened from here.
  const citations = useMemo(
    () => (notification ? notification.citations.map((c) => (elsewhere ? { ...c, documentId: null } : c)) : []),
    [notification, elsewhere],
  );
  const unique = citations.filter(
    (citation, index) => citations.findIndex((c) => c.fileName === citation.fileName && c.page === citation.page) === index,
  );

  if (error) {
    return (
      <SidePanel label="Notification" title="Notification" onClose={onClose}>
        <p className="text-sm text-alert">{error}</p>
      </SidePanel>
    );
  }
  if (!notification) {
    return (
      <SidePanel label="Notification" title="Loading…" onClose={onClose}>
        <p className="text-sm text-slate">Loading…</p>
      </SidePanel>
    );
  }

  return (
    <SidePanel
      label={KIND_LABELS[notification.kind]}
      title={notification.title}
      subtitle={
        <>
          {KIND_LABELS[notification.kind]}
          {notification.mode && ` · ${getResponseMode(notification.mode).label}`}
          {" · "}
          {notification.workspaceName}
          {" · "}
          <time dateTime={notification.createdAt}>{formatFullDateTime(notification.createdAt)}</time>
        </>
      }
      onClose={onClose}
      footer={
        <>
          {notification.kind === "key_date" && !elsewhere && (
            <Button variant="quiet" onClick={onOpenKeyDates}>
              Open Key dates
            </Button>
          )}
          {(notification.scheduleId || notification.taskId) && !elsewhere && (
            <Button variant="quiet" onClick={onOpenTasks}>
              Open in Tasks
            </Button>
          )}
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={async () => {
              await onDelete(notification.id);
              onClose();
            }}
          >
            <Trash2 className="size-3.5" aria-hidden /> Delete
          </Button>
        </>
      }
    >
      {elsewhere && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-paper px-3 py-2 text-xs text-slate">
          <span className="flex-1">From the “{notification.workspaceName}” workspace. Open it there to view the sources.</span>
          <Button variant="quiet" className="px-2.5 py-1 text-xs" onClick={() => onOpenElsewhere(notification.workspaceId)}>
            Open in {notification.workspaceName}
          </Button>
        </div>
      )}
      <div className="briefing text-ink">
        <AnswerMarkdown
          content={notification.body}
          citations={citations}
          documents={elsewhere ? [] : documents}
          onOpenCitation={onOpenCitation}
        />
      </div>
      {unique.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-y-1.5 border-t border-rule pt-3">
          <span className="mr-1.5 text-xs text-slate">Sources</span>
          {unique.map(({ fileName, page, documentId }) => (
            <CitationTab
              key={`${fileName}-${page}`}
              fileName={fileName}
              page={page}
              resolved={documentId !== null}
              onOpen={documentId ? () => onOpenCitation(documentId, page) : undefined}
            />
          ))}
        </div>
      )}
    </SidePanel>
  );
}
