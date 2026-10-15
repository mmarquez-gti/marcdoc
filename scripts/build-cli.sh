#!/usr/bin/env bash
# Builds the light command line (ADR-0007) into dist/marcdoc-cli-<version>.tar.gz.
# Usage: scripts/build-cli.sh
set -euo pipefail

cd "$(dirname "$0")/.."
version="$(node -p "require('./package.json').version")"
name="marcdoc-cli-${version}"
stage="dist/${name}"

rm -rf "${stage}" "dist/${name}.tar.gz"
npx vite build --config vite.cli.config.ts --outDir "${stage}" --logLevel warn
cp -r resources "${stage}/resources"
chmod +x "${stage}/marcdoc-cli"
tar -czf "dist/${name}.tar.gz" -C dist "${name}"
echo "dist/${name}.tar.gz"
