/**
 * Every address in the app, in one place.
 *
 *   /                                   → the last workspace (and conversation) used
 *   /w/:workspaceId                     → a new conversation
 *   /w/:workspaceId/c/:conversationId   → a saved conversation
 *   /w/:workspaceId/documents           → the workspace's files
 *   /w/:workspaceId/key-dates           → renewal dates, deadlines and other facts read from the files
 *                                         (?document=ID shows one document's)
 *   /w/:workspaceId/forms               → saved forms and templates
 *   /w/:workspaceId/tasks               → tasks, scheduled reports and reminders
 *   /w/:workspaceId/notifications       → everything under the bell
 *   /w/:workspaceId/status              → whether every service is running
 *
 * The right-hand panel is part of the address too (so Back closes it, and a
 * link can open it):  ?doc=ID&page=N · ?form=ID · ?template=ID|new ·
 * ?notification=ID · ?new=task|schedule
 *
 * Shared by browser and server (emails link straight to a notification).
 */

export type View = "chat" | "documents" | "key-dates" | "forms" | "tasks" | "notifications" | "status";

export const routes = {
  workspace: (workspaceId: string) => `/w/${workspaceId}`,
  chat: (workspaceId: string, conversationId?: string | null) =>
    conversationId ? `/w/${workspaceId}/c/${conversationId}` : `/w/${workspaceId}`,
  documents: (workspaceId: string) => `/w/${workspaceId}/documents`,
  keyDates: (workspaceId: string, documentId?: string | null) =>
    `/w/${workspaceId}/key-dates${documentId ? `?document=${encodeURIComponent(documentId)}` : ""}`,
  forms: (workspaceId: string) => `/w/${workspaceId}/forms`,
  tasks: (workspaceId: string) => `/w/${workspaceId}/tasks`,
  notifications: (workspaceId: string) => `/w/${workspaceId}/notifications`,
  status: (workspaceId: string) => `/w/${workspaceId}/status`,
};

/** Which page an address shows. */
export function viewFromPath(pathname: string): View {
  const section = pathname.split("/")[3];
  switch (section) {
    case "documents":
    case "key-dates":
    case "forms":
    case "tasks":
    case "notifications":
    case "status":
      return section;
    default:
      return "chat";
  }
}

// --- The right-hand panel ------------------------------------------------------------

export type Panel =
  | { kind: "source"; documentId: string; page: number }
  | { kind: "submission"; submissionId: string }
  | { kind: "template"; templateId: string | null } // null = new template
  | { kind: "notification"; notificationId: string }
  | { kind: "new-task" }
  | { kind: "new-schedule" };

/** The panel an address asks for, if any. */
export function panelFromSearch(params: URLSearchParams): Panel | null {
  const doc = params.get("doc");
  if (doc) return { kind: "source", documentId: doc, page: Math.max(1, Number(params.get("page")) || 1) };
  const form = params.get("form");
  if (form) return { kind: "submission", submissionId: form };
  const template = params.get("template");
  if (template) return { kind: "template", templateId: template === "new" ? null : template };
  const notification = params.get("notification");
  if (notification) return { kind: "notification", notificationId: notification };
  const create = params.get("new");
  if (create === "task") return { kind: "new-task" };
  if (create === "schedule") return { kind: "new-schedule" };
  return null;
}

/** The query string for a panel ("" for none). */
export function panelSearch(panel: Panel | null): string {
  if (!panel) return "";
  const params = new URLSearchParams();
  switch (panel.kind) {
    case "source":
      params.set("doc", panel.documentId);
      if (panel.page > 1) params.set("page", String(panel.page));
      break;
    case "submission":
      params.set("form", panel.submissionId);
      break;
    case "template":
      params.set("template", panel.templateId ?? "new");
      break;
    case "notification":
      params.set("notification", panel.notificationId);
      break;
    case "new-task":
      params.set("new", "task");
      break;
    case "new-schedule":
      params.set("new", "schedule");
      break;
  }
  return `?${params}`;
}

/** Link to one notification (used in emails). */
export function notificationHref(workspaceId: string, notificationId: string): string {
  return `${routes.notifications(workspaceId)}${panelSearch({ kind: "notification", notificationId })}`;
}

// --- Last place visited (so "/" and switching workspace land somewhere useful) ----------

const LAST_WORKSPACE_KEY = "ea:last-workspace";
const lastConversationKey = (workspaceId: string) => `ea:last-conversation:${workspaceId}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage can be blocked (private mode); not important
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const lastVisited = {
  workspace: () => read(LAST_WORKSPACE_KEY),
  setWorkspace: (id: string | null) => write(LAST_WORKSPACE_KEY, id),
  conversation: (workspaceId: string) => read(lastConversationKey(workspaceId)),
  setConversation: (workspaceId: string, id: string | null) => write(lastConversationKey(workspaceId), id),
};

/** Where to go when entering a workspace: its last conversation, or a new one. */
export function workspaceHome(workspaceId: string): string {
  return routes.chat(workspaceId, lastVisited.conversation(workspaceId));
}
