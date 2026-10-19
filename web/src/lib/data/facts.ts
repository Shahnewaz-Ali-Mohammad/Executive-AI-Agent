/**
 * The key dates and facts register: read, correct, confirm, dismiss, add by
 * hand, export, and the per-workspace settings (reminder email, weekly
 * summary). Also gives the AI a compact version of the register, so "when
 * does the Northwind contract renew?" is answered from it with the page.
 */
import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { daysBetween, FACT_KIND_LABELS, FACT_KINDS, isDateKind, todayIn, type FactKind } from "@/lib/facts";
import { HttpError, isUuid } from "@/lib/http";
import { safeTimeZone } from "@/lib/schedule";
import type { DocumentCard } from "@/lib/cards";
import type { FactDTO, KeyFactsSettingsDTO } from "@/lib/types";

const { documentFacts, documents, appSettings, schedules } = schema;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");
const reminderDaysSchema = z.array(z.number().int().min(0).max(365)).max(6);

export const factInputSchema = z.object({
  documentId: z.string(),
  kind: z.enum(FACT_KINDS),
  label: z.string().trim().min(1, "Say what it is.").max(200),
  date: DATE.nullish().transform((v) => v || null),
  value: z.string().trim().max(300).nullish().transform((v) => v || null),
  page: z.number().int().positive().nullish().transform((v) => v ?? null),
  reminderDays: reminderDaysSchema.optional(),
});

export const factUpdateSchema = z.object({
  kind: z.enum(FACT_KINDS).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  date: DATE.nullable().optional(),
  value: z.string().trim().max(300).nullable().optional(),
  page: z.number().int().positive().nullable().optional(),
  status: z.enum(["unchecked", "confirmed", "dismissed"]).optional(),
  reminderDays: reminderDaysSchema.optional(),
});

const selection = {
  fact: documentFacts,
  fileName: documents.fileName,
};

function toDTO(row: { fact: schema.DocumentFact; fileName: string }): FactDTO {
  const f = row.fact;
  return {
    id: f.id,
    documentId: f.documentId,
    fileName: row.fileName,
    kind: f.kind,
    label: f.label,
    date: f.date,
    value: f.value,
    page: f.page,
    quote: f.quote,
    status: f.status as FactDTO["status"],
    source: f.source as FactDTO["source"],
    reminderDays: f.reminderDays,
    createdAt: f.createdAt.toISOString(),
  };
}

export async function listFacts(workspaceId: string): Promise<FactDTO[]> {
  const rows = await db
    .select(selection)
    .from(documentFacts)
    .innerJoin(documents, eq(documents.id, documentFacts.documentId))
    .where(eq(documentFacts.workspaceId, workspaceId))
    .orderBy(sql`${documentFacts.date} asc nulls last`, asc(documents.fileName), asc(documentFacts.page));
  return rows.map(toDTO);
}

async function requireFact(id: string) {
  if (!isUuid(id)) throw new HttpError(404, "Key fact not found.");
  const [row] = await db
    .select(selection)
    .from(documentFacts)
    .innerJoin(documents, eq(documents.id, documentFacts.documentId))
    .where(eq(documentFacts.id, id));
  if (!row) throw new HttpError(404, "Key fact not found.");
  return row;
}

export async function createFact(workspaceId: string, input: z.input<typeof factInputSchema>): Promise<FactDTO> {
  const parsed = factInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid key fact.");
  const f = parsed.data;
  if (isDateKind(f.kind) && !f.date) throw new HttpError(400, "Pick the date.");
  if (!isUuid(f.documentId)) throw new HttpError(400, "Pick the document it belongs to.");
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, f.documentId), eq(documents.workspaceId, workspaceId)));
  if (!doc) throw new HttpError(400, "That document isn't in this workspace.");
  const [row] = await db
    .insert(documentFacts)
    .values({
      workspaceId,
      documentId: f.documentId,
      kind: f.kind,
      label: f.label,
      date: isDateKind(f.kind) ? f.date : null,
      value: f.value,
      page: f.page,
      status: "confirmed",
      source: "manual",
      ...(f.reminderDays ? { reminderDays: f.reminderDays } : {}),
    })
    .returning();
  return toDTO(await requireFact(row.id));
}

export async function updateFact(id: string, input: z.input<typeof factUpdateSchema>): Promise<FactDTO> {
  const existing = await requireFact(id);
  const parsed = factUpdateSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid change.");
  const change = parsed.data;
  const dateChanged = change.date !== undefined && change.date !== existing.fact.date;
  const edited = change.label !== undefined || change.date !== undefined || change.value !== undefined || change.kind !== undefined;
  await db
    .update(documentFacts)
    .set({
      ...change,
      // Correcting a fact confirms it.
      ...(edited && !change.status ? { status: "confirmed" } : {}),
      // A new date (or new reminder days) means the reminders start again.
      ...(dateChanged || change.reminderDays ? { remindersSent: [] } : {}),
      updatedAt: new Date(),
    })
    .where(eq(documentFacts.id, id));
  return toDTO(await requireFact(id));
}

export async function deleteFact(id: string): Promise<void> {
  await requireFact(id);
  await db.delete(documentFacts).where(eq(documentFacts.id, id));
}

// --- Settings ----------------------------------------------------------------------------------

/** The question the weekly summary (every Monday) answers. */
export const WEEKLY_SUMMARY_PROMPT =
  "Using the key dates and facts register, list every renewal, expiry, deadline, notice date and payment in the " +
  "next 30 days, soonest first, with how many days away each is and its source. Flag anything that needs a decision " +
  "this week (especially notice or cancel-by dates), and mention anything overdue.";

const settingsKey = (workspaceId: string) => `key-facts:${workspaceId}`;

export async function getFactSettings(workspaceId: string): Promise<KeyFactsSettingsDTO> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, settingsKey(workspaceId)));
  const value = (row?.value ?? {}) as Partial<KeyFactsSettingsDTO>;
  // The weekly summary is a normal schedule; forget it if it was deleted.
  let weekly = value.weeklySummaryScheduleId ?? null;
  if (weekly) {
    const [s] = await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.id, weekly));
    if (!s) weekly = null;
  }
  return { reminderEmail: value.reminderEmail ?? null, weeklySummaryScheduleId: weekly };
}

export async function saveFactSettings(workspaceId: string, change: Partial<KeyFactsSettingsDTO>): Promise<KeyFactsSettingsDTO> {
  const value = { ...(await getFactSettings(workspaceId)), ...change };
  await db
    .insert(appSettings)
    .values({ key: settingsKey(workspaceId), value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

// --- For the AI ----------------------------------------------------------------------------------

/**
 * The register as short lines for the AI ("[file, p. N] Renewal 2027-03-01 · …"),
 * so date questions are answered from it with a citation. Upcoming and recent
 * dates first, then other facts; dismissed ones are left out.
 */
export async function factsForPrompt(workspaceId: string, limit = 80): Promise<string> {
  const rows = await db
    .select(selection)
    .from(documentFacts)
    .innerJoin(documents, eq(documents.id, documentFacts.documentId))
    .where(and(eq(documentFacts.workspaceId, workspaceId), ne(documentFacts.status, "dismissed")))
    .orderBy(sql`${documentFacts.date} asc nulls last`, desc(documentFacts.createdAt));
  if (rows.length === 0) return "";
  const today = todayIn(safeTimeZone(env.DEFAULT_TIME_ZONE));
  // Dates from 60 days ago onwards come first; older ones only if there's room.
  const recent = rows.filter((r) => !r.fact.date || daysBetween(today, r.fact.date) >= -60);
  const older = rows.filter((r) => r.fact.date && daysBetween(today, r.fact.date) < -60);
  const lines = [...recent, ...older].slice(0, limit).map(({ fact, fileName }) => {
    const kind = FACT_KIND_LABELS[fact.kind as FactKind] ?? fact.kind;
    const when = fact.date ? ` ${fact.date} (${daysBetween(today, fact.date)} days from today)` : "";
    const value = fact.value ? ` · ${fact.value}` : "";
    const checked = fact.status === "confirmed" ? " · confirmed" : "";
    return `[${fileName}${fact.page ? `, p. ${fact.page}` : ""}] ${kind}${when}: ${fact.label}${value}${checked}`;
  });
  return `Today is ${today}.\n${lines.join("\n")}`;
}

/**
 * Complete a document card from the chat: find the file by name (exact, then
 * loose), and add its type, tags and its upcoming (or most recent) dates.
 */
export async function documentCardDetails(workspaceId: string, card: DocumentCard): Promise<DocumentCard> {
  const docs = await db
    .select({ id: documents.id, fileName: documents.fileName, category: documents.category, tags: documents.tags })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId));
  const loose = (name: string) => name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const doc =
    docs.find((d) => d.fileName === card.fileName) ??
    docs.find((d) => loose(d.fileName) === loose(card.fileName)) ??
    docs.find((d) => loose(d.fileName).includes(loose(card.fileName)) || loose(card.fileName).includes(loose(d.fileName)));
  if (!doc) return { ...card, documentId: null };

  const rows = await db
    .select()
    .from(documentFacts)
    .where(and(eq(documentFacts.documentId, doc.id), ne(documentFacts.status, "dismissed")))
    .orderBy(sql`${documentFacts.date} asc nulls last`);
  const today = todayIn(safeTimeZone(env.DEFAULT_TIME_ZONE));
  const dated = rows.filter((f) => f.date);
  const upcoming = dated.filter((f) => daysBetween(today, f.date!) >= 0);
  const shown = (upcoming.length > 0 ? upcoming : dated.slice(-2)).slice(0, 5);
  const others = rows.filter((f) => !f.date).slice(0, Math.max(0, 6 - shown.length));
  return {
    ...card,
    fileName: doc.fileName,
    documentId: doc.id,
    category: doc.category,
    tags: doc.tags,
    facts: [...shown, ...others].map((f) => ({ kind: f.kind, label: f.label, date: f.date, value: f.value, page: f.page })),
  };
}

// --- Export ----------------------------------------------------------------------------------------

export async function exportFactsWorkbook(workspaceId: string, workspaceName: string): Promise<Buffer> {
  const facts = (await listFacts(workspaceId)).filter((f) => f.status !== "dismissed");
  const today = todayIn(safeTimeZone(env.DEFAULT_TIME_ZONE));
  const book = new ExcelJS.Workbook();
  book.creator = "Executive Agent";
  const sheet = book.addWorksheet("Key dates");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Days from today", key: "days", width: 15 },
    { header: "Type", key: "kind", width: 20 },
    { header: "What", key: "label", width: 50 },
    { header: "Detail", key: "value", width: 30 },
    { header: "Document", key: "file", width: 34 },
    { header: "Page", key: "page", width: 7 },
    { header: "Checked", key: "status", width: 11 },
    { header: "From the document", key: "quote", width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const f of facts) {
    sheet.addRow({
      date: f.date ? new Date(`${f.date}T00:00:00Z`) : null,
      days: f.date ? daysBetween(today, f.date) : null,
      kind: FACT_KIND_LABELS[f.kind as FactKind] ?? f.kind,
      label: f.label,
      value: f.value,
      file: f.fileName,
      page: f.page,
      status: f.status === "confirmed" ? "Yes" : "Not yet",
      quote: f.quote,
    });
  }
  sheet.getColumn("date").numFmt = "dd mmm yyyy";
  sheet.autoFilter = { from: "A1", to: "I1" };
  // "&C" centres the header; a literal "&" is written "&&".
  sheet.headerFooter.oddHeader = `&C${workspaceName.replace(/&/g, "&&")} · key dates`;
  return Buffer.from(await book.xlsx.writeBuffer());
}
