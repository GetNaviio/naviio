#!/bin/bash
# Double-click this file in Finder to start Naviio and open it in your browser.
# No terminal typing needed.

# Move into this script's own folder (the project), so it always runs from the
# right place — fixes the "/Users/eric/package.json not found" error.
cd "$(dirname "$0")" || exit 1

echo "Starting Naviio from: $(pwd)"

# Free port 3000 if an old dev server is still running.
lsof -ti:3000 | xargs kill 2>/dev/null || true

# Open the browser a few seconds after the server starts booting.
( sleep 5 && open "http://localhost:3000" ) &

# Start the dev server (Ctrl-C in this window stops it).
npm run dev
