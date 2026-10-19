/**
 * Tasks and schedules as AI "tools".
 *
 *   create_task      "Ask Rahim to send the Q3 numbers by Friday"
 *   create_schedule  "Every Monday at 8 send me a risk scan of the board pack"
 *                    "Remind me tomorrow at 3pm to call the bank"
 *   open_document    "Show me the Northwind contract" → a card that opens it
 *
 * Like forms, a tool call only becomes a card in the chat. Nothing is created
 * until the CEO presses the card's button; the n8n scheduler then runs it.
 */
import "server-only";
import { taskInputSchema, scheduleInputSchema, type DocumentCard, type ScheduleCard, type TaskCard } from "@/lib/cards";
import { RESPONSE_MODES } from "@/lib/response-modes";
import { describeRecurrence, FREQUENCIES, localParts, WEEKDAY_NAMES } from "@/lib/schedule";
import type { ChatTool } from "./client";

export const CREATE_TASK_TOOL = "create_task";
export const CREATE_SCHEDULE_TOOL = "create_schedule";
export const OPEN_DOCUMENT_TOOL = "open_document";

const nullableString = (description: string) => ({ type: ["string", "null"], description });

const createTaskTool: ChatTool = {
  name: CREATE_TASK_TOOL,
  description:
    "Propose a task (an action item) when the CEO asks to assign, delegate or track something someone must do. " +
    "Use only what the CEO said; set anything not stated to null.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short imperative title, e.g. 'Send Q3 sales figures'" },
      details: { type: "string", description: "Extra context the CEO gave; empty string if none" },
      assignee_name: nullableString("Who should do it, as the CEO named them"),
      assignee_email: nullableString("Their email, only if the CEO stated it"),
      due_date: nullableString("Deadline date, YYYY-MM-DD"),
      due_time: nullableString("Deadline time, HH:MM 24-hour, only if stated"),
    },
    required: ["title", "details", "assignee_name", "assignee_email", "due_date", "due_time"],
    additionalProperties: false,
  },
};

const createScheduleTool: ChatTool = {
  name: CREATE_SCHEDULE_TOOL,
  description:
    "Propose a scheduled REPORT (the assistant answers a question about the workspace's documents at set times and " +
    "notifies the CEO) or a REMINDER (a message delivered at set times). Use for 'every Monday…', 'each morning…', " +
    "'remind me…', 'send me a report at…'.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["report", "reminder"] },
      title: { type: "string", description: "Short name, e.g. 'Weekly cash position'" },
      prompt: {
        type: "string",
        description: "Report: the full question to answer each time, written as the CEO would ask it. Reminder: the message to show.",
      },
      mode: {
        type: ["string", "null"],
        enum: [...RESPONSE_MODES.map((m) => m.id), null],
        description: "Report answer style (brief, deep_dive, risk_scan …); null for reminders",
      },
      frequency: { type: "string", enum: [...FREQUENCIES] },
      time: { type: "string", description: "HH:MM 24-hour local time; 09:00 if not stated" },
      weekdays: {
        type: "array",
        items: { type: "integer" },
        description: "Only for 'weekly': days, 0 = Sunday … 6 = Saturday. Empty array otherwise.",
      },
      day_of_month: { type: ["integer", "null"], description: "Only for 'monthly': 1–31" },
      date: nullableString("For 'once': the date, YYYY-MM-DD. Otherwise null (or a start date if the CEO gave one)."),
      notify_email: nullableString("Also email the result here, only if the CEO asked for email and gave an address"),
    },
    required: ["kind", "title", "prompt", "mode", "frequency", "time", "weekdays", "day_of_month", "date", "notify_email"],
    additionalProperties: false,
  },
};

function openDocumentTool(documentNames: string[]): ChatTool {
  return {
    name: OPEN_DOCUMENT_TOOL,
    description:
      "Show the CEO one of the workspace's documents when they ask to see, open, pull up or find a document " +
      "(e.g. 'show me the Northwind contract', 'where is the lease?'). Also answer in one or two sentences.",
    parameters: {
      type: "object",
      properties: {
        file_name: { type: "string", enum: documentNames, description: "The document, exactly as listed" },
        page: { type: ["integer", "null"], description: "The page that answers the question, if one does; else null" },
      },
      required: ["file_name", "page"],
      additionalProperties: false,
    },
  };
}

export function actionTools(documentNames: string[] = []): ChatTool[] {
  const tools = [createTaskTool, createScheduleTool];
  return documentNames.length > 0 ? [...tools, openDocumentTool(documentNames)] : tools;
}

/** How the model should use them (added to the system prompt). */
export function actionRules(timeZone: string, now: Date): string {
  const p = localParts(now, timeZone);
  const iso = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const clock = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return `TASKS AND SCHEDULES
You can also propose tasks, scheduled reports and reminders with tools. The CEO confirms each one in the chat.
- Now: ${WEEKDAY_NAMES[p.weekday]} ${iso} ${clock} (${timeZone}). Turn relative times ("tomorrow", "Friday",
  "in 2 hours", "end of month") into exact dates and 24-hour times in this time zone.
- "Ask / tell / get <person> to …", "assign …", "make sure X does …" → ${CREATE_TASK_TOOL}.
- "Every … send me / give me / run …", "each morning brief me on …" → ${CREATE_SCHEDULE_TOOL} with kind "report".
  Write the prompt as a complete question about the documents. Pick the mode that fits (risk → risk_scan,
  board prep → prep_me, otherwise brief).
- "Remind me …" → ${CREATE_SCHEDULE_TOOL} with kind "reminder" (frequency "once" unless it repeats).
- Only use an email address the CEO actually gave. Never invent names, emails or dates.
- If the conversation already shows a draft ([Task (not created yet) …] or [Scheduled … (not scheduled yet) …])
  and the CEO changes something, call the tool again with ALL values: the earlier ones plus the change.
- "Show me / open / pull up / where is <document>" → ${OPEN_DOCUMENT_TOOL} with the matching file name (and the page
  if the question is about one part, e.g. the renewal clause). Pick the file from the document list, the register
  and the excerpts; if several could match, pick the best and name the others in your sentence.
- After the tool call write one short sentence; ask for anything essential that is missing (e.g. when it is due).`;
}

/** "Every Monday at 08:00" → "every Monday at 08:00" (keeps day names capitalised). */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Turn a tool call into a task or schedule card, plus a fallback sentence. */
export function actionCardFromToolCall(
  call: { name: string; arguments: string },
  timeZone: string,
): { card: TaskCard | ScheduleCard | DocumentCard; text: string } | null {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }

  if (call.name === OPEN_DOCUMENT_TOOL) {
    if (typeof args.file_name !== "string" || !args.file_name) return null;
    const page = typeof args.page === "number" && args.page > 0 ? Math.floor(args.page) : null;
    // The chat route fills in the id, category, tags and dates from the database.
    return {
      card: { kind: "document", fileName: args.file_name, documentId: null, page, category: null, tags: [], facts: [] },
      text: `Here is **${args.file_name}**.`,
    };
  }

  if (call.name === CREATE_TASK_TOOL) {
    const parsed = taskInputSchema.safeParse({
      title: args.title,
      details: args.details ?? "",
      assigneeName: args.assignee_name,
      // A malformed address is dropped rather than failing the whole card.
      assigneeEmail: typeof args.assignee_email === "string" && /\S+@\S+\.\S+/.test(args.assignee_email) ? args.assignee_email : null,
      dueDate: args.due_date,
      dueTime: args.due_time,
      timeZone,
    });
    if (!parsed.success) return null;
    const task = parsed.data;
    const who = task.assigneeName ? ` for **${task.assigneeName}**` : "";
    return {
      card: { kind: "task", ...task, details: task.details ?? "", timeZone, taskId: null },
      text: `Here's the task${who}. Check it and press **Create task**.`,
    };
  }

  if (call.name === CREATE_SCHEDULE_TOOL) {
    const frequency = args.frequency;
    const parsed = scheduleInputSchema.safeParse({
      scheduleKind: args.kind,
      title: args.title,
      prompt: args.prompt,
      mode: args.kind === "report" ? (args.mode ?? "brief") : null,
      recurrence: {
        frequency,
        time: typeof args.time === "string" && args.time ? args.time : "09:00",
        weekdays: frequency === "weekly" && Array.isArray(args.weekdays) ? args.weekdays : undefined,
        dayOfMonth: frequency === "monthly" && typeof args.day_of_month === "number" ? args.day_of_month : undefined,
        date: typeof args.date === "string" && args.date ? args.date : undefined,
      },
      timeZone,
      notifyEmail: typeof args.notify_email === "string" && /\S+@\S+\.\S+/.test(args.notify_email) ? args.notify_email : null,
    });
    if (!parsed.success) return null;
    const s = parsed.data;
    const card: ScheduleCard = {
      kind: "schedule",
      scheduleKind: s.scheduleKind,
      title: s.title,
      prompt: s.prompt,
      mode: s.mode,
      recurrence: s.recurrence,
      timeZone,
      notifyEmail: s.notifyEmail,
      scheduleId: null,
      nextRunAt: null,
    };
    return {
      card,
      text: `Here's the ${s.scheduleKind} — ${lowerFirst(describeRecurrence(s.recurrence))}. Check it and press **Schedule**.`,
    };
  }
  return null;
}
