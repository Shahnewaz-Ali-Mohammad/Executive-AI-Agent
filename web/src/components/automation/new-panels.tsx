"use client";

/**
 * "New task" and "New schedule" from the Tasks page, for when it's quicker
 * to fill in a form than to ask in the chat. Same fields as the chat cards.
 */
import { useState } from "react";
import { SidePanel } from "@/components/forms/side-panel";
import { useWorkspace } from "@/components/shell/workspace-context";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { api } from "@/lib/api-client";
import { describeRecurrence } from "@/lib/schedule";
import { ScheduleFields, TaskFields, type ScheduleDraft, type TaskDraft } from "./fields";

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function NewTaskPanel({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<TaskDraft>({
    title: "",
    details: "",
    assigneeName: null,
    assigneeEmail: null,
    dueDate: null,
    dueTime: null,
  });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setProblem(null);
    try {
      await api.createTask(ws.workspaceId, { ...draft, timeZone: browserTimeZone() });
      await ws.automations.refresh();
      toast(draft.assigneeEmail ? `Task created · ${draft.assigneeName ?? "the assignee"} will be emailed` : "Task created");
      onClose();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not create the task.");
      setSaving(false);
    }
  }

  return (
    <SidePanel
      label="New task"
      title="New task"
      subtitle="Or just ask in the chat: “Ask Rahim to send the Q3 figures by Friday.”"
      onClose={onClose}
      footer={
        <>
          <Button onClick={create} disabled={saving || !draft.title.trim()}>
            {saving ? "Creating…" : "Create task"}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <TaskFields idPrefix="new-task" value={draft} onChange={setDraft} disabled={saving} />
      <p className="mt-4 text-xs text-slate">
        {draft.assigneeEmail
          ? "They'll get an email now, and a reminder when it's due. You'll be notified when it's due."
          : "Add an email to notify them. You'll be notified under the bell when it's due."}
      </p>
      {problem && <p className="mt-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
    </SidePanel>
  );
}

export function NewSchedulePanel({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<ScheduleDraft>({
    scheduleKind: "report",
    title: "",
    prompt: "",
    mode: "brief",
    recurrence: { frequency: "weekdays", time: "08:00" },
    notifyEmail: null,
  });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const timeZone = browserTimeZone();

  async function create() {
    setSaving(true);
    setProblem(null);
    try {
      await api.createSchedule(ws.workspaceId, { ...draft, timeZone });
      await ws.automations.refresh();
      toast(`${draft.scheduleKind === "report" ? "Report" : "Reminder"} scheduled`);
      onClose();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not create the schedule.");
      setSaving(false);
    }
  }

  return (
    <SidePanel
      label="New schedule"
      title="New scheduled report or reminder"
      subtitle="Or ask in the chat: “Every Monday at 8 give me a risk scan of the board pack.”"
      onClose={onClose}
      footer={
        <>
          <Button onClick={create} disabled={saving || !draft.title.trim() || !draft.prompt.trim()}>
            {saving ? "Scheduling…" : "Schedule"}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <ScheduleFields idPrefix="new-schedule" value={draft} onChange={setDraft} disabled={saving} showKind />
      <p className="mt-4 text-xs text-slate">
        {describeRecurrence(draft.recurrence)}, {timeZone}. Results appear under the bell
        {draft.notifyEmail ? " and by email" : ""}.
      </p>
      {problem && <p className="mt-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{problem}</p>}
    </SidePanel>
  );
}
