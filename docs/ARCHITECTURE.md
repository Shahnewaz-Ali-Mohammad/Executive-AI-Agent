# Architecture

This document explains how the pieces fit together, what each one is
responsible for, and the exact contracts between them.

## 1. Components and responsibilities

| Component | Responsibility | Lives in |
|---|---|---|
| **Next.js app** | Screens, login, original-file storage, app database, saved conversations, **AG-UI translator** (backend text → AG-UI events) | `web/` |
| **AI backend** | Reading scans, chunking, embeddings, hybrid search, prompting, answers, digests. Runs inside the app (`AI_BACKEND=openai`, `web/src/lib/ai-backend/openai-backend.ts`) or as n8n workflows (`AI_BACKEND=n8n`, `n8n/workflows/`); both follow the same steps | `web/src/lib/ai-backend/` |
| **Qdrant** | Search index: one point per passage, with a dense and a sparse vector | Docker volume `qdrant_data` |
| **Postgres** | Workspaces, documents, page texts, saved conversations and their messages (DB `executive_agent`); n8n's data (DB `n8n`) | Docker volume `postgres_data` |
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
| `GET/DELETE /api/documents/:id` | Details / delete |
| `GET /api/documents/:id/file` | Original file (`?download=1` to download) |
| `GET /api/documents/:id/pages/:n` | Parsed text of one page |
| `POST /api/chat` | AG-UI endpoint |
| `POST /api/transcribe` | OpenAI transcription fallback for voice |
| `POST /api/internal/ingest-callback` | From n8n (public, secret-protected) |
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
                content, mode, citations(jsonb), created_at
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
search, then streams Chat Completions. The prompts are in
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
  everything, and only the OpenAI credential exists inside n8n (recreated from
  `.env` on every start).
