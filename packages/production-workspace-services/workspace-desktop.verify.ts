/**
 * Desktop smoke hook for M7A workspace.
 * Validates desktop scripts exist and desktop main builds without claiming a full packaged installer.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

assert.ok(pkg.scripts['desktop:build:main'], 'desktop:build:main script required');
assert.ok(pkg.scripts['desktop:smoke'], 'desktop:smoke script required');
assert.ok(existsSync(join(root, 'desktop/main.ts')));
assert.ok(existsSync(join(root, 'desktop/preload.ts')));
assert.ok(existsSync(join(root, 'server/plugins/better-chat-cut-workspace.ts')), 'workspace plugin required for embedded server');

// Typecheck/build main entry (same as npm run desktop:build:main) — no full Electron launch required for CI-light gate
const built = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'desktop:build:main'],
  { cwd: root, encoding: 'utf8', shell: true },
);
assert.equal(built.status, 0, built.stderr || built.stdout);
assert.ok(existsSync(join(root, 'desktop-dist/main.mjs')));
assert.ok(existsSync(join(root, 'desktop-dist/preload.cjs')));

// Workspace route is part of hash-navigation model (no second React root)
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
assert.ok(app.includes('production-workspace'));
assert.ok(app.includes('ProductionWorkspace'));

console.log('workspace desktop verification passed (desktop:build:main + shell wiring)');
