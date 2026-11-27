#!/usr/bin/env bash
# Copy the app's database from the old Supabase project into a brand-new,
# empty one: every table, function and security policy in `public`, their
# rows, and the login accounts (auth.users + auth.identities, so passwords
# keep working). Uses plain pg_dump/psql, so Docker is not needed.
#
# Run on your own computer. You will be asked for both Session pooler
# connection strings; they are read without echo and never written to disk.
# The old project is only read, never changed. The new project is written in
# one transaction: either everything lands or nothing does.
#
# Needs pg_dump + psql (macOS: brew install libpq, then
#   export PATH="$(brew --prefix libpq)/bin:$PATH")
set -euo pipefail

for tool in pg_dump psql; do
  command -v "$tool" >/dev/null || { echo "Install $tool first (brew install libpq)"; exit 1; }
done

echo "Paste the OLD (Seoul) database connection string (Session pooler URI):"
read -rs OLD_DB_URL; echo
echo "Paste the NEW (Singapore) database connection string (Session pooler URI):"
read -rs NEW_DB_URL; echo
[ "$OLD_DB_URL" != "$NEW_DB_URL" ] || { echo "The two strings are the same; stopping."; exit 1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

TABLES="suppliers expense_categories sizes lots buy_lines sell_lines adjustments expenses monthly_expenses calc_sheets accounting_api_requests"
count_rows() {
  local q="" t
  for t in $TABLES; do q="$q select '$t' as t, count(*) from public.$t union all"; done
  q="$q select 'auth.users', count(*) from auth.users union all select 'auth.identities', count(*) from auth.identities order by 1"
  psql "$1" -X -At -F ' ' -v ON_ERROR_STOP=1 -c "$q"
}

echo "1/4 Checking the new project is empty..."
existing=$(psql "$NEW_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema='public'")
[ "$existing" = "0" ] || { echo "The new project already has $existing tables in public. Use an empty project."; exit 1; }
new_users=$(psql "$NEW_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from auth.users")
[ "$new_users" = "0" ] || { echo "The new project already has $new_users login(s). Use an empty project."; exit 1; }

echo "2/4 Reading the old project..."
# Tables, functions, policies and grants in public. Ownership is left out (the
# new project's postgres user owns everything). Supabase already creates the
# public schema and its default privileges, so those lines are dropped.
pg_dump "$OLD_DB_URL" --schema-only --schema=public --no-owner \
  | grep -v -E '^(CREATE SCHEMA public;|COMMENT ON SCHEMA public |ALTER DEFAULT PRIVILEGES )' > schema.sql
pg_dump "$OLD_DB_URL" --data-only --schema=public > public-data.sql
pg_dump "$OLD_DB_URL" --data-only --table=auth.users --table=auth.identities > auth-data.sql
count_rows "$OLD_DB_URL" > before.txt

echo "3/4 Writing into the new project (all or nothing)..."
psql "$NEW_DB_URL" -X --single-transaction -v ON_ERROR_STOP=1 -q \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file auth-data.sql --file public-data.sql >/dev/null

echo "4/4 Comparing row counts..."
count_rows "$NEW_DB_URL" > after.txt
if diff before.txt after.txt >/dev/null; then
  echo "OK: every table has the same number of rows in both projects:"
  cat after.txt
else
  echo "MISMATCH (old vs new):"; diff before.txt after.txt || true; exit 1
fi
