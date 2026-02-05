#!/bin/bash
# Restart Chrome with remote debugging for Gemini automation

# Kill existing Chrome instances
pkill -f "Google Chrome" 2>/dev/null
sleep 2

# Start Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug \
  --no-first-run \
  "https://gemini.google.com/app" &

echo "Chrome started with remote debugging on port 9222"
echo "Opening gemini.google.com..."
