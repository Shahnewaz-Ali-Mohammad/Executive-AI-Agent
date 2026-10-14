# Architecture

This document explains how the pieces fit together, what each one is
responsible for, and the exact contracts between them.

## 1. Components and responsibilities

| Component | Responsibility | Lives in |
|---|---|---|
| **Next.js app** | Screens, login, original-file storage, app database, saved conversations, **AG-UI translator** (backend text → AG-UI events) | `web/` |
| **AI backend** | Reading scans, chunking, embeddings, hybrid search, prompting, answers, digests. Runs inside the app (`AI_BACKEND=openai`, `web/src/lib/ai-backend/openai-backend.ts`) or as n8n workflows (`AI_BACKEND=n8n`, `n8n/workflows/`); both follow the same steps | `web/src/lib/ai-backend/` |
| **n8n scheduler** | The clock and the postman for tasks, scheduled reports and reminders: every minute it asks the app what is due, has the app run it, and sends emails over SMTP (workflow 4, always in n8n) | `n8n/workflows/04-scheduler.json` |
| **Qdrant** | Search index: one point per passage, with a dense and a sparse vector | Docker volume `qdrant_data` |
| **Postgres** | Workspaces, documents, page texts, saved conversations and their messages, forms, tasks, schedules, runs and notifications (DB `executive_agent`); n8n's data (DB `n8n`) | Docker volume `postgres_data` |
| **File readers** | PDF, Word, Excel, PowerPoint and text → per-page text, locally | `web/src/lib/extract/` |
| **OpenAI** | Answers (`OPENAI_MODEL` / `_DEEP`), reading scans and photos and digests (`OPENAI_MODEL_FAST`), embeddings (`text-embedding-3-large`), voice fallback | OpenAI API |

The browser never talks to OpenAI, Qdrant or n8n directly. The Next.js server
is their only client. This keeps n8n private, avoids CORS, and puts login and access checks in
one place.

## 2. Upload → indexed document

Shown here for `AI_BACKEND=n8n`. With `AI_BACKEND=openai` the same steps run
inside the Next.js app (see section 8), without the webhook and callback.

```
Browser                Next.js                         n8n "1. Ingest document"
  │ POST /api/workspaces/:id/documents (multipart)
  │──────────────────────►│ validate type/size
  │                       │ save original → web/storage/<ws>/<doc>.<ext>
  │                       │ insert documents row (status=processing)
  │◄── 201 [document] ────│ (in the background:)
  │                       │ read the file page by page (lib/extract)
  │                       │ POST /webhook/ingest (JSON: pages, ids,
  │                       │   + the file itself if it's a scan/photo) ──►│ reply 200 now
  │ GET …/documents (polls every 3 s while processing)                   │ scan/photo? → OpenAI vision
  │                       │                                              │ split pages → passages
  │                       │                                              │ embeddings (64 per call)
  │                       │                                              │ upsert to Qdrant
  │                       │                                              │ digest with OPENAI_MODEL_FAST
  │                       │◄── POST /api/internal/ingest-callback ───────│
  │                       │ store page texts + digest, status=ready
```

If any step fails, n8n's red path calls the same callback with
`status: "failed"` and a reason. If n8n never calls back (it crashed or can't
reach the app), the app marks the document failed after
`INGEST_TIMEOUT_MINUTES`.

### Passages

- Each page is split separately, so every passage knows its page.
- Target is 1,000 characters with 150 of overlap. Cuts prefer paragraph, then
  line, then sentence, then word boundaries.
- The embedding input is prefixed with `"<file>, page <n>"`, so the vector also
  reflects where the passage comes from.

### Qdrant point

```jsonc
{
  "id": "uuid",
  "vector": {
    "dense": [/* 3072 floats */],                 // meaning (OpenAI)
    "bm25":  { "indices": [..], "values": [..] }  // exact words (hashed terms, IDF applied by Qdrant)
  },
  "payload": {
    "text": "…", "file_name": "Q3_Board_Report.pdf", "page_number": 4,
    "chunk_index": 12, "chunk_on_page": 1,
    "document_id": "uuid", "workspace_id": "uuid",
    "mime_type": "application/pdf", "created_at": "ISO date"
  }
}
```

The collection (`infra/qdrant/setup.sh`) has keyword indexes on `workspace_id`
and `document_id`.

## 3. Question → streamed, cited answer

```
Browser (HttpAgent)          Next.js /api/chat                    n8n "2. Chat"
  │ RunAgentInput ─────────────►│ validate, save question          
  │                             │ POST /webhook/chat ───────────────►│ check secret, pick mode/model
  │◄─ RUN_STARTED               │                                    │ embed question
  │◄─ STEP_STARTED reading_…    │                                    │ hybrid search (filter: workspace)
  │                             │                                    │ build prompt with [file, p. N] excerpts
  │                             │◄── {"type":"item","content":"…"} ──│ OpenAI streams
  │◄─ STEP_FINISHED             │                                    
  │◄─ TEXT_MESSAGE_START/CONTENT…/END                                
  │◄─ CUSTOM "citations"        │ resolve [file, p. N] → document ids
  │◄─ RUN_FINISHED              │ save answer + citations          
```

### Hybrid search (Qdrant Query API)

```jsonc
{
  "prefetch": [
    { "query": [/* question embedding */], "using": "dense", "limit": 40, "filter": WS },
    { "query": { "indices": [..], "values": [..] }, "using": "bm25", "limit": 40, "filter": WS }
  ],
  "query": { "fusion": "rrf" },   // Reciprocal Rank Fusion merges both lists
  "limit": 8,                     // 12 for Deep dive and Risk scan
  "with_payload": true
}
// WS = { "must": [{ "key": "workspace_id", "match": { "value": "<workspace>" } }] }
```

### Response modes

| Mode | Model | Shape of the answer |
|---|---|---|
| `brief` | `OPENAI_MODEL` (reasoning low) | Bottom line + ≤5 bullets, <150 words |
| `deep_dive` | `OPENAI_MODEL_DEEP` (reasoning medium) | Bottom line, analysis, implications, what to watch |
| `compare` | `OPENAI_MODEL` (reasoning low) | Comparison table, what changed, why it matters |
| `risk_scan` | `OPENAI_MODEL_DEEP` (reasoning medium) | Ranked risks, contradictions, missing data |
| `prep_me` | `OPENAI_MODEL` (reasoning low) | Likely hard questions with suggested, sourced answers |
| `draft` | `OPENAI_MODEL` (reasoning low) | Email / memo / talking points with removable source markers |

All modes share the base rules: bottom line first, cite every claim, never
invent, flag contradictions, end with **Data availability** when something is
missing, and treat document text as data rather than instructions. The prompts
live in the **Prepare question** node.

### Citations

The model is told to cite as `[File name.pdf, p. 4]`.
`web/src/lib/citations.ts` finds these references, matches each file name to a
document in the workspace (exact name first, then an unambiguous prefix), and:

- on the server, sends them as the AG-UI `CUSTOM` event `citations` and stores
  them with the message;
- in the browser, turns them into clickable tabs while the answer streams.

## 4. AG-UI wire format

The app speaks standard [AG-UI](https://docs.ag-ui.com) over SSE. Request
(sent by `@ag-ui/client`'s `HttpAgent`):

```jsonc
{
  "threadId": "<conversation id>", "runId": "uuid",
  "messages": [{ "id": "…", "role": "user", "content": "What is our runway?" }, …],
  "tools": [], "context": [], "state": {},
  "forwardedProps": { "workspaceId": "uuid", "conversationId": "uuid", "mode": "brief" }
}
```

Response (`text/event-stream`), one event per `data:` line:

```
data: {"type":"RUN_STARTED","threadId":"…","runId":"…"}
data: {"type":"STEP_STARTED","stepName":"reading_documents"}
data: {"type":"STEP_FINISHED","stepName":"reading_documents"}
data: {"type":"TEXT_MESSAGE_START","messageId":"…","role":"assistant"}
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"…","delta":"Runway is "}
data: {"type":"TEXT_MESSAGE_END","messageId":"…"}
data: {"type":"CUSTOM","name":"citations","value":{"messageId":"…","citations":[…]}}
data: {"type":"RUN_FINISHED","threadId":"…","runId":"…"}
```

On failure, `RUN_ERROR` carries a readable message (for example, which n8n step
failed).

## 5. n8n webhook contracts

Every call carries the header `x-webhook-secret: $N8N_SHARED_SECRET`. The
workflows reject calls without it.

| Workflow | Request | Response |
|---|---|---|
| `POST /webhook/ingest` | JSON: `document_id`, `workspace_id`, `file_name`, `mime_type`, `callback_url`, `pages[{page,content}]`, `needs_vision`, `file_base64` (scans/photos only) | `200 {"accepted":true}` at once; the result arrives later via callback |
| `POST /webhook/chat` | JSON: `question`, `mode`, `workspace_id`, `history[{role,content}]`, `document_names[]` | Stream of JSON objects: `begin`, `item{content}`…, `end` (or `error`) |
| `POST /webhook/delete-document` | JSON: `document_id`, `workspace_id` | Qdrant's delete result |

Callback from n8n to the app, `POST /api/internal/ingest-callback` (same secret
header):

```jsonc
{ "status": "ready", "documentId": "uuid", "totalChunks": 42,
  "summary": "3-line digest", "pages": [{ "page": 1, "content": "markdown" }] }
// or
{ "status": "failed", "documentId": "uuid", "error": "why" }
```

## 6. App API (Next.js)

All routes require login, except those marked public.

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` | Session cookie (login is public) |
| `GET/POST /api/workspaces` | List / create |
| `PATCH/DELETE /api/workspaces/:id` | Rename / delete (removes files and search entries too) |
| `GET/POST /api/workspaces/:id/documents` | List / upload |
| `GET/POST /api/workspaces/:id/conversations` | Saved conversations (newest first) / start one |
| `PATCH/DELETE /api/conversations/:id` | Rename / delete a conversation (documents are kept) |
| `GET /api/conversations/:id/messages` | A conversation's messages |
| `GET/POST /api/forms/templates` | Form templates / create one |
| `PATCH/DELETE /api/forms/templates/:id` | Edit / delete a template (saved forms are kept) |
| `GET/POST /api/workspaces/:id/forms` | Saved forms in a workspace / save a filled form |
| `GET/PATCH/DELETE /api/forms/submissions/:id` | One saved form / correct it / delete it |
| `GET/DELETE /api/documents/:id` | Details / delete |
| `GET /api/documents/:id/file` | Original file (`?download=1` to download) |
| `GET /api/documents/:id/pages/:n` | Parsed text of one page |
| `POST /api/chat` | AG-UI endpoint |
| `POST /api/transcribe` | OpenAI transcription fallback for voice |
| `GET/POST /api/workspaces/:id/tasks` | Tasks in a workspace / create one (from a chat card) |
| `PATCH/DELETE /api/tasks/:id` | Mark done / reopen / cancel, delete |
| `GET/POST /api/workspaces/:id/schedules` | Scheduled reports and reminders / create one |
| `PATCH/DELETE /api/schedules/:id` | Pause or resume (`{active}`), delete |
| `POST /api/schedules/:id/run` | Queue an extra run now (n8n picks it up within a minute) |
| `GET /api/notifications` | Latest notifications (all workspaces), unread count, scheduler health |
| `GET/DELETE /api/notifications/:id` | Full notification (marks it read) / delete |
| `POST /api/notifications/read` | Mark some (`{ids}`) or all as read |
| `POST /api/internal/ingest-callback` | From n8n (public, secret-protected) |
| `POST /api/internal/automation/due` | From n8n's scheduler, every minute (public, secret-protected) |
| `POST /api/internal/automation/runs/:id/execute` | From n8n: run one job, get the email to send |
| `POST /api/internal/automation/runs/:id/delivered` | From n8n: whether the email went out |
| `GET /api/health` | Health check (public) |

## 7. Database (Postgres, Drizzle)

```
workspaces      id, name, description, created_at
documents       id, workspace_id→, file_name, mime_type, size_bytes, storage_key,
                status(processing|ready|failed), page_count, chunk_count,
                summary, error, created_at, updated_at
document_pages  id, document_id→, page_number, content          (unique doc+page)
conversations   id, workspace_id→, title, created_at, updated_at
chat_messages   id (AG-UI message id), workspace_id→, conversation_id→, role,
                content, mode, citations(jsonb), card(jsonb: form / task / schedule
                card), created_at
form_templates  id, name, description, fields(jsonb), created_at, updated_at
form_submissions id, template_id→ (set null), workspace_id→, conversation_id→,
                template_name, fields(jsonb copy), values(jsonb), created_at, updated_at
tasks           id, workspace_id→, conversation_id→, title, details, assignee_name,
                assignee_email, due_at, time_zone, status(open|done|cancelled),
                due_notified_at, completed_at, created_at, updated_at
schedules       id, workspace_id→, conversation_id→, kind(report|reminder), title,
                prompt, mode, recurrence(jsonb), time_zone, next_run_at,
                last_run_at, active, notify_email, created_at, updated_at
automation_runs id, workspace_id→, schedule_id→, task_id→,
                type(report|reminder|task_due|task_assigned),
                status(queued|claimed|running|succeeded|failed), scheduled_for,
                started_at, finished_at, error, notification_id, delivery(jsonb)
notifications   id, workspace_id→, kind(report|reminder|task_due|error), title,
                body(markdown), citations(jsonb), mode, task_id→, schedule_id→,
                run_id, read_at, created_at
app_settings    key, value(jsonb), updated_at        (the scheduler's heartbeat)
```

A workspace holds many conversations. "New conversation" starts a fresh one,
which is saved (and titled with its first question) when the first question is
asked. Deleting a workspace, conversation or document cascades to its rows. Files and Qdrant points
are removed by the API route before the rows.

## 8. Direct OpenAI backend and mock backend

`AI_BACKEND=openai` swaps n8n for `web/src/lib/ai-backend/openai-backend.ts`.
It runs the same steps as the n8n workflows inside the web app: local
extraction (or OpenAI vision for scans), passages, OpenAI embeddings, a Qdrant
upsert, and an OpenAI digest. For answers it does the embed, then the hybrid
search, then streams the answer from the Responses API (with the form tools). The prompts are in
`ai-backend/openai/prompts.ts`. The passage and keyword logic is in
`ai-backend/openai/search-index.ts`, and it's identical to the workflows, so
both backends share one Qdrant collection. The browser still gets AG-UI
events from `/api/chat`.

`AI_BACKEND=mock` swaps n8n for `web/src/lib/ai-backend/mock-backend.ts`. It
uses the same `AiBackend` interface: pdf.js pulls out page text locally, and
"answers" are keyword matches formatted with real citations. Use it to develop
and demo the interface without any API keys.

## 9. Design decisions

- **n8n does the AI work, Next.js does the product.** Pipelines and prompts can
  be read and edited visually in n8n, while security-sensitive work (login,
  files, permissions) stays in typed code.
- **Callbacks instead of waiting.** Parsing a 200-page PDF can take minutes, so
  the upload request returns at once and n8n reports back later.
- **Per-page parsing.** Citations need correct page numbers, so pages are never
  merged before splitting.
- **Hybrid search.** Executives ask about names, codes and exact figures
  ("Northwind", "EBITDA Q3") as well as concepts. Keyword vectors catch the
  first kind and embeddings catch the second, and RRF merges both.
- **Settings in `.env`, read via `$env` in n8n.** One file configures
  everything, and only the OpenAI and SMTP credentials exist inside n8n
  (recreated from `.env` on every start).

## Forms

Forms turn something said in the chat into a structured, saved record.

- **Templates** (`form_templates`) hold a name and a list of fields: label,
  type (short text, long text, number, date, dropdown, yes/no, email, phone),
  required, dropdown choices and a hint. They are shared by all workspaces.
- **Filling**: with every question, the OpenAI backend offers one tool per
  template whose arguments are exactly that template's fields, in strict mode
  (every field present, unknown values `null`, dropdowns limited to their
  choices). When the CEO asks to fill a form, the model calls that tool using
  only what was said in the conversation. The result is checked against the
  template (`lib/forms.ts`) and sent to the browser as an AG-UI `CUSTOM`
  event named `card`, after the answer text.
- **Follow-ups**: history is loaded from the database and each form card is
  included as a short line (`[Form "Leave request" (not saved yet) — …]`), so
  "the department is Finance" produces an updated card with all values.
- **Creating templates**: a `create_form_template` tool drafts a template from
  a description; it is saved only when the CEO presses **Save template**.
- **Saving**: the card's values are validated in the browser and again on the
  server. A saved form (`form_submissions`) keeps its own copy of the fields,
  so editing or deleting the template later never changes it. The card's chat
  message is updated so reopening the conversation shows it as saved.

## Tasks, scheduled reports and reminders (n8n scheduler)

The CEO asks in the chat; n8n keeps time and delivers; the app keeps the data
and does the AI work.

**From the chat.** With every question the OpenAI backend also offers two
strict-mode tools (`ai-backend/openai/action-tools.ts`):

| Tool | For | Card |
|---|---|---|
| `create_task` | "Ask Rahim to send the Q3 numbers by Friday" | title, assignee name and optional email, due date and time, details → **Create task** |
| `create_schedule` | "Every Monday at 8 give me a risk scan…", "Remind me tomorrow at 3pm…" | kind (report / reminder), prompt, answer mode, recurrence, optional email → **Schedule** |

The browser sends its time zone with every question (`forwardedProps.timeZone`),
so "tomorrow at 9" and "every weekday at 07:30" mean the CEO's local time.
Recurrence is `{ frequency: once|daily|weekdays|weekly|monthly, time "HH:MM",
weekdays[], dayOfMonth, date }`; the next run is computed in that time zone
with the built-in Intl data (`lib/schedule.ts`), so daylight-saving changes are
handled and the 31st falls back to a short month's last day. Like forms, cards
are only proposals: nothing exists until the button is pressed, and a follow-up
("make it 9 instead") produces an updated card.

**The scheduler** (`n8n/workflows/04-scheduler.json`) runs every minute:

1. `POST /api/internal/automation/due` with `{ emailEnabled }`. In one
   transaction the app records the heartbeat, marks runs stuck for over 15
   minutes as failed, queues a run for each active schedule whose
   `next_run_at` has passed (and moves `next_run_at` on; a schedule missed while
   n8n was down runs once, not once per missed slot; a one-off is then
   finished), queues a `task_due` run for each open task past its deadline, and
   hands out up to 10 queued runs (`task_assigned` runs are queued when a task
   with an email is created; **Run now** queues one too). Rows are locked with
   `FOR UPDATE SKIP LOCKED`, so overlapping executions never get the same run.
2. For each run, one at a time, `POST /runs/:id/execute`. A run moves
   `claimed → running` exactly once. A report goes through the same search and
   model as the chat (the schedule's answer mode, no tools, no history) and is
   saved as a notification with its citations. Reminders and due tasks become
   notifications too. The reply carries the email to send, already written
   (`lib/email.ts`: plain text plus simple HTML), or `null`. An AI failure
   gives `status: "failed"` and an error notification instead of an HTTP error,
   so the workflow carries on.
3. If there is an email and `SMTP_HOST` is set, n8n's **Send email** node sends
   it with the SMTP credential, then `POST /runs/:id/delivered` with
   `sent | failed | skipped`. A failed email becomes an error notification.

Successful scheduler executions aren't saved in n8n (one a minute would fill
its database); failed ones are. Every run is recorded in `automation_runs`.

**In the app.** The bell polls `GET /api/notifications` every 30 seconds (and
when the tab comes back into view). The Tasks tab lists open tasks (soonest due
first, overdue in red, whether the assignee was emailed), finished tasks, and
schedules with their next run and last result; it warns when the scheduler
hasn't checked in for three minutes.

**Delivery** is always in the app; email is optional (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `.env`). Links in emails use
`APP_PUBLIC_URL`.
