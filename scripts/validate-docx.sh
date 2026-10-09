#!/usr/bin/env bash
# Validates .docx files with the Open XML SDK running in Docker.
# Usage: scripts/validate-docx.sh [--json] [--version Microsoft365] <file.docx>...
set -euo pipefail

readonly IMAGE="marcdoc/ooxml-validator:1"
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Docker Desktop exposes its own context; use it when the default daemon socket is absent.
if [[ -z "${DOCKER_CONTEXT:-}" && ! -S /var/run/docker.sock ]] && docker context inspect desktop-linux >/dev/null 2>&1; then
  export DOCKER_CONTEXT=desktop-linux
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build -q -t "$IMAGE" "$ROOT_DIR/tools/ooxml-validator" >/dev/null
fi

options=()
files=()
while (($# > 0)); do
  case "$1" in
    --json) options+=("$1") ;;
    --version) options+=("$1" "$2"); shift ;;
    *) files+=("$(realpath "$1")") ;;
  esac
  shift
done

if ((${#files[@]} == 0)); then
  echo "Usage: $0 [--json] [--version Microsoft365] <file.docx>..." >&2
  exit 2
fi

# Stream the files into the container as a tar archive instead of bind-mounting them:
# Docker Desktop only shares selected host paths, and this keeps the container read-only to the host.
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
container_files=()
for index in "${!files[@]}"; do
  name="${index}-$(basename "${files[$index]}")"
  cp "${files[$index]}" "$staging/$name"
  container_files+=("/tmp/in/$name")
done

tar -C "$staging" -cf - . |
  docker run -i --rm --network none --entrypoint sh "$IMAGE" -c \
    'mkdir -p /tmp/in && tar -xf - -C /tmp/in && exec dotnet /app/OoxmlValidator.dll "$@"' \
    sh "${options[@]}" "${container_files[@]}"
