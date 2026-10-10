#!/bin/sh
# -----------------------------------------------------------------------------
# Creates the Qdrant collection used for document search (safe to run again).
#
# Each chunk of a document is stored with two vectors:
#   "dense" – an OpenAI embedding: finds passages with the same MEANING
#   "bm25"  – sparse keyword weights: finds EXACT terms (names, codes, numbers)
# The n8n chat workflow searches both and merges the results ("hybrid search").
#
# Payload indexes on workspace_id / document_id keep filtered searches fast:
# every search is restricted to one workspace.
#
# Usage:  QDRANT_URL=http://localhost:6333 ./infra/qdrant/setup.sh
# (Docker Compose runs this automatically via the "qdrant-init" service.)
# -----------------------------------------------------------------------------
set -eu

QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION="${QDRANT_COLLECTION:-executive_docs}"
DIMENSIONS="${EMBEDDING_DIMENSIONS:-3072}"
API_KEY_HEADER="api-key: ${QDRANT_API_KEY:-}"

echo "Waiting for Qdrant at ${QDRANT_URL} ..."
i=0
until curl -sf -H "${API_KEY_HEADER}" "${QDRANT_URL}/collections" > /dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then echo "Qdrant did not start in time." >&2; exit 1; fi
  sleep 2
done

if curl -sf -H "${API_KEY_HEADER}" "${QDRANT_URL}/collections/${COLLECTION}" > /dev/null; then
  echo "Collection '${COLLECTION}' already exists. Nothing to do."
  exit 0
fi

echo "Creating collection '${COLLECTION}' (dense size ${DIMENSIONS} + bm25 sparse) ..."
curl -sf -X PUT -H "${API_KEY_HEADER}" -H "Content-Type: application/json" \
  "${QDRANT_URL}/collections/${COLLECTION}" \
  -d "{
    \"vectors\": { \"dense\": { \"size\": ${DIMENSIONS}, \"distance\": \"Cosine\" } },
    \"sparse_vectors\": { \"bm25\": { \"modifier\": \"idf\" } }
  }"
echo

for field in workspace_id document_id; do
  echo "Indexing payload field '${field}' ..."
  curl -sf -X PUT -H "${API_KEY_HEADER}" -H "Content-Type: application/json" \
    "${QDRANT_URL}/collections/${COLLECTION}/index?wait=true" \
    -d "{ \"field_name\": \"${field}\", \"field_schema\": \"keyword\" }"
  echo
done

echo "Done."
