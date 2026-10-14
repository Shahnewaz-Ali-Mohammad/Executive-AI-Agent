#!/bin/sh
# -----------------------------------------------------------------------------
# n8n start-up script (used by docker-compose.yml).
#
# On EVERY start it (re)creates the credentials from .env, so a key added or
# changed in .env is picked up by `docker compose up -d`:
#   - OpenAI  (OPENAI_API_KEY)             used by the chat workflow's model node
#   - SMTP    (SMTP_HOST, SMTP_USER, ...)  used by the scheduler to send emails
#     (always created so the workflow loads; emails are only sent when SMTP_HOST is set)
#
# Workflows: each file in /workflows (the repo's n8n/workflows folder) is
# imported and published the first time this n8n sees it. A workflow that
# was imported before is left alone, so changes made in the n8n editor are
# kept, while workflows added to the repo later are still picked up.
# To re-import one from the repo (overwrites editor changes), delete its marker:
#   docker compose exec n8n rm /home/node/.n8n/.executive-agent/<workflow id>
#   docker compose restart n8n
# (ids: ExecAgentIngest1, ExecAgentChat001, ExecAgentDelete1, ExecAgentSchedul)
# -----------------------------------------------------------------------------
set -eu

STATE=/home/node/.n8n/.executive-agent
mkdir -p "$STATE"

# Installs from before per-workflow markers imported the first three together.
if [ -f /home/node/.n8n/.executive-agent-imported ]; then
  touch "$STATE/ExecAgentIngest1" "$STATE/ExecAgentChat001" "$STATE/ExecAgentDelete1"
  rm -f /home/node/.n8n/.executive-agent-imported
fi

# --- Credentials (every start) -----------------------------------------------------
# Written from the environment and deleted right after import.
CREDS=/tmp/executive-agent-credentials.json
node -e '
  const env = process.env;
  const port = Number(env.SMTP_PORT || 587);
  const creds = [
    {
      id: "ExecAgentOpenAi1",
      name: "OpenAI (Executive Agent)",
      type: "openAiApi",
      data: { apiKey: env.OPENAI_API_KEY || "", url: env.OPENAI_BASE_URL || "https://api.openai.com/v1" },
    },
    {
      id: "ExecAgentSmtp001",
      name: "SMTP (Executive Agent)",
      type: "smtp",
      data: {
        host: env.SMTP_HOST || "smtp.invalid",
        port,
        user: env.SMTP_USER || "",
        password: env.SMTP_PASS || "",
        // Port 465 uses TLS from the start; 587/25 upgrade with STARTTLS.
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
        disableStartTls: false,
      },
    },
  ];
  require("fs").writeFileSync(process.argv[1], JSON.stringify(creds));
' "$CREDS"
n8n import:credentials --input="$CREDS"
rm -f "$CREDS"

# --- Workflows (each one the first time it's seen) ----------------------------------
for file in /workflows/*.json; do
  id=$(node -e 'process.stdout.write(String(require(process.argv[1]).id || ""))' "$file")
  [ -n "$id" ] || continue
  if [ ! -f "$STATE/$id" ]; then
    echo "[executive-agent] Importing workflow $id ($(basename "$file")) ..."
    n8n import:workflow --input="$file"
    n8n publish:workflow --id="$id"
    touch "$STATE/$id"
  fi
done

exec n8n start
