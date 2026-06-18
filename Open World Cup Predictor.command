#!/bin/zsh
cd "$(dirname "$0")"

PORT=8765
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "Starting World Cup Predictor at http://127.0.0.1:$PORT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/world-cup-predictor.log 2>&1 &
SERVER_PID=$!

open "http://127.0.0.1:$PORT/index.html"
echo "The app is running. Close this window to stop it."
wait "$SERVER_PID"
