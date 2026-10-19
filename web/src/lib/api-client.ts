/**
 * Browser-side helpers for calling our own API routes.
 * Every call throws an `Error` with the server's message when it fails,
 * so components can show it directly.
 */
import type { ScheduleInput, TaskInput } from "@/lib/cards";
import type { FormValues, TemplateInput } from "@/lib/forms";
import type {
  ChatMessageDTO,
  NotificationDetailDTO,
  NotificationFeedDTO,
  ScheduleDTO,
  SystemStatusDTO,
  TaskDTO,
  ConversationDTO,
  DocumentDTO,
  DocumentPageDTO,
  FormSubmissionDTO,
  FormTemplateDTO,
  WorkspaceDTO,
} from "@/lib/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (response.status === 401) {
    // Session expired: full reload to the login page (drops all in-memory state).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new Error("Please sign in again.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  // Workspaces
  listWorkspaces: () => request<WorkspaceDTO[]>("/api/workspaces"),
  createWorkspace: (name: string) => request<WorkspaceDTO>("/api/workspaces", json("POST", { name })),
  renameWorkspace: (id: string, name: string) =>
    request<WorkspaceDTO>(`/api/workspaces/${id}`, json("PATCH", { name })),
  deleteWorkspace: (id: string) => request<void>(`/api/workspaces/${id}`, { method: "DELETE" }),

  // Documents
  listDocuments: (workspaceId: string) => request<DocumentDTO[]>(`/api/workspaces/${workspaceId}/documents`),
  uploadDocuments: (workspaceId: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("file", file);
    return request<DocumentDTO[]>(`/api/workspaces/${workspaceId}/documents`, { method: "POST", body: form });
  },
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: "DELETE" }),
  getDocumentPage: (id: string, page: number) => request<DocumentPageDTO>(`/api/documents/${id}/pages/${page}`),
  documentFileUrl: (id: string) => `/api/documents/${id}/file`,

  // Saved conversations
  listConversations: (workspaceId: string) =>
    request<ConversationDTO[]>(`/api/workspaces/${workspaceId}/conversations`),
  createConversation: (workspaceId: string) =>
    request<ConversationDTO>(`/api/workspaces/${workspaceId}/conversations`, json("POST", {})),
  renameConversation: (id: string, title: string) =>
    request<ConversationDTO>(`/api/conversations/${id}`, json("PATCH", { title })),
  deleteConversation: (id: string) => request<void>(`/api/conversations/${id}`, { method: "DELETE" }),
  listMessages: (conversationId: string) =>
    request<ChatMessageDTO[]>(`/api/conversations/${conversationId}/messages`),

  // Forms
  listTemplates: () => request<FormTemplateDTO[]>("/api/forms/templates"),
  createTemplate: (input: TemplateInput & { messageId?: string; workspaceId?: string }) =>
    request<FormTemplateDTO>("/api/forms/templates", json("POST", input)),
  updateTemplate: (id: string, input: TemplateInput) =>
    request<FormTemplateDTO>(`/api/forms/templates/${id}`, json("PATCH", input)),
  deleteTemplate: (id: string) => request<void>(`/api/forms/templates/${id}`, { method: "DELETE" }),
  listSubmissions: (workspaceId: string) => request<FormSubmissionDTO[]>(`/api/workspaces/${workspaceId}/forms`),
  createSubmission: (
    workspaceId: string,
    input: { templateId: string; values: FormValues; conversationId?: string | null; messageId?: string | null },
  ) => request<FormSubmissionDTO>(`/api/workspaces/${workspaceId}/forms`, json("POST", input)),
  updateSubmission: (id: string, values: FormValues) =>
    request<FormSubmissionDTO>(`/api/forms/submissions/${id}`, json("PATCH", { values })),
  deleteSubmission: (id: string) => request<void>(`/api/forms/submissions/${id}`, { method: "DELETE" }),

  // Tasks
  listTasks: (workspaceId: string) => request<TaskDTO[]>(`/api/workspaces/${workspaceId}/tasks`),
  createTask: (workspaceId: string, input: TaskInput & { conversationId?: string | null; messageId?: string | null }) =>
    request<TaskDTO>(`/api/workspaces/${workspaceId}/tasks`, json("POST", input)),
  setTaskStatus: (id: string, status: TaskDTO["status"]) => request<TaskDTO>(`/api/tasks/${id}`, json("PATCH", { status })),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: "DELETE" }),

  // Scheduled reports and reminders
  listSchedules: (workspaceId: string) => request<ScheduleDTO[]>(`/api/workspaces/${workspaceId}/schedules`),
  createSchedule: (
    workspaceId: string,
    input: ScheduleInput & { conversationId?: string | null; messageId?: string | null },
  ) => request<ScheduleDTO>(`/api/workspaces/${workspaceId}/schedules`, json("POST", input)),
  setScheduleActive: (id: string, active: boolean) =>
    request<ScheduleDTO>(`/api/schedules/${id}`, json("PATCH", { active })),
  runScheduleNow: (id: string) => request<ScheduleDTO>(`/api/schedules/${id}/run`, { method: "POST" }),
  deleteSchedule: (id: string) => request<void>(`/api/schedules/${id}`, { method: "DELETE" }),

  // Notifications
  notifications: (limit = 30) =>
    request<NotificationFeedDTO>(`/api/notifications?limit=${limit}`, { cache: "no-store" }),
  openNotification: (id: string) => request<NotificationDetailDTO>(`/api/notifications/${id}`),
  markNotificationsRead: (ids?: string[]) => request<void>("/api/notifications/read", json("POST", ids ? { ids } : {})),
  deleteNotification: (id: string) => request<void>(`/api/notifications/${id}`, { method: "DELETE" }),

  // System
  systemStatus: () => request<SystemStatusDTO>("/api/system/status", { cache: "no-store" }),

  // Voice
  transcribe: (audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, "recording.webm");
    return request<{ text: string }>("/api/transcribe", { method: "POST", body: form });
  },

  // Session
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
};
