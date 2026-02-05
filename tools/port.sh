#!/usr/bin/env bash
# Usage: tools/port.sh [label]
# Prints the port number for the given label (default 'app').
#
# Resolution order:
#   1. .claude/port (for 'app' label only)
#   2. .claude/ports.json (local project config)
#   3. ~/.code_projects/port_registry.json (global registry)
#
set -euo pipefail

label="${1:-app}"
PROJECT_DIR="$(pwd)"
REGISTRY_FILE="$HOME/.code_projects/port_registry.json"

# For 'app' label, check the simple port file first
if [[ "$label" == "app" && -f ".claude/port" ]]; then
  cat .claude/port
  exit 0
fi

# Try local .claude/ports.json
if [[ -f ".claude/ports.json" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    port=$(python3 - "$label" <<'PY'
import json
import sys

label = sys.argv[1] if len(sys.argv) > 1 else 'app'
try:
    with open('.claude/ports.json') as f:
        data = json.load(f)
    port = data.get(label, '')
    if port:
        print(port)
        sys.exit(0)
except:
    pass
sys.exit(1)
PY
    ) && echo "$port" && exit 0
  fi

  # Fallback: use jq if available
  if command -v jq >/dev/null 2>&1; then
    port=$(jq -r ".[\"$label\"] // empty" .claude/ports.json 2>/dev/null)
    if [[ -n "$port" ]]; then
      echo "$port"
      exit 0
    fi
  fi

  # Fallback: use sed
  port=$(sed -nE "s/.*\"$label\"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p" .claude/ports.json | head -n1)
  if [[ -n "$port" ]]; then
    echo "$port"
    exit 0
  fi
fi

# Try global registry
if [[ -f "$REGISTRY_FILE" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    port=$(python3 - "$PROJECT_DIR" "$label" <<'PY'
import json
import sys
import os

registry_file = os.path.expanduser("~/.code_projects/port_registry.json")
project_path = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else 'app'

try:
    with open(registry_file) as f:
        data = json.load(f)
    project = data.get("projects", {}).get(project_path, {})
    port = project.get("ports", {}).get(label, '')
    if port:
        print(port)
        sys.exit(0)
except:
    pass
sys.exit(1)
PY
    ) && echo "$port" && exit 0
  fi
fi

echo "Error: Port for label '$label' not found in local config or global registry" >&2
echo "Run 'update_claude_code.sh' to initialize port configuration" >&2
exit 1
