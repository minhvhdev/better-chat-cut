# Upstream sync (OpenChatCut)

Better Chat Cut tracks [OpenChatCut](https://github.com/0xsline/OpenChatCut) on a single long-lived branch: `main`.

## Remotes

```text
origin    https://github.com/minhvhdev/better-chat-cut.git
upstream  https://github.com/0xsline/OpenChatCut.git
```

## How to sync

1. Ensure you are on `main` with a clean working tree.
2. Invoke the Cursor skill:

```text
/sync-openchatcut
```

3. The skill fetches `upstream`, summarizes incoming commits/files, creates a local backup tag, merges with `--no-ff --no-commit`, resolves conflicts without deleting Better Chat Cut extensions, reinstalls dependencies if manifests changed, runs validation, then commits and pushes to `origin/main`.

## Manual inspection

From the repository root (Git Bash / WSL / compatible shell):

```bash
bash .cursor/skills/sync-openchatcut/scripts/inspect-upstream.sh
```

## Hard rules

- Do not create long-lived branches such as `creator-main`, `upstream-main`, `science-main`, or `develop` for this workflow.
- Do not use `git reset --hard` on `main`.
- Do not `git push --force`.
- If validation fails and cannot be fixed safely, abort the merge (`git merge --abort`) and stop.
- Prefer fixing conflicts by preserving `extensions/`, `packages/`, `docs/`, and `.cursor/` Better Chat Cut content.

## High-risk conflict zones

Treat conflicts in these areas carefully:

- `src/editor/`, `src/components/`
- `src/agent/`, `server/external-agent/`
- `src/persist/` and project schema / migrations
- `src/library/`, `src/plugins/`
- `remotion/`
- `package.json`, lockfiles
