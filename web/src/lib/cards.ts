/**
 * Cards the assistant can attach to an answer in the chat. Each one is a
 * proposal the CEO confirms (or edits, then confirms); nothing takes effect
 * before that.
 *
 *   fill      a filled-in form             → Save
 *   template  a new form template draft    → Save template
 *   task      a task for someone           → Create task
 *   schedule  a report or reminder to run  → Schedule
 *   document  a document the CEO asked to see → Open (no confirmation needed)
 *
 * Shared by browser and server.
 */
import { z } from "zod";
import { describeAttachment, type FormAttachment } from "@/lib/forms";
import { RESPONSE_MODES, type ResponseModeId } from "@/lib/response-modes";
import { describeRecurrence, recurrenceSchema, type Recurrence } from "@/lib/schedule";

/** A task proposed in the chat. */
export interface TaskCard {
  kind: "task";
  title: string;
  details: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  /** "YYYY-MM-DD" in the CEO's time zone, or null for no due date. */
  dueDate: string | null;
  /** "HH:MM"; defaults to 17:00 when only a date is given. */
  dueTime: string | null;
  timeZone: string;
  /** Set once created. */
  taskId?: string | null;
}

/** A scheduled report or reminder proposed in the chat. */
export interface ScheduleCard {
  kind: "schedule";
  scheduleKind: "report" | "reminder";
  title: string;
  /** Report: the question answered each time. Reminder: the message. */
  prompt: string;
  /** Report: answer mode. */
  mode: ResponseModeId | null;
  recurrence: Recurrence;
  timeZone: string;
  notifyEmail: string | null;
  /** Set once created. */
  scheduleId?: string | null;
  nextRunAt?: string | null;
}

/** A document the CEO asked to see ("show me the Northwind contract"). */
export interface DocumentCard {
  kind: "document";
  fileName: string;
  /** Resolved by the chat route; null if the file has since been deleted. */
  documentId: string | null;
  /** The page to open on, when the question was about a specific part. */
  page: number | null;
  category: string | null;
  tags: string[];
  /** Upcoming and recent key dates from this document. */
  facts: { kind: string; label: string; date: string | null; value: string | null; page: number | null }[];
}

export type ChatCard = FormAttachment | TaskCard | ScheduleCard | DocumentCard;

const EMAIL = z.string().trim().email("Not a valid email address.").max(200);
const optionalEmail = z
  .union([EMAIL, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** Input for creating a task (from a card or the API). */
export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "The task needs a title.").max(200),
  details: z.string().trim().max(4000).optional().default(""),
  assigneeName: z.string().trim().max(120).nullish().transform((v) => v || null),
  assigneeEmail: optionalEmail,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD.").nullish().transform((v) => v || null),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM.").nullish().transform((v) => v || null),
  timeZone: z.string().max(64).optional(),
});
export type TaskInput = z.input<typeof taskInputSchema>;

const MODE_IDS = RESPONSE_MODES.map((m) => m.id) as [ResponseModeId, ...ResponseModeId[]];

/** Input for creating a schedule (from a card or the API). */
export const scheduleInputSchema = z
  .object({
    scheduleKind: z.enum(["report", "reminder"]),
    title: z.string().trim().min(1, "The schedule needs a title.").max(200),
    prompt: z.string().trim().min(1, "Say what the report should cover, or what to remind you of.").max(4000),
    mode: z.enum(MODE_IDS).nullish().transform((v) => v ?? null),
    recurrence: recurrenceSchema,
    timeZone: z.string().max(64).optional(),
    notifyEmail: optionalEmail,
  })
  .superRefine((value, ctx) => {
    if (value.recurrence.frequency === "weekly" && !value.recurrence.weekdays?.length) {
      ctx.addIssue({ code: "custom", message: "Pick at least one weekday.", path: ["recurrence", "weekdays"] });
    }
  });
export type ScheduleInput = z.input<typeof scheduleInputSchema>;

/**
 * Short text version of a card, given to the AI as conversation history so a
 * follow-up ("make it 8am instead") produces an updated card.
 */
export function describeCard(card: ChatCard): string {
  if (card.kind === "task") {
    const status = card.taskId ? "created" : "not created yet";
    const due = card.dueDate ? `due ${card.dueDate}${card.dueTime ? ` ${card.dueTime}` : ""}` : "no due date";
    return `[Task (${status}) — "${card.title}"; assignee: ${card.assigneeName ?? "(none)"}${
      card.assigneeEmail ? ` <${card.assigneeEmail}>` : ""
    }; ${due}${card.details ? `; details: ${card.details}` : ""}]`;
  }
  if (card.kind === "schedule") {
    const status = card.scheduleId ? "scheduled" : "not scheduled yet";
    return `[Scheduled ${card.scheduleKind} (${status}) — "${card.title}"; ${describeRecurrence(card.recurrence)} (${
      card.timeZone
    }); ${card.scheduleKind === "report" ? `question: ${card.prompt}; mode: ${card.mode ?? "brief"}` : `message: ${card.prompt}`}${
      card.notifyEmail ? `; email: ${card.notifyEmail}` : ""
    }]`;
  }
  if (card.kind === "document") {
    return `[Showed the document "${card.fileName}"${card.page ? ` at p. ${card.page}` : ""}]`;
  }
  return describeAttachment(card);
}
