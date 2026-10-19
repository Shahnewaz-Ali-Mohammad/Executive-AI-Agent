"use client";

/** The card under an answer: a form, a task, a scheduled report/reminder, or a document to open. */
import type { ChatCard as ChatCardData } from "@/lib/cards";
import { DocumentCard } from "./document-card";
import { FormCard } from "./form-card";
import { ScheduleCard } from "./schedule-card";
import { TaskCard } from "./task-card";

export interface ChatCardProps {
  card: ChatCardData;
  messageId: string;
  workspaceId: string;
  conversationId: string | null;
  onUpdated: (card: ChatCardData) => void;
  onFormsSaved: () => void;
  onAutomationsChanged: () => void;
  onOpenSubmission: (submissionId: string) => void;
  onOpenTemplate: (templateId: string) => void;
  onOpenTasks: () => void;
}

export function ChatCard({ card, onFormsSaved, onAutomationsChanged, onOpenSubmission, onOpenTemplate, onOpenTasks, ...context }: ChatCardProps) {
  if (card.kind === "task") {
    return <TaskCard card={card} {...context} onCreated={onAutomationsChanged} onOpenTasks={onOpenTasks} />;
  }
  if (card.kind === "schedule") {
    return <ScheduleCard card={card} {...context} onCreated={onAutomationsChanged} onOpenTasks={onOpenTasks} />;
  }
  if (card.kind === "document") return <DocumentCard card={card} />;
  return (
    <FormCard
      form={card}
      {...context}
      onSaved={onFormsSaved}
      onOpenSubmission={onOpenSubmission}
      onOpenTemplate={onOpenTemplate}
    />
  );
}
