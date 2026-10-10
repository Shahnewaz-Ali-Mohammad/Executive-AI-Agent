#!/bin/sh
# Runs once, when the Postgres volume is first created.
# The web app uses the database named in POSTGRES_DB; n8n gets its own "n8n" database.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE n8n OWNER "$POSTGRES_USER";
SQL
