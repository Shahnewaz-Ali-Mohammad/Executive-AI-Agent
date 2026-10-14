/**
 * Shapes of the JSON the API sends to the browser.
 *
 * Kept separate from the database schema on purpose: the API decides what
 * the browser sees (e.g. it never exposes where files are stored on disk),
 * and dates travel as ISO strings.
 */
import type { Citation } from "@/lib/citations";
import type { ChatCard } from "@/lib/cards";
import type { FormField, FormValues } from "@/lib/forms";
import type { ResponseModeId } from "@/lib/response-modes";
import type { Recurrence } from "@/lib/schedule";

export interface WorkspaceDTO {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export type DocumentStatus = "processing" | "ready" | "failed";

export interface DocumentDTO {
  id: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  pageCount: number | null;
  chunkCount: number | null;
  summary: string | null;
  error: string | null;
  createdAt: string;
}

export interface DocumentPageDTO {
  documentId: string;
  pageNumber: number;
  pageCount: number | null;
  content: string;
}

export interface ConversationDTO {
  id: string;
  workspaceId: string;
  title: string;
  /** Questions and answers in it. */
  messageCount: number;
  createdAt: string;
  /** When the last message was sent (newest first in the list). Renaming doesn't change it. */
  updatedAt: string;
}

export interface ChatMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: ResponseModeId | null;
  citations: Citation[];
  /** A card shown with this answer (form, task, schedule …), if any. */
  card: ChatCard | null;
  createdAt: string;
}

export interface FormTemplateDTO {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  /** How many saved forms use it (all workspaces). */
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmissionDTO {
  id: string;
  templateId: string | null;
  workspaceId: string;
  conversationId: string | null;
  templateName: string;
  fields: FormField[];
  values: FormValues;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDTO {
  id: string;
  workspaceId: string;
  conversationId: string | null;
  title: string;
  details: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  dueAt: string | null;
  status: "open" | "done" | "cancelled";
  completedAt: string | null;
  createdAt: string;
  /** Email to the assignee about the new task: queued, sent, failed, skipped (no email set up), or null. */
  assignmentEmail: string | null;
}

export interface LastRunDTO {
  status: "queued" | "claimed" | "running" | "succeeded" | "failed";
  at: string;
  error: string | null;
}

export interface ScheduleDTO {
  id: string;
  workspaceId: string;
  kind: "report" | "reminder";
  title: string;
  prompt: string;
  mode: ResponseModeId | null;
  recurrence: Recurrence;
  timeZone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  active: boolean;
  notifyEmail: string | null;
  createdAt: string;
  lastRun: LastRunDTO | null;
}

export type NotificationKind = "report" | "reminder" | "task_due" | "error";

export interface NotificationDTO {
  id: string;
  workspaceId: string;
  workspaceName: string;
  kind: NotificationKind;
  title: string;
  /** First ~200 characters of the body, as plain text. */
  preview: string;
  readAt: string | null;
  createdAt: string;
  taskId: string | null;
  scheduleId: string | null;
}

export interface NotificationDetailDTO extends NotificationDTO {
  /** Markdown. */
  body: string;
  citations: Citation[];
  mode: ResponseModeId | null;
}

/** Whether n8n's scheduler is checking in (it calls the app every minute). */
export interface SchedulerStatusDTO {
  /** Last time n8n asked for due work, or null if never. */
  lastCheckAt: string | null;
  /** Checked in within the last few minutes. */
  healthy: boolean;
  /** n8n has SMTP set up, so results can also be emailed. */
  emailEnabled: boolean;
}

export interface NotificationFeedDTO {
  items: NotificationDTO[];
  unreadCount: number;
  scheduler: SchedulerStatusDTO;
}

/** Extra fields the browser sends with each AG-UI run (in `forwardedProps`). */
export interface ChatForwardedProps {
  workspaceId: string;
  /** The saved conversation this question belongs to. */
  conversationId: string;
  mode: ResponseModeId;
  /** The browser's time zone (IANA), for "tomorrow at 9" and schedules. */
  timeZone?: string;
}

/** Name of the AG-UI CUSTOM event that carries resolved citations. */
export const CITATIONS_EVENT = "citations";

/** Name of the AG-UI CUSTOM event that shows a card (form, task, schedule) with an answer. */
export const CARD_EVENT = "card";

/** Payload of the CUSTOM "card" event. */
export interface CardEventValue {
  messageId: string;
  card: ChatCard;
}

/** Payload of the CUSTOM "citations" event. */
export interface CitationsEventValue {
  messageId: string;
  citations: Citation[];
}

/** Standard error body returned by every API route. */
export interface ApiErrorBody {
  error: string;
}
