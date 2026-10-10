/**
 * Shapes of the JSON the API sends to the browser.
 *
 * Kept separate from the database schema on purpose: the API decides what
 * the browser sees (e.g. it never exposes where files are stored on disk),
 * and dates travel as ISO strings.
 */
import type { Citation } from "@/lib/citations";
import type { ResponseModeId } from "@/lib/response-modes";

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
  createdAt: string;
}

/** Extra fields the browser sends with each AG-UI run (in `forwardedProps`). */
export interface ChatForwardedProps {
  workspaceId: string;
  /** The saved conversation this question belongs to. */
  conversationId: string;
  mode: ResponseModeId;
}

/** Name of the AG-UI CUSTOM event that carries resolved citations. */
export const CITATIONS_EVENT = "citations";

/** Payload of the CUSTOM "citations" event. */
export interface CitationsEventValue {
  messageId: string;
  citations: Citation[];
}

/** Standard error body returned by every API route. */
export interface ApiErrorBody {
  error: string;
}
