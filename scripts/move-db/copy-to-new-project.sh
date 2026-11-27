#!/usr/bin/env bash
# Copy the whole Supabase database (tables, functions, policies, logins and
# API receipts) from the old project into a brand-new, empty project.
# Follows Supabase's "migrate within Supabase" guide: roles, schema, then data.
#
# Run on your own computer. You will be asked for both connection strings;
# they are read without echo and are never written to disk or shell history.
# The old project is only read, never changed.
#
# Needs: supabase CLI and psql (macOS: brew install supabase/tap/supabase libpq
#        then: export PATH="$(brew --prefix libpq)/bin:$PATH")
set -euo pipefail

command -v supabase >/dev/null || { echo "Install the Supabase CLI first"; exit 1; }
command -v psql >/dev/null || { echo "Install psql (libpq) first"; exit 1; }

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
  q="$q select 'auth.users', count(*) from auth.users order by 1"
  psql "$1" -At -F ' ' -c "$q"
}

echo "1/4 Checking the new project is empty..."
existing=$(psql "$NEW_DB_URL" -At -c "select count(*) from information_schema.tables where table_schema='public'")
[ "$existing" = "0" ] || { echo "The new project already has $existing tables in public. Use an empty project."; exit 1; }

echo "2/4 Reading the old project..."
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only
count_rows "$OLD_DB_URL" > before.txt

echo "3/4 Writing into the new project (all or nothing)..."
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --dbname "$NEW_DB_URL" >/dev/null

echo "4/4 Comparing row counts..."
count_rows "$NEW_DB_URL" > after.txt
if diff before.txt after.txt >/dev/null; then
  echo "OK: every table has the same number of rows in both projects:"
  cat after.txt
else
  echo "MISMATCH (old vs new):"; diff before.txt after.txt || true; exit 1
fi
