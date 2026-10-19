"use client";

/**
 * Everything the pages of one workspace share: its data (documents, key
 * dates, conversations, forms, tasks, notifications) and the ways to move around
 * (open the right-hand panel, pick files to upload).
 *
 * Provided by WorkspaceShell, which stays mounted while the CEO moves between
 * the workspace's pages, so nothing reloads and an answer keeps streaming.
 */
import { createContext, useContext } from "react";
import type { useAutomations } from "@/hooks/use-automations";
import type { useConversations } from "@/hooks/use-conversations";
import type { useDocuments } from "@/hooks/use-documents";
import type { useForms } from "@/hooks/use-forms";
import type { useKeyFacts } from "@/hooks/use-key-facts";
import type { useNotifications } from "@/hooks/use-notifications";
import type { useWorkspaces } from "@/hooks/use-workspaces";
import type { ResponseModeId } from "@/lib/response-modes";
import type { Panel, View } from "@/lib/routes";
import type { WorkspaceDTO } from "@/lib/types";

export interface WorkspaceContextValue {
  workspace: WorkspaceDTO;
  workspaceId: string;
  view: View;
  workspaces: ReturnType<typeof useWorkspaces>;
  documents: ReturnType<typeof useDocuments>;
  keyFacts: ReturnType<typeof useKeyFacts>;
  conversations: ReturnType<typeof useConversations>;
  forms: ReturnType<typeof useForms>;
  automations: ReturnType<typeof useAutomations>;
  notifications: ReturnType<typeof useNotifications>;
  /** The right-hand panel (from the address). */
  panel: Panel | null;
  /** Open a panel (adds a history entry, so Back closes it). */
  openPanel: (panel: Panel) => void;
  /** Change the open panel in place (e.g. turn a page in the viewer). */
  replacePanel: (panel: Panel) => void;
  closePanel: () => void;
  /** Open the file picker. */
  pickFiles: () => void;
  uploadFiles: (files: File[]) => void;
  /** Start a new conversation, optionally with text ready in the question box. */
  newConversation: (draft?: string) => void;
  /** Answer mode chosen in the question box (kept between pages). */
  mode: ResponseModeId;
  setMode: (mode: ResponseModeId) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside a workspace page.");
  return value;
}
