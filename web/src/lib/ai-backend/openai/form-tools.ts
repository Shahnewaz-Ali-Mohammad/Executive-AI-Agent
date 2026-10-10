/**
 * Forms as AI "tools".
 *
 *   - One fill tool per form template, whose arguments are exactly that form's
 *     fields. With strict mode the model must answer in that shape: every
 *     field present, unknown values as null, dropdowns limited to their choices.
 *   - One tool to draft a new form template from a description.
 *
 * The model decides when to call one (e.g. "fill a leave request for Rahim…").
 * The result becomes a form card in the chat; nothing is saved until the CEO
 * presses Save.
 */
import "server-only";
import {
  FIELD_TYPES,
  normalizeFields,
  templateInputSchema,
  validateValues,
  type FormAttachment,
  type FormField,
} from "@/lib/forms";
import type { FormTemplateDTO } from "@/lib/types";
import type { ChatTool } from "./client";

const FILL_PREFIX = "fill_form_";
export const CREATE_TEMPLATE_TOOL = "create_form_template";

/** Most templates offered at once (OpenAI allows 128 tools; keep prompts small). */
const MAX_FILL_TOOLS = 60;

/** JSON Schema for one field's value; every value may be null ("not stated"). */
function valueSchema(field: FormField): Record<string, unknown> {
  const description = [
    field.label,
    field.required ? "(required)" : "(optional)",
    field.hint ? `— ${field.hint}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  switch (field.type) {
    case "number":
      return { type: ["number", "null"], description };
    case "checkbox":
      return { type: ["boolean", "null"], description };
    case "date":
      return { type: ["string", "null"], description: `${description}. Format YYYY-MM-DD.` };
    case "select":
      return { type: ["string", "null"], enum: [...(field.options ?? []), null], description };
    default:
      return { type: ["string", "null"], description };
  }
}

function fillTool(template: FormTemplateDTO, index: number): ChatTool {
  return {
    name: `${FILL_PREFIX}${index + 1}`,
    description:
      `Fill in the "${template.name}" form${template.description ? ` (${template.description})` : ""}. ` +
      "Use ONLY facts the CEO stated in this conversation (including earlier form drafts shown as [Form …]); " +
      "never take values from documents and never guess. Set anything not stated to null.",
    parameters: {
      type: "object",
      properties: Object.fromEntries(template.fields.map((field) => [field.key, valueSchema(field)])),
      required: template.fields.map((field) => field.key),
      additionalProperties: false,
    },
  };
}

const createTemplateTool: ChatTool = {
  name: CREATE_TEMPLATE_TOOL,
  description:
    "Draft a NEW form template when the CEO asks to create, design or set up a form. " +
    "Choose sensible field types; use 'select' with options for fixed choices; mark essential fields required.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short form name, e.g. 'Leave request'" },
      description: { type: "string", description: "One sentence on what the form is for" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            type: { type: "string", enum: [...FIELD_TYPES] },
            required: { type: "boolean" },
            options: { type: ["array", "null"], items: { type: "string" }, description: "Choices, only for type 'select'" },
            hint: { type: ["string", "null"], description: "Short guidance for whoever fills it in" },
          },
          required: ["label", "type", "required", "options", "hint"],
          additionalProperties: false,
        },
      },
    },
    required: ["name", "description", "fields"],
    additionalProperties: false,
  },
};

/** The tools offered with every question. */
export function formTools(templates: FormTemplateDTO[]): ChatTool[] {
  return [...templates.slice(0, MAX_FILL_TOOLS).map(fillTool), createTemplateTool];
}

/** How the model should use the tools (added to the system prompt). */
export function formRules(templates: FormTemplateDTO[], today: Date): string {
  const list = templates.length
    ? templates.slice(0, MAX_FILL_TOOLS).map((t, i) => `- ${FILL_PREFIX}${i + 1}: "${t.name}"`).join("\n")
    : "- (no form templates exist yet)";
  const date = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const iso = today.toISOString().slice(0, 10);
  return `FORMS
You can also fill in forms and create form templates with tools. The document rules above apply to questions
about documents; form requests follow these rules instead.
- When the CEO asks to fill, complete, prepare or submit something that matches a form below, call that form's
  tool. Use only what the CEO said in this conversation. Never invent a value; leave unknown values null.
- Convert relative dates ("tomorrow", "the 12th", "next Monday") to YYYY-MM-DD. Today is ${date} (${iso}).
- If the conversation already has a draft of the same form ([Form "…" (not saved yet) — …]) and the CEO adds or
  corrects details, call the tool again with ALL values: the earlier ones plus the changes.
- After a fill tool call, write one short sentence. If required fields are still empty, ask for them by name in
  one short question. Do not repeat the filled values.
- When the CEO asks to create or design a new form, call ${CREATE_TEMPLATE_TOOL}.
- If no form matches what the CEO wants to fill, say so and offer to create one.
Forms:
${list}`;
}

/** Turn a tool call into a form card, plus a fallback sentence if the model wrote none. */
export function attachmentFromToolCall(
  call: { name: string; arguments: string },
  templates: FormTemplateDTO[],
): { form: FormAttachment; text: string } | null {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }

  if (call.name === CREATE_TEMPLATE_TOOL) {
    const raw = {
      name: args.name,
      description: args.description ?? "",
      fields: Array.isArray(args.fields)
        ? args.fields.map((f: Record<string, unknown>) => ({
            label: f.label,
            type: f.type,
            required: Boolean(f.required),
            options: Array.isArray(f.options) && f.options.length ? f.options : undefined,
            hint: typeof f.hint === "string" && f.hint ? f.hint : undefined,
          }))
        : [],
    };
    const parsed = templateInputSchema.safeParse(raw);
    if (!parsed.success) return null;
    let fields: FormField[];
    try {
      fields = normalizeFields(parsed.data.fields);
    } catch {
      return null;
    }
    return {
      form: { kind: "template", name: parsed.data.name, description: parsed.data.description, fields, templateId: null },
      text: `Here's a draft **${parsed.data.name}** form with ${fields.length} fields. Check it and press **Save template**.`,
    };
  }

  if (call.name.startsWith(FILL_PREFIX)) {
    const template = templates[Number(call.name.slice(FILL_PREFIX.length)) - 1];
    if (!template) return null;
    const { values, missing } = validateValues(template.fields, args);
    const missingLabels = missing.map((key) => template.fields.find((f) => f.key === key)?.label ?? key);
    return {
      form: {
        kind: "fill",
        templateId: template.id,
        templateName: template.name,
        fields: template.fields,
        values,
        submissionId: null,
      },
      text:
        `I've filled in the **${template.name}** form from what you told me. Check it and press **Save**.` +
        (missingLabels.length ? `\n\nStill needed: ${missingLabels.join(", ")}. Tell me, or type them into the form.` : ""),
    };
  }
  return null;
}
