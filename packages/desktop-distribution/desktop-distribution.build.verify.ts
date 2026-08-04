import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { probeRepoDesktopInfrastructure } from './src/index.ts';

const root = process.cwd();

const infra = await probeRepoDesktopInfrastructure(root);
assert.ok(infra.hasElectronBuilderConfig);
assert.ok(infra.packageScripts.includes('desktop:build:main'));
assert.ok(infra.packageScripts.includes('desktop:dist:win'));
assert.ok(infra.packageScripts.includes('desktop:dist:linux'));
assert.ok(infra.packageScripts.includes('desktop:dist'));

// Validate electron-builder config loads
const cfgOut = execFileSync(
  process.execPath,
  ['--input-type=module', '-e', "import cfg from './electron-builder.config.mjs'; console.log(JSON.stringify({appId: cfg.appId, productName: cfg.productName}))"],
  { cwd: root, env: { ...process.env, CC_EB_TARGET: 'win32-x64' }, encoding: 'utf8' },
);
const cfg = JSON.parse(cfgOut.trim()) as { appId: string };
assert.equal(cfg.appId, 'dev.openchatcut.app');

// Main/preload via esbuild (same as desktop:build:main)
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
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

console.log('desktop-distribution.build: ok');
