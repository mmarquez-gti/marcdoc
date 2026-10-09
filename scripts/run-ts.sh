#!/usr/bin/env bash
# Runs a TypeScript script with Node by bundling it with esbuild (shipped with Vite).
# Usage: scripts/run-ts.sh <script.ts> [args...]
set -euo pipefail
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$1"
shift
bundle="$(mktemp --suffix=.cjs)"
trap 'rm -f "$bundle"' EXIT
"$ROOT_DIR/node_modules/.bin/esbuild" "$script" --bundle --platform=node --format=cjs \
  --packages=external --log-level=warning --outfile="$bundle"
NODE_PATH="$ROOT_DIR/node_modules" node "$bundle" "$@"
