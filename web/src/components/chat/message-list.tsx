"use client";

/**
 * The conversation. The CEO's questions are short right-aligned notes; the
 * answers are full-width "memos" set in the reading serif, followed by the
 * list of sources they cite.
 */
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/use-executive-chat";
import { extractCitations, type CitableDocument, type Citation } from "@/lib/citations";
import { cn } from "@/lib/utils";
import { AnswerMarkdown } from "./answer-markdown";
import { CitationTab } from "./citation-tab";

interface MessageListProps {
  messages: ChatMessage[];
  citations: Record<string, Citation[]>;
  documents: CitableDocument[];
  isRunning: boolean;
  activity: string | null;
  onOpenCitation: (documentId: string, page: number) => void;
}

export function MessageList({
  messages,
  citations,
  documents,
  isRunning,
  activity,
  onOpenCitation,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages.at(-1);

  // Follow the answer as it streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessage?.content.length, activity]);

  // While a run is starting, the last message is still the question.
  const waitingForAnswer = isRunning && lastMessage?.role === "user";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-8">
      {messages.map((message, index) => {
        if (message.role === "user") {
          return (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface px-4 py-2.5 text-[0.95rem] text-ink shadow-[0_0_0_1px_var(--rule)]">
                {message.content}
              </p>
            </div>
          );
        }

        const isStreaming = isRunning && index === messages.length - 1;
        const messageCitations = citations[message.id] ?? extractCitations(message.content, documents);
        return (
          <article key={message.id} aria-busy={isStreaming}>
            <div className={cn("briefing text-ink", isStreaming && "streaming-caret")}>
              <AnswerMarkdown
                content={message.content}
                citations={citations[message.id]}
                documents={documents}
                onOpenCitation={onOpenCitation}
              />
            </div>
            {!isStreaming && <SourceList citations={messageCitations} onOpenCitation={onOpenCitation} />}
          </article>
        );
      })}

      {waitingForAnswer && (
        <p className="flex items-center gap-2 text-sm text-slate" role="status">
          <span className="size-2 animate-pulse rounded-full bg-amber" aria-hidden />
          {activity ?? "Thinking…"}
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}

/** "Sources" row under an answer: each distinct document/page cited, once. */
function SourceList({
  citations,
  onOpenCitation,
}: {
  citations: Citation[];
  onOpenCitation: (documentId: string, page: number) => void;
}) {
  if (citations.length === 0) return null;
  const unique = citations.filter(
    (citation, index) =>
      citations.findIndex((c) => c.fileName === citation.fileName && c.page === citation.page) === index,
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-y-1.5 border-t border-rule pt-3">
      <span className="mr-1.5 text-xs text-slate">Sources</span>
      {unique.map((citation) => {
        const { documentId, page } = citation;
        return (
          <CitationTab
            key={`${citation.fileName}-${page}`}
            fileName={citation.fileName}
            page={page}
            resolved={documentId !== null}
            onOpen={documentId ? () => onOpenCitation(documentId, page) : undefined}
          />
        );
      })}
    </div>
  );
}
