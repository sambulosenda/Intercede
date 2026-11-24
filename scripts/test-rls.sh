#!/usr/bin/env bash
# Runs the migration and privacy tests against a throwaway local Postgres database.
# Usage: npm run test:rls   (needs psql; set PGURL to point at a server, default local)
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:-postgresql:///}"
DB="intercede_rls_test_$$"
psql "${PGURL}postgres" -qc "create database $DB" >/dev/null
trap 'psql "${PGURL}postgres" -qc "drop database if exists $DB" >/dev/null' EXIT
psql "${PGURL}$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do psql "${PGURL}$DB" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "${PGURL}$DB" -v ON_ERROR_STOP=1 -q -t -f supabase/tests/rls_test.sql 2>&1 | grep -E "ok |FAIL|ERROR|PASSED" | sed "s/^psql:[^ ]* NOTICE:  //"
