#!/bin/sh
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Only creates the application role; the schema is owned by server/migrations (applied by the `migrate` service).
# To re-run: docker compose down -v && docker compose up -d
set -e

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" <<'SQL'

-- App role: NOT a superuser and NOT the table owner, so RLS policies apply to it.
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';

SQL
