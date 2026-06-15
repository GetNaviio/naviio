#!/usr/bin/env bash
#
# One command to start Naviio cleanly. Run it with:  npm run go
# (or:  bash scripts/dev.sh)
#
# It does everything that's been manual:
#   1. kills any stale dev server holding port 3000
#   2. pushes the Prisma schema to Neon + regenerates the client
#   3. starts the dev server in the background (logs -> dev.log)
#   4. confirms it's serving
#
# You can keep using the same terminal afterwards. Stop the server with: npm run stop
# (or:  lsof -ti:3000 | xargs kill)

set -e
cd "$(dirname "$0")/.."

echo "→ [1/4] Freeing port 3000 (killing any stale dev server)…"
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1

echo "→ [2/4] Syncing schema to Neon + regenerating Prisma client…"
npx prisma db push
npx prisma generate

echo "→ [3/4] Starting dev server in the background (logs → dev.log)…"
npm run dev > dev.log 2>&1 &
sleep 6

echo "→ [4/4] Checking the server…"
CODE=$(curl -s -o /dev/null -w "%{http_code}" localhost:3000 || echo "000")
# 200 = landing; 3xx = root redirect into the app (expected on localhost)
if [ "$CODE" = "200" ] || [ "$CODE" = "302" ] || [ "$CODE" = "307" ] || [ "$CODE" = "308" ]; then
  echo ""
  echo "✅ Naviio is up:  http://localhost:3000"
  echo "   (live logs:  tail -f dev.log   |   stop:  npm run stop)"
else
  echo ""
  echo "⚠️  Server returned HTTP $CODE. Check dev.log for the error:"
  echo "    tail -n 40 dev.log"
fi
