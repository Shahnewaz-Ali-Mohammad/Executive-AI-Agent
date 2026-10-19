/**
 * Database schema (PostgreSQL, via Drizzle ORM).
 *
 * Postgres holds the "business" records the app needs: workspaces, documents
 * and their status, the text of each page (for the citation viewer), and the
 * saved conversations, form templates and saved forms, and automations
 * (tasks, schedules, runs and notifications). The searchable chunks and embeddings live in Qdrant instead,
 * written by the n8n ingestion workflow.
 *
 * After changing this file, run `npm run db:generate` to create a migration,
 * then `npm run db:migrate` to apply it.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { Citation } from "@/lib/citations";
import type { ChatCard } from "@/lib/cards";
import type { FormField, FormValues } from "@/lib/forms";
import type { Recurrence } from "@/lib/schedule";

/** Lifecycle of an uploaded document. */
export const documentStatus = pgEnum("document_status", ["processing", "ready", "failed"]);

/** Who wrote a chat message. */
export const messageRole = pgEnum("message_role", ["user", "assistant"]);

/**
 * A workspace is a separate, private set of documents and conversation,
 * e.g. "Board – Q3", "Project Falcon acquisition", "Key client: Acme".
 * Search never crosses workspace boundaries.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One uploaded file (PDF, image, Word, Excel …). */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Path of the original file inside STORAGE_DIR. */
    storageKey: text("storage_key").notNull(),
    status: documentStatus("status").notNull().default("processing"),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count"),
    /** Short "what is this and what needs attention" digest written at upload time. */
    summary: text("summary"),
    /** Why indexing failed, when status = "failed". */
    error: text("error"),
    /** What kind of document it is (Contract, Invoice, Board pack …), found when key facts are read. */
    category: text("category"),
    /** A few short labels (e.g. "Northwind", "Lease"), editable. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Reading of key facts: pending → running → done | failed (skipped: nothing to read). */
    factsStatus: text("facts_status").notNull().default("pending"),
    factsError: text("facts_error"),
    /** Important things the document seems to be missing ("No end date"). */
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("documents_workspace_idx").on(table.workspaceId)],
);

/**
 * Key facts found in a document: dates that matter (renewal, expiry,
 * deadline, payment, notice …), parties and amounts. Each keeps the page and
 * the words it came from, so it can be checked in one click.
 */
export const documentFacts = pgTable(
  "document_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** renewal | expiry | deadline | payment | notice | start | meeting | other_date | party | amount | other */
    kind: text("kind").notNull(),
    /** What it is, e.g. "Northwind contract auto-renews". */
    label: text("label").notNull(),
    /** The date, for date facts. */
    date: date("date", { mode: "string" }),
    /** The value for other facts ("BDT 1.2 million", "Northwind Ltd"), or extra detail. */
    value: text("value"),
    page: integer("page"),
    /** The words in the document it was read from. */
    quote: text("quote"),
    /** unchecked (as read by the AI) | confirmed | dismissed */
    status: text("status").notNull().default("unchecked"),
    /** ai | manual */
    source: text("source").notNull().default("ai"),
    /** Remind this many days before the date (0 = on the day). */
    reminderDays: jsonb("reminder_days").$type<number[]>().notNull().default([30, 7, 0]),
    /** Which of those reminders have gone out (reset when the date changes). */
    remindersSent: jsonb("reminders_sent").$type<number[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_facts_workspace_date_idx").on(table.workspaceId, table.date),
    index("document_facts_document_idx").on(table.documentId),
  ],
);

/**
 * The parsed text (Markdown) of every page. Used by the citation viewer to
 * show the exact passage, including for files the browser can't preview
 * (Word, Excel). Also used by the mock backend for keyword search.
 */
export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    content: text("content").notNull(),
  },
  (table) => [unique("document_pages_doc_page_unique").on(table.documentId, table.pageNumber)],
);

/**
 * A saved chat inside a workspace. A workspace can have many; the CEO picks
 * one from the list or starts a new one. The title is the first question
 * (shortened) until renamed.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Last activity; the list shows the most recent first. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversations_workspace_idx").on(table.workspaceId, table.updatedAt)],
);

/** The questions and answers of each conversation. */
export const chatMessages = pgTable(
  "chat_messages",
  {
    /** The AG-UI message id, so client and server agree on identity. */
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    /** Response mode used for this answer (brief, deep_dive, …). */
    mode: text("mode"),
    /** Citations found in an assistant answer, resolved to documents. */
    citations: jsonb("citations").$type<Citation[]>(),
    /**
     * A card shown with an answer: a filled form, a form template draft, or a
     * task / schedule to confirm.
     */
    card: jsonb("card").$type<ChatCard>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chat_messages_workspace_idx").on(table.workspaceId, table.createdAt),
    index("chat_messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

/**
 * A form template: a name and its fields. Shared by all workspaces, so the
 * same "Leave request" can be filled in anywhere.
 */
export const formTemplates = pgTable("form_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  fields: jsonb("fields").$type<FormField[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A filled-in, saved form. Keeps its own copy of the template's name and
 * fields, so it reads the same even if the template is later edited or deleted.
 */
export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").references(() => formTemplates.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** The conversation it was filled in from, if any. */
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    templateName: text("template_name").notNull(),
    fields: jsonb("fields").$type<FormField[]>().notNull(),
    values: jsonb("values").$type<FormValues>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("form_submissions_workspace_idx").on(table.workspaceId, table.createdAt)],
);

// --- Automations (run by the n8n scheduler) -----------------------------------------

export const taskStatus = pgEnum("task_status", ["open", "done", "cancelled"]);
export const scheduleKind = pgEnum("schedule_kind", ["report", "reminder"]);

/** Something assigned to a person, with an optional due date. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    details: text("details").notNull().default(""),
    assigneeName: text("assignee_name"),
    /** If set, n8n emails the assignee when the task is created and when it falls due. */
    assigneeEmail: text("assignee_email"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** The CEO's time zone when it was created, for showing the deadline in emails. */
    timeZone: text("time_zone").notNull().default("UTC"),
    status: taskStatus("status").notNull().default("open"),
    /** When the "task due" notification went out (so it's sent once). */
    dueNotifiedAt: timestamp("due_notified_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tasks_workspace_idx").on(table.workspaceId, table.status)],
);

/** A report or reminder that runs once or on a recurring schedule. */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    kind: scheduleKind("kind").notNull(),
    title: text("title").notNull(),
    /** Report: the question the AI answers each time. Reminder: the message. */
    prompt: text("prompt").notNull(),
    /** Report: the answer mode (brief, risk_scan …). */
    mode: text("mode"),
    recurrence: jsonb("recurrence").$type<Recurrence>().notNull(),
    timeZone: text("time_zone").notNull(),
    /** Next time it's due; null when a one-off has run. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    /** If set, n8n also emails the result here. */
    notifyEmail: text("notify_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("schedules_due_idx").on(table.active, table.nextRunAt)],
);

/** One execution claimed by the scheduler: what ran, when, and how it went. */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    factId: uuid("fact_id").references(() => documentFacts.id, { onDelete: "set null" }),
    /** Extra details, e.g. { daysBefore: 30 } for a key-date reminder. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    /** report | reminder | task_due | task_assigned | key_date */
    type: text("type").notNull(),
    /** queued → claimed (by n8n) → running → succeeded | failed */
    status: text("status").notNull().default("queued"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    notificationId: uuid("notification_id"),
    /** How the result was delivered outside the app, e.g. { email: "sent" }. */
    delivery: jsonb("delivery").$type<Record<string, string>>(),
  },
  (table) => [index("automation_runs_status_idx").on(table.status, table.startedAt)],
);

/** What shows under the bell: finished reports, reminders, due tasks, failures. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** report | reminder | task_due | task_assigned | key_date | error */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** Markdown (a full report, or a short message). */
    body: text("body").notNull().default(""),
    citations: jsonb("citations").$type<Citation[]>(),
    mode: text("mode"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    runId: uuid("run_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_workspace_idx").on(table.workspaceId, table.createdAt)],
);

/** Small app-wide values, e.g. when the n8n scheduler last checked in. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type DocumentRecord = typeof documents.$inferSelect;
export type DocumentPage = typeof documentPages.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ChatMessageRecord = typeof chatMessages.$inferSelect;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type DocumentFact = typeof documentFacts.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
