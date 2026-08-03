---
name: sync-openchatcut
description: >-
  Sync Better Chat Cut main with OpenChatCut upstream safely. Fetches upstream,
  summarizes changes, merges with --no-ff --no-commit, preserves fork extensions,
  validates, commits, and pushes origin/main. Use only when the user explicitly
  invokes /sync-openchatcut or asks to sync OpenChatCut upstream.
disable-model-invocation: true
---

# sync-openchatcut

Safely merge [OpenChatCut](https://github.com/0xsline/OpenChatCut) into Better Chat Cut `main`.

## Hard constraints

- Only run when the user explicitly invokes this skill (for example `/sync-openchatcut`).
- Stay on branch `main`. Do not create other long-lived sync branches.
- Never `git push --force`.
- Never `git reset --hard` on `main`.
- Never delete Better Chat Cut extensions under `extensions/`, `packages/`, `docs/`, or `.cursor/` to "make the merge easier".
- Prefer `git merge --abort` over shipping a broken tree.

## Procedure

Copy this checklist and track progress:

```text
Sync Progress:
- [ ] 1. On branch main
- [ ] 2. Working tree clean
- [ ] 3. Remotes origin + upstream OK
- [ ] 4. Fetch upstream
- [ ] 5. Compare main vs upstream/main
- [ ] 6. Summarize commits/files
- [ ] 7. Flag high-risk areas
- [ ] 8. Local backup tag
- [ ] 9. merge --no-ff --no-commit
- [ ] 10. Resolve conflicts (preserve BCC)
- [ ] 11. Reinstall deps if needed
- [ ] 12. Validate (typecheck/test/lint/build)
- [ ] 13. Abort if unsafe failure
- [ ] 14. Commit only if valid
- [ ] 15. Message: chore: sync OpenChatCut upstream
- [ ] 16. Push origin/main
```

### 1. Branch check

```bash
git branch --show-current
```

Must be `main`. Stop otherwise.

### 2. Clean working tree

```bash
git status --porcelain
```

Must be empty. Stop if there are uncommitted changes.

### 3. Remotes

```bash
git remote -v
```

Require:

- `origin` → Better Chat Cut fork
- `upstream` → `https://github.com/0xsline/OpenChatCut.git`

If `upstream` is missing:

```bash
git remote add upstream https://github.com/0xsline/OpenChatCut.git
```

Do not rewrite `origin` based on guesses.

### 4. Fetch

```bash
git fetch upstream --prune
```

### 5–7. Inspect

Run:

```bash
bash .cursor/skills/sync-openchatcut/scripts/inspect-upstream.sh
```

Present to the user:

- Commit count / list
- Changed files / diffstat
- High-risk zones (editor, agent, MCP, persistence, resource library, Remotion, project schema, package manifest, lockfile)
- Predicted conflict signals from Git

If there is nothing to merge, stop and report that `main` already contains `upstream/main`.

### 8. Backup tag

Create a local backup tag before merging, for example:

```bash
git tag "backup/pre-upstream-sync-$(date -u +%Y%m%dT%H%M%SZ)"
```

On Windows PowerShell without GNU `date`, use an equivalent UTC timestamp.

### 9. Merge without committing

```bash
git merge --no-ff --no-commit upstream/main
```

### 10. Conflicts

Resolve conflicts carefully:

- Preserve Better Chat Cut identity/docs/extensions/skills/rules.
- Prefer upstream for pure OpenChatCut core bugfixes when fork has no intentional divergence.
- Do not drop `extensions/`, `packages/*/README.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/upstream-sync.md`, or `.cursor/skills/sync-openchatcut/`.

### 11. Dependencies

If `package.json`, `package-lock.json`, or other manifests/lockfiles changed:

```bash
npm install
```

Use the repository's existing package manager (npm + `package-lock.json`).

### 12. Validation

Run the real scripts from `package.json`:

```bash
npx tsc -b
npm test
npm run lint
npm run build
```

There is no dedicated `typecheck` script; `tsc -b` (also part of `npm run build`) is the type-check.

### 13. Abort on unsafe failure

If validation fails and cannot be fixed with a minimal, clearly justified change:

```bash
git merge --abort
```

Then stop and report the failure. Do not force the sync through.

### 14–15. Commit

Only when validation is green:

```bash
git commit -m "$(cat <<'EOF'
chore: sync OpenChatCut upstream

EOF
)"
```

On Windows PowerShell, an equivalent non-interactive commit message is fine as long as the subject is exactly:

```text
chore: sync OpenChatCut upstream
```

### 16. Push

```bash
git push origin main
```

No force push.

## Afterward

Report:

- Backup tag name
- Upstream commits merged
- Conflict files (if any) and resolution summary
- Validation results
- New `main` commit hash
- Push status
