#!/usr/bin/env bash
#
# Backup and restore drill against the local Compose stack.
#
# A restore script that has never been run is not a backup strategy — it is an assumption. This
# performs the whole loop: seed representative tenant data, dump, restore into a separate database,
# and verify the result with the same script that would be used after a real incident.
#
#   ./scripts/restore-drill.sh
#
# Never point this at production. It creates and drops a database, and `verify-restore.ts` refuses
# to run when the restore URL equals DATABASE_URL — but the first line of defence is not running it
# there in the first place.

set -euo pipefail

COMPOSE="docker compose -f deploy/local/docker-compose.yml"
PGUSER_LOCAL="${POSTGRES_USER:-bloommd}"
PGPASS_LOCAL="${POSTGRES_PASSWORD:-bloommd-local-dev}"
PGPORT_LOCAL="${POSTGRES_PORT:-55432}"
PRIMARY_DB="${POSTGRES_DB:-bloommd}"
RESTORE_DB="${PRIMARY_DB}_restore"
DUMP_FILE="$(mktemp -t bloommd-drill).dump"

cleanup() { rm -f "$DUMP_FILE"; }
trap cleanup EXIT

export DATABASE_URL="postgresql://${PGUSER_LOCAL}:${PGPASS_LOCAL}@127.0.0.1:${PGPORT_LOCAL}/${PRIMARY_DB}?sslmode=disable"
export RESTORE_DATABASE_URL="postgresql://${PGUSER_LOCAL}:${PGPASS_LOCAL}@127.0.0.1:${PGPORT_LOCAL}/${RESTORE_DB}?sslmode=disable"

echo "==> Postgres starten"
$COMPOSE up -d postgres >/dev/null
for _ in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' bloommd-local-postgres-1 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || { echo "Postgres wurde nicht healthy"; exit 1; }

echo "==> Schema anlegen"
bun run --cwd apps/app db:migrate

echo "==> Repräsentative Daten einspielen"
$COMPOSE exec -T postgres psql -q -U "$PGUSER_LOCAL" -d "$PRIMARY_DB" <<'SQL'
INSERT INTO bloom_users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'drill-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'drill-b@example.com')
ON CONFLICT DO NOTHING;
INSERT INTO bloom_workspaces (id, owner_user_id, name, slug, kind) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Drill Workspace', 'drill-workspace', 'team')
ON CONFLICT DO NOTHING;
INSERT INTO bloom_workspace_members (workspace_id, user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'editor')
ON CONFLICT DO NOTHING;
INSERT INTO bloom_documents (workspace_id, filename, markdown, created_by) VALUES
  ('33333333-3333-3333-3333-333333333333', 'drill.md', '# Drill', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;
SQL

echo "==> Dump erzeugen"
$COMPOSE exec -T postgres pg_dump -U "$PGUSER_LOCAL" -d "$PRIMARY_DB" -Fc > "$DUMP_FILE"
echo "    $(wc -c < "$DUMP_FILE" | tr -d ' ') Bytes"

echo "==> In getrennte Datenbank zurückspielen"
$COMPOSE exec -T postgres psql -q -U "$PGUSER_LOCAL" -d postgres \
  -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" \
  -c "CREATE DATABASE ${RESTORE_DB} OWNER ${PGUSER_LOCAL};" >/dev/null
$COMPOSE exec -T postgres pg_restore -U "$PGUSER_LOCAL" -d "$RESTORE_DB" --no-owner < "$DUMP_FILE"

echo "==> Wiederherstellung verifizieren"
bun run --cwd apps/app db:verify-restore

echo "==> Drill bestanden"
