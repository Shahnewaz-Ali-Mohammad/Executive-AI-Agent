#!/bin/sh
# -----------------------------------------------------------------------------
# n8n start-up script (used by docker-compose.yml).
#
# On EVERY start it:
#   - (re)creates the OpenAI credential from OPENAI_API_KEY in .env, so a key
#     added or changed in .env is picked up by `docker compose up -d`.
#     (Only the "OpenAI model" node needs it; other steps read .env directly.)
#
# On the FIRST start only it also:
#   - imports the three workflows from /workflows (the repo's n8n/workflows folder)
#   - publishes (activates) them, so their webhooks are live
# Then it starts n8n normally.
#
# Later starts skip the workflow import so changes you make in the n8n editor are kept.
# To re-import the workflows from the repo (overwrites editor changes):
#   docker compose exec n8n rm /home/node/.n8n/.executive-agent-imported
#   docker compose restart n8n
# -----------------------------------------------------------------------------
set -eu

MARKER=/home/node/.n8n/.executive-agent-imported
WORKFLOW_IDS="ExecAgentIngest1 ExecAgentChat001 ExecAgentDelete1"

# --- OpenAI credential (every start) --------------------------------------------
# Written from the environment and deleted right after import.
CREDS=/tmp/executive-agent-credentials.json
node -e '
  const creds = [{
    id: "ExecAgentOpenAi1",
    name: "OpenAI (Executive Agent)",
    type: "openAiApi",
    data: {
      apiKey: process.env.OPENAI_API_KEY || "",
      url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
  }];
  require("fs").writeFileSync(process.argv[1], JSON.stringify(creds));
' "$CREDS"
n8n import:credentials --input="$CREDS"
rm -f "$CREDS"

# --- Workflows (first start only) -------------------------------------------------
if [ ! -f "$MARKER" ]; then
  echo "[executive-agent] First start: importing workflows ..."
  n8n import:workflow --separate --input=/workflows
  for id in $WORKFLOW_IDS; do
    n8n publish:workflow --id="$id"
  done

  touch "$MARKER"
  echo "[executive-agent] Import done."
fi

exec n8n start
