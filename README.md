# Executive Agent

A private document assistant for a CEO. Upload board packs, reports, contracts,
spreadsheets or photos of slides, then ask questions by typing or by voice. Every
answer is a short briefing, and every claim links to the exact page it came from.

```
┌──────────────┬──────────────────────────────┬─────────────────────┐
│ Workspaces   │ "What will the board push    │  Q3_Board_Report    │
│  Board – Q3  │  back on?"                   │  page 3             │
│  Project X   │                              │  ┌───────────────┐  │
│              │ Bottom line: runway is 14    │  │ the cited     │  │
│ Documents    │ months [Q3_Board_Report  1]… │  │ page, opened  │  │
│  + Add       │                              │  │ on click      │  │
│  Q3 report   │ [Brief|Deep dive|Risk scan…] │  └───────────────┘  │
└──────────────┴──────────────────────────────┴─────────────────────┘
```

## What's in this version (phase 1)

- **Upload** PDFs, scans and photos, Word, Excel, PowerPoint, CSV and text files.
- **Workspaces**: one private space per topic. Search never crosses between them.
- **Chat with citations**: answers stream in word by word; each `[file, page]`
  citation opens that page beside the chat.
- **Response modes**: Brief, Deep dive, Compare, Risk scan, Prep me, Draft.
- **Missing-data flags**: answers say what the documents don't cover.
- **Digest on upload**: a 3-line "what is this and what needs attention".
- **Voice input**: the browser's own dictation, with OpenAI transcription as a fallback.
- **Works on a phone**: installable to the home screen; drawer and full-screen
  viewer on small screens.
- **Login**: one shared password (phase 1). SSO comes later.

## How it fits together

```
Browser ──AG-UI events (SSE)──► Next.js app ──► n8n workflows ──► OpenAI (answers, digests,
 (chat, viewer, voice)          · login            1 ingest           reading scans, embeddings)
                                · files            2 chat           Qdrant (hybrid search)
                                · reads files      3 delete
                                · Postgres
                                · AG-UI translator
```

- **web/**: the Next.js app. Screens, login, file storage, database, and the
  translator that turns n8n's streamed text into AG-UI events.
- **n8n/workflows/**: the AI engine as three n8n workflows. They're imported
  automatically and you can edit them visually.
- **Qdrant**: the search index. Each passage is stored with a meaning vector and
  a keyword vector, and search uses both ("hybrid search").
- **Postgres**: the app's records, plus n8n's own data.

The details (data flow, API, event formats, database) are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project structure

```
executive-agent/
├── .env.example            all settings, documented (copy to .env)
├── docker-compose.yml      Postgres, Qdrant, n8n (+ optional web app)
├── docs/ARCHITECTURE.md    how it works, in detail
├── infra/
│   ├── n8n/entrypoint.sh       first start: imports credential + workflows
│   ├── postgres/init-n8n-db.sh creates n8n's database
│   └── qdrant/setup.sh         creates the search collection
├── n8n/workflows/          01 ingest · 02 chat · 03 delete (importable JSON)
└── web/                    Next.js 16 app (TypeScript, Tailwind)
    ├── drizzle/            database migrations (SQL)
    ├── scripts/migrate.mjs applies migrations
    └── src/
        ├── app/            pages and API routes (app/api/…)
        ├── components/     chat/, library/, viewer/, ui/
        ├── hooks/          workspaces, documents, AG-UI chat, voice
        ├── lib/
        │   ├── ai-backend/ n8n backend + mock backend (same interface)
        │   ├── ag-ui/      SSE event stream helper
        │   ├── data/       database queries
        │   ├── db/         Drizzle schema + connection
        │   └── …           citations, env, storage, auth
        └── proxy.ts        login gate
```

## Requirements

- **Docker** (Docker Desktop or OrbStack)
- **Node.js 20.9 or newer**: `node -v`
- For real answers, one **OpenAI API key** (https://platform.openai.com/api-keys)

## Quick start

### 1. Configure (optional at first)

**No `.env` is needed to try it on your own machine.** Without one, the app
uses safe local defaults: mock mode, no login, and built-in development
secrets.

Create a `.env` when you want a login password or real AI answers:

```bash
cd executive-agent
cp .env.example .env
```

Then set `APP_PASSWORD`, and replace the three secrets with random strings
(`openssl rand -hex 32`). Do this before anyone else can reach the app.

### 2. Start the services

```bash
docker compose up -d
```

The first start takes a minute. n8n imports its workflows automatically. Check
progress with `docker compose logs -f n8n`.

### 3. Start the web app

```bash
cd web
npm install
npm run dev             # also creates/updates the database tables
```

Open **http://localhost:3100**. Without a `.env` you go straight in; with
one, sign in with `APP_PASSWORD`.

The project uses its own ports so it doesn't clash with other projects on
your machine:

| Service | Address |
|---|---|
| Web app | http://localhost:3100 |
| n8n editor | http://localhost:5678 |
| Qdrant dashboard | http://localhost:6333/dashboard |
| Postgres | localhost:55432 |

### 4. Choose the mode

Set `AI_BACKEND` in `.env`. All real modes use OpenAI for the AI and Qdrant for search;
the chat always streams to the browser over AG-UI.

| `AI_BACKEND` | What happens | Needs |
|---|---|---|
| `openai` (recommended) | The web app calls OpenAI and Qdrant directly | `OPENAI_API_KEY`, Docker (Postgres + Qdrant) |
| `n8n` | The same steps run as n8n workflows you can edit visually | The above, plus n8n running |
| `mock` | Keyword matching only, no AI keys, to try the UI | Postgres only |

For real answers, set two lines in `.env`:

```
AI_BACKEND=openai
OPENAI_API_KEY=sk-...
```

Then stop `npm run dev` (Ctrl+C) and start it again so it picks up the change.

Upload a document. It shows *Reading and indexing* and then turns ready with a
digest. After that, ask a question.

## How files are read

| File | How it's read | "Page" in citations means |
|---|---|---|
| PDF with text | Locally, free (pdf.js) | The PDF page |
| Scanned PDF, photo | OpenAI's vision model | The PDF page / the photo |
| Word (.docx) | Locally, free | A section of about one printed page |
| Excel (.xlsx) | Locally, free; each sheet becomes a table | The worksheet |
| PowerPoint (.pptx) | Locally, free; includes speaker notes | The slide |
| CSV, text | Locally, free | A section of about one printed page |

A PDF counts as "scanned" when more than 30% of its pages have almost no
text. Very long scans take a few minutes to read.

## Using it

| You want to… | Do this |
|---|---|
| Separate topics | Create a workspace per board meeting, deal or client |
| A 30-second answer | **Brief** (default) |
| Contradictions and gaps | **Risk scan** (uses the stronger model) |
| Get ready for a meeting | **Prep me**: likely board questions with suggested answers |
| Compare two reports | **Compare**: answers with a table |
| Write an email or memo | **Draft** |
| Check a claim | Click its citation tab and the page opens on the right |
| Talk instead of type | Press the microphone in the question box |

## Customising

- **How the assistant talks**: open n8n (http://localhost:5678), then
  *Executive Agent · 2. Chat*, then the **Prepare question** node. `BASE_RULES` and `MODES`
  hold the prompts. Save, then **Publish**.
- **Models**: `OPENAI_MODEL` (most answers), `OPENAI_MODEL_DEEP` (Deep dive
  and Risk scan) and `OPENAI_MODEL_FAST` (reading scans, digests) in `.env`.
  To save cost, set `OPENAI_MODEL_DEEP` to the same model as `OPENAI_MODEL`.
- **Embedding model**: if you change it, set `EMBEDDING_DIMENSIONS` to match and
  recreate the collection (see *Reset everything*), because existing vectors
  have the old size.
- **Add a response mode**: add it to `web/src/lib/response-modes.ts` (the UI)
  and to `MODES` in the Prepare question node (the prompt).

## Common tasks

| Task | Command / place |
|---|---|
| See what n8n did | n8n editor → workflow → **Executions** |
| Search index dashboard | http://localhost:6333/dashboard |
| Browse the app database | `cd web && npm run db:studio` |
| Re-import workflows from this repo (overwrites edits made in n8n) | `docker compose exec n8n rm /home/node/.n8n/.executive-agent-imported && docker compose restart n8n` |
| Run the web app in Docker as well | `docker compose --profile app up -d --build` |
| Stop everything | `docker compose down` (data is kept) |
| Reset everything (deletes ALL data) | `docker compose down -v` and delete `web/storage` |
| Check code | `cd web && npm run lint && npm run typecheck` |

## Troubleshooting

- **The page says it can't reach the database, or the tables don't exist**:
  run `docker compose up -d` in the project folder, check `docker compose ps`
  shows `postgres` as running, then restart `npm run dev` (it creates the
  tables on start).
- **"Port 3100 is in use"**: another app is using it. Stop that app, or change
  the port in `web/package.json` and set `APP_INTERNAL_URL` in `.env` to match.

- **Documents stay on "Reading and indexing"**: open the *1. Ingest document*
  executions in n8n. If there are none, n8n can't be reached from the app (check
  `N8N_BASE_URL`). If one failed on the last step, n8n can't reach the app (check
  `APP_INTERNAL_URL`, normally `http://host.docker.internal:3100`). After
  `INGEST_TIMEOUT_MINUTES` the document is marked failed with a hint.
- **"n8n chat failed (HTTP 404)"**: the workflow isn't published. Open it in
  n8n and click **Publish**.
- **"Rejected: wrong x-webhook-secret"**: `N8N_SHARED_SECRET` differs between the
  app and n8n. Recreate n8n after changing `.env`.
- **Answers say no passages were found**: check that Qdrant has points (dashboard),
  and that `EMBEDDING_DIMENSIONS` matches the collection.
- **The mic button is missing**: the browser has no speech recognition and no
  recording support. Use Chrome, Edge or Safari.

## Security notes

- Everything listens on `localhost` only, except the optional Docker web app.
- Search is always filtered by workspace inside n8n, and the filter can't be
  bypassed from the browser.
- n8n's webhooks and the app's callback both require the shared secret.
- Original files are stored in `web/storage` (or the `uploads` Docker volume)
  and served only to signed-in users.
- Files are read on your own machine. Only the text of matching passages (and
  the file itself for scans and photos) goes to OpenAI.
- Before exposing the app beyond one machine, put it behind HTTPS, use a long
  `APP_PASSWORD`, and plan for SSO.

## Roadmap

- **Phase 2 (proactive)**: 7am morning brief, pre-meeting briefs from the
  calendar, contract deadline reminders, "what changed" between versions, number
  alarms.
- **Phase 3 (acting for the CEO)**: "ask someone" loops with approval, chasing
  late reports, meeting action items, promise tracker, fact check before sending,
  WhatsApp/Telegram voice, chief-of-staff access, SSO.
