/**
 * Form templates and saved forms. Every write goes through the shared rules
 * in lib/forms.ts, so bad data never reaches the database.
 */
import "server-only";
import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  normalizeFields,
  templateInputSchema,
  validateValues,
  type FormValues,
  type TemplateInput,
} from "@/lib/forms";
import { HttpError, isUuid } from "@/lib/http";
import type { FormSubmissionDTO, FormTemplateDTO } from "@/lib/types";

const { formTemplates, formSubmissions } = schema;

// --- Templates ------------------------------------------------------------------

function templateToDTO(row: schema.FormTemplate, submissionCount = 0): FormTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: row.fields,
    submissionCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Parse and clean template input; throws a 400 with a readable message. */
function parseTemplate(input: TemplateInput) {
  const parsed = templateInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid form template.");
  try {
    return { ...parsed.data, fields: normalizeFields(parsed.data.fields) };
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid form fields.");
  }
}

export async function listTemplates(): Promise<FormTemplateDTO[]> {
  const rows = await db
    .select({
      ...getTableColumns(formTemplates),
      submissionCount: sql<number>`(select count(*) from "form_submissions" as s where s."template_id" = "form_templates"."id")::int`,
    })
    .from(formTemplates)
    .orderBy(asc(formTemplates.name));
  return rows.map(({ submissionCount, ...row }) => templateToDTO(row, submissionCount));
}

export async function requireTemplate(id: string): Promise<FormTemplateDTO> {
  if (!isUuid(id)) throw new HttpError(404, "Form template not found.");
  const [row] = await db.select().from(formTemplates).where(eq(formTemplates.id, id));
  if (!row) throw new HttpError(404, "Form template not found.");
  return templateToDTO(row);
}

export async function createTemplate(input: TemplateInput): Promise<FormTemplateDTO> {
  const clean = parseTemplate(input);
  const [row] = await db
    .insert(formTemplates)
    .values({ name: clean.name, description: clean.description, fields: clean.fields })
    .returning();
  return templateToDTO(row);
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<FormTemplateDTO> {
  await requireTemplate(id);
  const clean = parseTemplate(input);
  const [row] = await db
    .update(formTemplates)
    .set({ name: clean.name, description: clean.description, fields: clean.fields, updatedAt: new Date() })
    .where(eq(formTemplates.id, id))
    .returning();
  return templateToDTO(row);
}

/** Saved forms that used it are kept (they hold their own copy of the fields). */
export async function deleteTemplate(id: string): Promise<void> {
  await requireTemplate(id);
  await db.delete(formTemplates).where(eq(formTemplates.id, id));
}

// --- Saved forms ------------------------------------------------------------------

function submissionToDTO(row: schema.FormSubmission): FormSubmissionDTO {
  return {
    id: row.id,
    templateId: row.templateId,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    templateName: row.templateName,
    fields: row.fields,
    values: row.values,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Check values against the fields; throws a 400 listing what's wrong. */
function checkValues(fields: schema.FormSubmission["fields"], raw: Record<string, unknown>): FormValues {
  const { values, errors } = validateValues(fields, raw);
  const problems = Object.entries(errors);
  if (problems.length > 0) {
    const labels = problems.map(([key, message]) => `${fields.find((f) => f.key === key)?.label ?? key}: ${message}`);
    throw new HttpError(400, `Please fix: ${labels.join(" · ")}`);
  }
  return values;
}

export async function listSubmissions(workspaceId: string): Promise<FormSubmissionDTO[]> {
  const rows = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.workspaceId, workspaceId))
    .orderBy(desc(formSubmissions.createdAt));
  return rows.map(submissionToDTO);
}

export async function requireSubmission(id: string): Promise<FormSubmissionDTO> {
  if (!isUuid(id)) throw new HttpError(404, "Saved form not found.");
  const [row] = await db.select().from(formSubmissions).where(eq(formSubmissions.id, id));
  if (!row) throw new HttpError(404, "Saved form not found.");
  return submissionToDTO(row);
}

export async function createSubmission(input: {
  templateId: string;
  workspaceId: string;
  conversationId?: string | null;
  values: Record<string, unknown>;
}): Promise<FormSubmissionDTO> {
  const template = await requireTemplate(input.templateId);
  const values = checkValues(template.fields, input.values);
  const [row] = await db
    .insert(formSubmissions)
    .values({
      templateId: template.id,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      templateName: template.name,
      fields: template.fields,
      values,
    })
    .returning();
  return submissionToDTO(row);
}

export async function updateSubmission(id: string, rawValues: Record<string, unknown>): Promise<FormSubmissionDTO> {
  const existing = await requireSubmission(id);
  const values = checkValues(existing.fields, rawValues);
  const [row] = await db
    .update(formSubmissions)
    .set({ values, updatedAt: new Date() })
    .where(eq(formSubmissions.id, id))
    .returning();
  return submissionToDTO(row);
}

export async function deleteSubmission(id: string): Promise<void> {
  await requireSubmission(id);
  await db.delete(formSubmissions).where(eq(formSubmissions.id, id));
}
