/**
 * Browser-side helpers for calling our own API routes.
 * Every call throws an `Error` with the server's message when it fails,
 * so components can show it directly.
 */
import type {
  ChatMessageDTO,
  ConversationDTO,
  DocumentDTO,
  DocumentPageDTO,
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

  // Voice
  transcribe: (audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, "recording.webm");
    return request<{ text: string }>("/api/transcribe", { method: "POST", body: form });
  },

  // Session
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
};
