#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and attack the result.
#
# These are database guarantees - row-level security, a column guard, a sign-up
# trigger - and none of them can be checked from the application. A mocked
# client answers whatever it is asked; it has no policies to enforce and no
# triggers to fire, so a test written against one will pass whatever the schema
# says. The first run of this suite found a foreign key that aborted every
# invited sign-up, which had passed review twice.
#
#   ./supabase/tests/run.sh
#
# Needs a local postgres (16 is what this was written against) and nothing else:
# no Supabase project, no network, no secrets. Anything the migrations expect
# from Supabase - auth.uid(), the storage schema, the three roles - is stood up
# by scaffold.sql, which is the smallest thing that makes them apply.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT=${PGTESTPORT:-55432}
DIR=${PGTESTDIR:-/var/lib/postgresql/hstest}
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)
export PATH="$PATH${BIN:+:$BIN}"
DB="postgresql://postgres@127.0.0.1:$PORT/postgres"

# initdb and the server refuse to run as root, so when this is root - which it
# is in CI and in a container - they are handed to the postgres user instead.
aspg() { if [ "$(id -u)" = 0 ]; then su postgres -c "PATH=$PATH $1"; else bash -c "$1"; fi; }

if ! pg_isready -h 127.0.0.1 -p "$PORT" -q 2>/dev/null; then
  echo "· starting a throwaway postgres on $PORT"
  rm -rf "$DIR"; mkdir -p "$DIR"
  [ "$(id -u)" = 0 ] && chown postgres:postgres "$DIR"
  aspg "initdb -D $DIR/data -U postgres --auth=trust" >/dev/null
  aspg "pg_ctl -D $DIR/data -o '-p $PORT' -l $DIR/pg.log start" >/dev/null
  sleep 2
fi

echo "· resetting the schema"
psql "$DB" -q -c "drop schema if exists public cascade; create schema public;
                  drop schema if exists auth cascade; drop schema if exists storage cascade;
                  drop publication if exists supabase_realtime;" >/dev/null
psql "$DB" -q -f supabase/tests/scaffold.sql >/dev/null

echo "· applying migrations"
for f in supabase/migrations/*.sql; do
  if ! psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>/tmp/hs-mig-err; then
    echo "MIGRATION FAILED: $(basename "$f")"; grep ERROR /tmp/hs-mig-err | head -3; exit 1
  fi
done
echo "  $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') applied clean"

echo "· running the access checks"
out=$(psql "$DB" -q -f supabase/tests/access.sql 2>&1 | grep -E "^  (PASS|FAIL)|PASSED|FAILED|BROKEN")
echo "$out"
echo "$out" | grep -qE "PASSED$" || exit 1
