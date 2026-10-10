/**
 * Response modes: the different kinds of output the CEO can ask for.
 *
 * The UI shows these as a picker next to the chat box. The selected mode is
 * sent to the backend with every question; the n8n chat workflow turns it
 * into a different system prompt (and, for heavier modes, a stronger model).
 *
 * Shared by client and server — keep it free of server-only imports.
 */

export const RESPONSE_MODES = [
  {
    id: "brief",
    label: "Brief",
    description: "30-second answer: top points and key numbers, with sources.",
  },
  {
    id: "deep_dive",
    label: "Deep dive",
    description: "Full analysis with reasoning, drivers and implications.",
  },
  {
    id: "compare",
    label: "Compare",
    description: "Two documents or periods side by side: what changed and why it matters.",
  },
  {
    id: "risk_scan",
    label: "Risk scan",
    description: "Red flags, contradictions between documents, and missing data.",
  },
  {
    id: "prep_me",
    label: "Prep me",
    description: "Questions the board or investors are likely to ask, with suggested answers.",
  },
  {
    id: "draft",
    label: "Draft",
    description: "Turn the answer into an email, memo or talking points.",
  },
] as const;

export type ResponseModeId = (typeof RESPONSE_MODES)[number]["id"];

export const DEFAULT_RESPONSE_MODE: ResponseModeId = "brief";

const MODE_IDS = new Set<string>(RESPONSE_MODES.map((mode) => mode.id));

/** Narrow an unknown value (e.g. from a request body) to a valid mode id. */
export function isResponseMode(value: unknown): value is ResponseModeId {
  return typeof value === "string" && MODE_IDS.has(value);
}

export function getResponseMode(id: ResponseModeId) {
  return RESPONSE_MODES.find((mode) => mode.id === id) ?? RESPONSE_MODES[0];
}
