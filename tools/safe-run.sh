#!/usr/bin/env bash
# safe-run.sh — Run commands with timeout or in background
# Usage:
#   tools/safe-run.sh [OPTIONS] COMMAND [ARGS...]
#
# Options:
#   -t SECONDS    Timeout in seconds (default: 300)
#   -b NAME       Run in background with given name (logs to .claude/logs/NAME.log)
#   -k NAME       Kill a background process by name
#   -s NAME       Show status of a background process
#   -l NAME       Show logs of a background process (last 50 lines)
#
# Examples:
#   tools/safe-run.sh -t 60 npm test           # Run with 60s timeout
#   tools/safe-run.sh -b dev npm run dev       # Run dev server in background
#   tools/safe-run.sh -k dev                   # Kill the dev server
#   tools/safe-run.sh -s dev                   # Check if dev is running
#   tools/safe-run.sh -l dev                   # Show dev server logs
set -euo pipefail

TIMEOUT=300
BACKGROUND=""
KILL_NAME=""
STATUS_NAME=""
LOGS_NAME=""

LOG_DIR=".claude/logs"
PID_DIR=".claude/pids"

print_usage() {
  cat <<'USAGE'
Usage: safe-run.sh [OPTIONS] COMMAND [ARGS...]

Options:
  -t SECONDS    Timeout in seconds (default: 300)
  -b NAME       Run in background with given name
  -k NAME       Kill a background process by name
  -s NAME       Show status of a background process
  -l NAME       Show logs of a background process (last 50 lines)
  -h            Show this help message

Examples:
  safe-run.sh -t 60 npm test        # Run with 60s timeout
  safe-run.sh -b dev npm run dev    # Run in background
  safe-run.sh -k dev                # Kill background process
USAGE
}

# Parse options
while getopts "t:b:k:s:l:h" opt; do
  case $opt in
    t) TIMEOUT="$OPTARG" ;;
    b) BACKGROUND="$OPTARG" ;;
    k) KILL_NAME="$OPTARG" ;;
    s) STATUS_NAME="$OPTARG" ;;
    l) LOGS_NAME="$OPTARG" ;;
    h) print_usage; exit 0 ;;
    *) print_usage; exit 2 ;;
  esac
done
shift $((OPTIND-1))

# Create directories
mkdir -p "$LOG_DIR" "$PID_DIR"

# Handle kill request
if [[ -n "$KILL_NAME" ]]; then
  PID_FILE="$PID_DIR/$KILL_NAME.pid"
  if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Killing process $KILL_NAME (PID: $PID)..."
      kill "$PID" 2>/dev/null || true
      sleep 1
      # Force kill if still running
      if kill -0 "$PID" 2>/dev/null; then
        echo "Process still running, sending SIGKILL..."
        kill -9 "$PID" 2>/dev/null || true
      fi
      rm -f "$PID_FILE"
      echo "Done."
    else
      echo "Process $KILL_NAME is not running (stale PID file)."
      rm -f "$PID_FILE"
    fi
  else
    echo "No PID file found for: $KILL_NAME"
    exit 1
  fi
  exit 0
fi

# Handle status request
if [[ -n "$STATUS_NAME" ]]; then
  PID_FILE="$PID_DIR/$STATUS_NAME.pid"
  if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Process $STATUS_NAME is RUNNING (PID: $PID)"
      # Show some process info
      ps -p "$PID" -o pid,ppid,stat,time,command 2>/dev/null || true
    else
      echo "Process $STATUS_NAME is NOT RUNNING (stale PID file)"
      rm -f "$PID_FILE"
    fi
  else
    echo "Process $STATUS_NAME: No PID file found (not started or already stopped)"
  fi
  exit 0
fi

# Handle logs request
if [[ -n "$LOGS_NAME" ]]; then
  LOG_FILE="$LOG_DIR/$LOGS_NAME.log"
  if [[ -f "$LOG_FILE" ]]; then
    echo "=== Last 50 lines of $LOG_FILE ==="
    tail -n 50 "$LOG_FILE"
  else
    echo "No log file found: $LOG_FILE"
    exit 1
  fi
  exit 0
fi

# Require a command for run operations
if [[ $# -eq 0 ]]; then
  echo "Error: No command specified"
  print_usage
  exit 2
fi

# Find timeout binary
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
fi

# Run in background mode
if [[ -n "$BACKGROUND" ]]; then
  LOG_FILE="$LOG_DIR/$BACKGROUND.log"
  PID_FILE="$PID_DIR/$BACKGROUND.pid"

  # Check if already running
  if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "Warning: Process $BACKGROUND is already running (PID: $OLD_PID)"
      echo "Use 'safe-run.sh -k $BACKGROUND' to stop it first."
      exit 1
    fi
    rm -f "$PID_FILE"
  fi

  echo "Starting $BACKGROUND in background..."
  echo "Log file: $LOG_FILE"

  # Add timestamp header to log
  {
    echo ""
    echo "=========================================="
    echo "Started at: $(date)"
    echo "Command: $*"
    echo "=========================================="
    echo ""
  } >> "$LOG_FILE"

  # Start in background with nohup
  nohup "$@" >> "$LOG_FILE" 2>&1 &
  PID=$!
  echo "$PID" > "$PID_FILE"

  echo "Started with PID: $PID"
  echo "Use 'safe-run.sh -s $BACKGROUND' to check status"
  echo "Use 'safe-run.sh -l $BACKGROUND' to view logs"
  echo "Use 'safe-run.sh -k $BACKGROUND' to stop"
  exit 0
fi

# Run with timeout
if [[ -n "$TIMEOUT_BIN" ]]; then
  exec "$TIMEOUT_BIN" "${TIMEOUT}s" "$@"
else
  # Fallback: manual timeout using background process
  "$@" &
  CMD_PID=$!

  (
    sleep "$TIMEOUT"
    if kill -0 "$CMD_PID" 2>/dev/null; then
      echo "Timeout after ${TIMEOUT}s, killing process..." >&2
      kill "$CMD_PID" 2>/dev/null || true
      sleep 2
      kill -9 "$CMD_PID" 2>/dev/null || true
    fi
  ) &
  WATCHDOG_PID=$!

  # Wait for command and capture exit status
  wait "$CMD_PID" 2>/dev/null
  EXIT_STATUS=$?

  # Clean up watchdog
  kill "$WATCHDOG_PID" 2>/dev/null || true

  exit "$EXIT_STATUS"
fi
