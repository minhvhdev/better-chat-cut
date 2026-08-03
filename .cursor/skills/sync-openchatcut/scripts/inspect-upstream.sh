#!/usr/bin/env bash
# Inspect OpenChatCut upstream changes relative to local main.
# Usage: bash .cursor/skills/sync-openchatcut/scripts/inspect-upstream.sh
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT}" ]]; then
  echo "error: not inside a git repository" >&2
  exit 1
fi
cd "${ROOT}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: invalid git repository" >&2
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "error: remote 'upstream' is missing. Add it first:" >&2
  echo "  git remote add upstream https://github.com/0xsline/OpenChatCut.git" >&2
  exit 1
fi

if ! git rev-parse --verify upstream/main >/dev/null 2>&1; then
  echo "error: upstream/main not found. Fetch upstream before inspecting:" >&2
  echo "  git fetch upstream --prune" >&2
  exit 1
fi

if ! git rev-parse --verify main >/dev/null 2>&1; then
  echo "error: local branch 'main' not found" >&2
  exit 1
fi

RANGE="main..upstream/main"
COMMIT_COUNT="$(git rev-list --count "${RANGE}" 2>/dev/null || echo 0)"

echo "=== Upstream inspection ==="
echo "repository: ${ROOT}"
echo "range:      ${RANGE}"
echo "new commits: ${COMMIT_COUNT}"
echo

if [[ "${COMMIT_COUNT}" -eq 0 ]]; then
  echo "No new commits on upstream/main relative to main."
  exit 0
fi

echo "=== New commits ==="
git log --oneline "${RANGE}"
echo

echo "=== Changed files ==="
git diff --name-only "main...upstream/main"
echo

echo "=== Diffstat ==="
git diff --stat "main...upstream/main"
echo

echo "=== High-risk area markers ==="
CHANGED_FILES="$(git diff --name-only "main...upstream/main")"
mark_area() {
  local label="$1"
  local pattern="$2"
  local hits
  hits="$(printf '%s\n' "${CHANGED_FILES}" | grep -E "${pattern}" || true)"
  if [[ -n "${hits}" ]]; then
    echo "[RISK] ${label}"
    printf '%s\n' "${hits}" | sed 's/^/  - /'
  else
    echo "[ok]   ${label} (no matching paths)"
  fi
}

mark_area "editor" '(^src/editor/|^src/components/timeline/|^src/components/PreviewPanel|^src/Editor\.tsx)'
mark_area "agent" '(^src/agent/)'
mark_area "MCP" '(^server/external-agent/|\.mcp\.json$|/mcp\.|mcp\.ts|mcp\.verify)'
mark_area "persistence" '(^src/persist/)'
mark_area "resource library" '(^src/library/|^src/plugins/|extension-store)'
mark_area "Remotion" '(^remotion/)'
mark_area "project schema" '(migrations|projectStore|ProjectDoc)'
mark_area "package manifest" '(^package\.json$|electron-builder\.config\.mjs$)'
mark_area "lockfile" '(package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$|bun\.lockb$)'
echo

TMP_ERR="$(mktemp)"
TMP_LEGACY="$(mktemp)"
cleanup() {
  rm -f "${TMP_ERR}" "${TMP_LEGACY}"
}
trap cleanup EXIT

echo "=== Conflict prediction (git merge-tree) ==="
MERGE_BASE="$(git merge-base main upstream/main)"
if git merge-tree --write-tree main upstream/main >/dev/null 2>"${TMP_ERR}"; then
  echo "merge-tree: clean (no textual conflicts predicted)"
else
  echo "merge-tree: conflicts or errors predicted"
  if [[ -s "${TMP_ERR}" ]]; then
    cat "${TMP_ERR}"
  fi
  if git merge-tree "${MERGE_BASE}" main upstream/main 2>/dev/null | grep -E '^(CHANGED in|CONFLICT)' >"${TMP_LEGACY}"; then
    cat "${TMP_LEGACY}"
  fi
fi

echo
echo "=== Done ==="
