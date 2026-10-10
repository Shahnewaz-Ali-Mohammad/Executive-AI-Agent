# Executive AI Agent

A private document assistant for executives. Upload board packs, financial
reports, contracts, spreadsheets, slide decks or photos of documents, then ask
questions in plain language. Answers stream in as short briefings, and every
claim links to the exact page it came from.

Built for internal use by a CEO and their office: self-hosted, one login,
documents stay on your own server.

```
┌────────────────┬──────────────────────────────────┬──────────────────────┐
│ Workspaces     │  "What will the board push       │  Q3_Board_Report.pdf │
│  Board – Q3    │   back on?"                      │  page 3              │
│  Project Falcon│                                  │  ┌────────────────┐  │
│                │  Bottom line: runway is 14       │  │ the cited page │  │
│ Conversations  │  months [Q3_Board_Report  3] …   │  │ opens here     │  │
│  Runway check  │                                  │  └────────────────┘  │
│  Hiring plan   │  Brief · Deep dive · Risk scan … │                      │
│ Documents      │  ┌────────────────────────────┐  │                      │
│  + Add         │  │ Ask about your documents   │  │                      │
└────────────────┴──┴────────────────────────────┴──┴──────────────────────┘
```

## Features

- **Any business document**: PDF, scanned PDF, photos (JPG, PNG, WebP), Word,
  Excel, PowerPoint (with speaker notes), CSV and text.
- **Answers with sources**: every fact carries a `[file, page]` citation; click
  it to open that page next to the chat.
- **Answer modes**: Brief, Deep dive, Compare, Risk scan, Prep me (likely board
  questions) and Draft (emails, memos, talking points).
- **Honest about gaps**: answers flag missing, outdated or contradictory data
  instead of guessing.
- **Workspaces**: one private space per topic (a board meeting, a deal, a key
  client). Search never crosses between workspaces.
- **Saved conversations**: each workspace keeps a list of conversations you can
  reopen, rename or delete, grouped by date (Today, Yesterday, Previous 7
  days, then by month) and searchable. Each shows when its last message was
  sent and how many messages it has; new ones are named after their first
  question.
- **Dated messages**: every question and answer shows its date and time, with
  a divider when the day changes.
- **File library**: search, filter by Images / PDFs / Office files, real
  thumbnails for photos and scans, a picture grid for images, and the upload
  date and time of every file.
- **Forms filled in from the chat**: say *"Fill a leave request for Rahim
  from Finance, sick leave 12–14 October"* and the matching form appears in
  the chat already filled in. Missing required fields are flagged and asked
  for; nothing is stored until you check it and press **Save**. Describe a new
  form (*"Create a visitor log form with name, company, host and purpose"*)
  and the template is drafted for you. Saved forms and templates live in the
  **Forms** tab, where they can be searched, opened, corrected and edited.
- **Upload digest**: each document gets a three-sentence summary of what it is
  and what needs attention.
- **Voice input**: the browser's dictation, with OpenAI transcription as a
  fallback.
- **Works on a phone**: responsive layout, slide-in menu, full-screen viewer;
  upload photos of documents straight from the phone.
- **Password login** with a signed session cookie.

## How it works

```
Browser ── AG-UI events (SSE) ──► Next.js app ──► OpenAI   answers, digests, reading scans,
 chat, viewer, voice               · login                  embeddings
                                   · file storage
                                   · page extraction  ──► Qdrant   hybrid search
                                   · Postgres                (meaning + keywords)
```

1. **Upload**: the app reads text locally, page by page (PDF, Word, Excel,
   PowerPoint). Scans and photos are transcribed by OpenAI's vision model.
2. **Index**: pages are split into overlapping passages; each passage is stored
   in Qdrant with an embedding (meaning) and a keyword vector, tagged with its
   workspace, file and page.
3. **Ask**: the question is matched against the workspace's passages using both
   vectors (hybrid search); the best passages and the question go to the model,
   which must cite its sources.
4. **Stream**: the answer is sent to the browser as AG-UI events; citations are
   resolved to documents so each one opens the right page.

The AI work can run in three ways, chosen with `AI_BACKEND` in `.env`:

| `AI_BACKEND` | What runs the pipeline | Needs |
|---|---|---|
| `openai` (default for real use) | The Next.js app calls OpenAI and Qdrant directly | OpenAI API key, Docker |
| `n8n` | The same pipeline as three n8n workflows you can edit visually | The above, plus n8n |
| `mock` | Keyword matching only, for trying the interface | Postgres only |

Details of every flow, API route and data format are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Part | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Chat protocol | AG-UI (`@ag-ui/client`, `@ag-ui/core`, `@ag-ui/encoder`) |
| Database | PostgreSQL 17 with Drizzle ORM |
| Search | Qdrant 1.19 (dense + BM25-style sparse vectors, RRF fusion) |
| Models | OpenAI: chat, vision, embeddings, transcription |
| File reading | pdf.js, mammoth, exceljs, jszip |
| Optional workflows | n8n 2.42 |
| Infrastructure | Docker Compose |

## Getting started

### Requirements

- Docker Desktop (or OrbStack)
- Node.js 20.9 or newer
- An OpenAI API key for real answers ([platform.openai.com/api-keys](https://platform.openai.com/api-keys))

### 1. Configure

```bash
git clone https://github.com/Shahnewaz-Ali-Mohammad/Executive-AI-Agent.git executive-agent
cd executive-agent
cp .env.example .env
```

In `.env`, set at least:

```
APP_PASSWORD=a-long-password
SESSION_SECRET=...        # openssl rand -hex 32
AI_BACKEND=openai
OPENAI_API_KEY=sk-...
```

Every setting is documented in [.env.example](.env.example). Without a `.env`
the app still starts, in mock mode with no login, for local testing only.

### 2. Start the database and search index

```bash
docker compose up -d
```

### 3. Start the web app

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3100**. The database tables are created or updated
automatically when the app starts.

## Using it

| You want to… | Do this |
|---|---|
| Keep topics apart | Create a workspace per board meeting, deal or client |
| A 30-second answer | **Brief** (default) |
| A full analysis | **Deep dive** (uses the stronger model) |
| Contradictions and gaps | **Risk scan** |
| Get ready for a meeting | **Prep me**: likely questions with suggested answers |
| Compare reports or periods | **Compare**: starts with a table |
| Write an email or memo | **Draft** |
| Check a claim | Click its citation; the page opens beside the chat |
| Start a fresh topic | **New conversation**; earlier ones stay in the list |
| Fill in a form | Describe it in the chat ("Fill an expense claim: taxi to the airport, 1,200 BDT, yesterday"), check the card, press **Save** |
| Create a form | Describe it in the chat ("Create a vendor onboarding form with …"), press **Save template** |
| Find a saved form | **Forms** tab: search, filter by form, open to correct it |

## Configuration

| Setting | Purpose | Default |
|---|---|---|
| `AI_BACKEND` | `openai`, `n8n` or `mock` | `mock` |
| `OPENAI_MODEL` | Brief, Compare, Prep me, Draft | `gpt-6.1-sol` |
| `OPENAI_MODEL_DEEP` | Deep dive and Risk scan | `gpt-6-astra` |
| `OPENAI_MODEL_FAST` | Reading scans and photos, upload digests | `gpt-6-luna` |
| `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | Search vectors (must match the Qdrant collection) | `text-embedding-3-large` / `3072` |
| `APP_PASSWORD` | Login password; empty disables login (local only) | empty |
| `MAX_UPLOAD_MB` | Largest upload | `50` |
| `QDRANT_URL` | Where the app reaches Qdrant | `http://localhost:6333` |

The assistant's rules and the instructions for each answer mode are in
`web/src/lib/ai-backend/openai/prompts.ts`; the rules for forms are in
`web/src/lib/ai-backend/openai/form-tools.ts`. Forms are filled by the
`openai` backend.

## Project structure

```
executive-agent/
├── .env.example              every setting, documented
├── docker-compose.yml        Postgres, Qdrant, n8n (+ optional web container)
├── docs/ARCHITECTURE.md      flows, API, events, database
├── infra/                    start-up scripts for n8n, Postgres and Qdrant
├── n8n/workflows/            ingest, chat and delete workflows (AI_BACKEND=n8n)
└── web/                      the Next.js app
    ├── drizzle/              database migrations
    └── src/
        ├── app/              pages and API routes
        ├── components/       chat, library (workspaces, conversations,
        │                     documents), viewer, ui
        ├── hooks/            workspaces, conversations, documents, chat, voice
        └── lib/
            ├── ai-backend/   openai, n8n and mock backends (one interface)
            ├── extract/      PDF, Word, Excel, PowerPoint readers
            ├── data/         database queries
            ├── db/           schema and connection
            └── …             AG-UI stream, citations, auth, storage, settings
```

## Testing on a phone

On the same Wi-Fi, open `http://<your computer's IP>:3100`
(`ipconfig getifaddr en0` on a Mac). From anywhere, run a tunnel such as
`cloudflared tunnel --url http://localhost:3100` or `ngrok http 3100` and open
the link it prints. Set `APP_PASSWORD` first.

## Common tasks

| Task | Command |
|---|---|
| Check the code | `cd web && npm run lint && npm run typecheck` |
| Browse the database | `cd web && npm run db:studio` |
| Search index dashboard | http://localhost:6333/dashboard |
| Run the web app in Docker too | `docker compose --profile app up -d --build` |
| Stop everything (data kept) | `docker compose down` |
| Reset everything (deletes all data) | `docker compose down -v`, then delete `web/storage` |

## Troubleshooting

- **"Can't reach the database"**: start Docker, run `docker compose up -d`,
  then restart `npm run dev`.
- **"Can't reach the search index"**: Qdrant isn't running; same fix.
- **"OpenAI error (HTTP 401)"**: `OPENAI_API_KEY` is missing or wrong.
- **"OpenAI error (HTTP 404)" naming a model**: your key can't use that model;
  change `OPENAI_MODEL*` in `.env` and restart.
- **Answers say no passages were found**: check `EMBEDDING_DIMENSIONS` matches
  the Qdrant collection, and that the document shows as ready.
- **Port 3100 is in use**: stop the other app, or change the port in
  `web/package.json`.

## Security

- All services listen on `localhost` only.
- Search is always filtered to the current workspace on the server.
- Uploaded originals are stored in `web/storage` and served only to signed-in
  users.
- Files are read on your own server; only matching passages (and the file
  itself for scans and photos) are sent to OpenAI.
- Before exposing the app beyond one machine: HTTPS, a long `APP_PASSWORD`, a
  random `SESSION_SECRET`.

## Roadmap

- **Proactive**: morning brief, pre-meeting briefs from the calendar, contract
  deadline reminders, "what changed" between versions.
- **Acting on the CEO's behalf**: follow-ups with approval, chasing late
  reports, meeting action items, single sign-on.
