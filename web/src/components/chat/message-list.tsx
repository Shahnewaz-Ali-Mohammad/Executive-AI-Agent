"use client";

/**
 * The conversation. The CEO's questions are short right-aligned notes; the
 * answers are full-width "memos" set in the reading serif, followed by the
 * list of sources they cite. Every message shows when it was sent, and a
 * divider marks each new day.
 */
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { ChatMessage } from "@/hooks/use-executive-chat";
import { extractCitations, type CitableDocument, type Citation } from "@/lib/citations";
import { formatDateTime, formatDayLabel, formatFullDateTime, isSameDay } from "@/lib/dates";
import { getResponseMode, type ResponseModeId } from "@/lib/response-modes";
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
  /** Renders the card (form, task, schedule) attached to an answer, if it has one. */
  renderCard?: (messageId: string) => ReactNode;
}

export function MessageList({
  messages,
  citations,
  documents,
  isRunning,
  activity,
  onOpenCitation,
  renderCard,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages.at(-1);

  // Follow the answer as it streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    // isRunning: a card (form, task, schedule) appears once the answer has finished.
  }, [messages.length, lastMessage?.content.length, activity, isRunning]);

  // While a run is starting, the last message is still the question.
  const waitingForAnswer = isRunning && lastMessage?.role === "user";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-8">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
        const divider = newDay ? <DayDivider iso={message.createdAt} /> : null;

        if (message.role === "user") {
          return (
            <Fragment key={message.id}>
              {divider}
              <div className="flex flex-col items-end gap-1">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface px-4 py-2.5 text-[0.95rem] text-ink shadow-[0_0_0_1px_var(--rule)]">
                  {message.content}
                </p>
                <Timestamp iso={message.createdAt} />
              </div>
            </Fragment>
          );
        }

        const isStreaming = isRunning && index === messages.length - 1;
        const messageCitations = citations[message.id] ?? extractCitations(message.content, documents);
        return (
          <Fragment key={message.id}>
            {divider}
            <article aria-busy={isStreaming}>
              <div className={cn("briefing text-ink", isStreaming && "streaming-caret")}>
                <AnswerMarkdown
                  content={message.content}
                  citations={citations[message.id]}
                  documents={documents}
                  onOpenCitation={onOpenCitation}
                />
              </div>
              {!isStreaming && (
                <>
                  {renderCard?.(message.id)}
                  <SourceList citations={messageCitations} onOpenCitation={onOpenCitation} />
                  <div className="mt-2 flex items-center gap-2">
                    {message.mode && <ModeTag mode={message.mode} />}
                    <Timestamp iso={message.createdAt} />
                  </div>
                </>
              )}
            </article>
          </Fragment>
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

/** Which answer mode wrote this answer, e.g. "Risk scan". */
function ModeTag({ mode }: { mode: ResponseModeId }) {
  const { label, description } = getResponseMode(mode);
  return (
    <span title={description} className="rounded-full border border-rule px-2 py-0.5 text-[0.7rem] text-slate">
      {label}
    </span>
  );
}

/** "Today, 15:56" / "Thu 8 Oct, 13:53" under a message; the full date is in the tooltip. */
function Timestamp({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatFullDateTime(iso)} className="text-xs text-slate tabular-nums">
      {formatDateTime(iso)}
    </time>
  );
}

/** "Today", "Thursday 8 October" … between messages from different days. */
function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate" role="separator">
      <span className="h-px flex-1 bg-rule" />
      <time dateTime={iso}>{formatDayLabel(iso)}</time>
      <span className="h-px flex-1 bg-rule" />
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
