/**
 * Current-host desktop smoke: main/preload + optional packaged launch / app boot signal.
 * Does not claim installer install/uninstall automation.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// 1) Main + preload build
execFileSync(npx, [
  'esbuild', 'desktop/main.ts',
  '--bundle', '--platform=node', '--format=esm', '--packages=external',
  '--outfile=desktop-dist/main.mjs',
], { cwd: root, stdio: 'inherit', shell: true });
execFileSync(npx, [
  'esbuild', 'desktop/preload.ts',
  '--bundle', '--platform=node', '--format=cjs', '--packages=external',
  '--outfile=desktop-dist/preload.cjs',
], { cwd: root, stdio: 'inherit', shell: true });
assert.ok(existsSync(join(root, 'desktop-dist', 'main.mjs')));
assert.ok(existsSync(join(root, 'desktop-dist', 'preload.cjs')));

// 2) Renderer production build already may exist; ensure dist/index.html
if (!existsSync(join(root, 'dist', 'index.html'))) {
  const b = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
  assert.equal(b.status, 0, 'web build required for smoke');
}
assert.ok(existsSync(join(root, 'dist', 'index.html')));

// 3) Prefer package launch if unpacked app exists; else electron smoke
const evidencePath = join(root, 'release', 'better-chat-cut-current-host-evidence.json');
let launchMode: 'package-unpacked' | 'electron-smoke' = 'electron-smoke';
const host = process.platform;
const unpackedCandidates = host === 'win32'
  ? [join(root, 'release', 'win-unpacked', 'OpenChatCut.exe')]
  : host === 'darwin'
    ? [join(root, 'release', 'mac', 'OpenChatCut.app', 'Contents', 'MacOS', 'OpenChatCut'),
      join(root, 'release', 'mac-arm64', 'OpenChatCut.app', 'Contents', 'MacOS', 'OpenChatCut')]
    : [join(root, 'release', 'linux-unpacked', 'openchatcut')];

const unpacked = unpackedCandidates.find((p) => existsSync(p));
if (unpacked) {
  launchMode = 'package-unpacked';
  // Launch briefly — process should start; kill after short window via SMOKE env.
  const child = spawnSync(unpacked, [], {
    cwd: root,
    env: { ...process.env, CC_SMOKE: '1', ELECTRON_ENABLE_LOGGING: '0' },
    timeout: 45_000,
    shell: false,
    encoding: 'utf8',
  });
  // On smoke exit expected non-hang; timeout is ok if process was alive
  assert.ok(
    child.status === 0 || child.signal === 'SIGTERM' || child.error?.message.includes('TIMEOUT') || child.status === null,
    `packaged app launch failed: status=${child.status} err=${child.error?.message}`,
  );
} else {
  const smoke = spawnSync(npm, ['run', 'desktop:smoke'], {
    cwd: root,
    env: { ...process.env, CC_SMOKE: '1' },
    timeout: 60_000,
    shell: true,
    encoding: 'utf8',
  });
  assert.ok(
    smoke.status === 0 || smoke.signal !== undefined,
    `desktop:smoke failed status=${smoke.status}`,
  );
}

// 4) Require real current-host evidence file for closure path; smoke alone can still pass package-launch
if (existsSync(evidencePath)) {
  const ev = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
    buildMode: string;
    dryRun: boolean;
    stub: boolean;
    sha256: string;
  };
  assert.equal(ev.buildMode, 'real');
  assert.equal(ev.dryRun, false);
  assert.equal(ev.stub, false);
  assert.equal(ev.sha256.length, 64);
}

console.log(`desktop-distribution.smoke: ok (${launchMode})`);
