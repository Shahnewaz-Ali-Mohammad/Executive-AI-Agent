/**
 * Database schema (PostgreSQL, via Drizzle ORM).
 *
 * Postgres holds the "business" records the app needs: workspaces, documents
 * and their status, the text of each page (for the citation viewer), and the
 * saved conversations. The searchable chunks and embeddings live in Qdrant instead,
 * written by the n8n ingestion workflow.
 *
 * After changing this file, run `npm run db:generate` to create a migration,
 * then `npm run db:migrate` to apply it.
 */
import {
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("documents_workspace_idx").on(table.workspaceId)],
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chat_messages_workspace_idx").on(table.workspaceId, table.createdAt),
    index("chat_messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type DocumentRecord = typeof documents.$inferSelect;
export type DocumentPage = typeof documentPages.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ChatMessageRecord = typeof chatMessages.$inferSelect;
