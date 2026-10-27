#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  HOARD — container entrypoint
#
#  Runs once per container start. It pushes the Prisma schema to the database
#  (idempotent — only applies missing changes) and then hands off to the Next.js
#  production server. `--skip-generate` because the client was already generated
#  during the image build.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[hoard] Running boot-time SQL (prisma/sql)..."
for f in prisma/sql/*.sql; do
  [ -e "$f" ] || continue # no files match: the glob stays literal
  echo "[hoard]   $f"
  npx prisma db execute --file "$f" --schema prisma/schema.prisma
done

echo "[hoard] Syncing database schema (prisma db push)..."
npx prisma db push --skip-generate

echo "[hoard] Starting Next.js server..."
exec npm run start
