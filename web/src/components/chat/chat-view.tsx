"use client";

/**
 * One conversation: its answers (with cards for forms, tasks and schedules)
 * and the question box. Kept mounted while the CEO visits other pages, so an
 * answer keeps streaming in the background.
 */
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/components/shell/workspace-context";
import { IconButton } from "@/components/ui/button";
import type { ChatSession } from "@/hooks/use-conversations";
import { useExecutiveChat } from "@/hooks/use-executive-chat";
import type { ResponseModeId } from "@/lib/response-modes";
import { routes } from "@/lib/routes";
import { ChatCard } from "./chat-card";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";

interface ChatViewProps {
  session: ChatSession;
  /** Text to start the question box with ({ key } changes for each new one). */
  draft: { key: number; text: string };
  onDraft: (text: string) => void;
}

export function ChatView({ session, draft, onDraft }: ChatViewProps) {
  const router = useRouter();
  const ws = useWorkspace();
  const { workspaceId, documents: docs, conversations: convs, mode, setMode } = ws;
  const chat = useExecutiveChat({
    workspaceId,
    session,
    ensureConversation: convs.ensureConversation,
    onAnswered: convs.refresh,
  });
  const [dismissedDocsError, setDismissedDocsError] = useState<string | null>(null);

  const readyDocuments = useMemo(
    () => docs.documents.filter((doc) => doc.status === "ready").map(({ id, fileName }) => ({ id, fileName })),
    [docs.documents],
  );
  const processingCount = docs.documents.filter((doc) => doc.status === "processing").length;

  // A saved conversation that isn't in this workspace (deleted, or a bad link).
  const missing =
    session.conversationId !== null &&
    !convs.loading &&
    !convs.conversations.some((c) => c.id === session.conversationId);

  function ask(question: string, askMode: ResponseModeId = mode) {
    setMode(askMode);
    void chat.send(question, askMode);
  }

  const error = chat.error ?? (docs.error !== dismissedDocsError ? docs.error : null);

  if (missing) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h2 className="font-serif text-2xl text-ink">Conversation not found</h2>
        <p className="mt-2 text-sm text-slate">It may have been deleted, or the link is from another workspace.</p>
        <Link
          href={routes.workspace(workspaceId)}
          className="mt-6 inline-block rounded-md bg-ledger px-4 py-2 text-sm font-medium text-surface hover:opacity-90"
        >
          Start a new conversation
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chat.loadingHistory ? (
          <p className="p-8 text-sm text-slate">Loading conversation…</p>
        ) : chat.messages.length === 0 ? (
          <EmptyState
            workspaceName={ws.workspace.name}
            readyCount={readyDocuments.length}
            processingCount={processingCount}
            onAsk={ask}
            onDraft={onDraft}
            onUploadClick={ws.pickFiles}
          />
        ) : (
          <MessageList
            messages={chat.messages}
            citations={chat.citations}
            documents={readyDocuments}
            isRunning={chat.isRunning}
            activity={chat.activity}
            onOpenCitation={(documentId, page) => ws.openPanel({ kind: "source", documentId, page })}
            renderCard={(messageId) => {
              const card = chat.cards[messageId];
              if (!card) return null;
              return (
                <ChatCard
                  card={card}
                  messageId={messageId}
                  workspaceId={workspaceId}
                  conversationId={convs.activeId}
                  onUpdated={(updated) => chat.updateCard(messageId, updated)}
                  onFormsSaved={ws.forms.refresh}
                  onAutomationsChanged={ws.automations.refresh}
                  onOpenSubmission={(submissionId) => ws.openPanel({ kind: "submission", submissionId })}
                  onOpenTemplate={(templateId) => ws.openPanel({ kind: "template", templateId })}
                  onOpenTasks={() => router.push(routes.tasks(workspaceId))}
                />
              );
            }}
          />
        )}
      </div>

      {error && (
        <div role="alert" className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-3 px-3 sm:px-8">
          <p className="flex-1 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>
          <IconButton
            aria-label="Dismiss"
            onClick={() => {
              chat.dismissError();
              setDismissedDocsError(docs.error);
            }}
          >
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      <Composer
        key={`${session.key}:${draft.key}`}
        initialText={draft.text}
        mode={mode}
        onModeChange={setMode}
        onSend={(text) => ask(text)}
        onStop={chat.stop}
        onAttach={ws.pickFiles}
        isRunning={chat.isRunning}
      />
    </div>
  );
}
