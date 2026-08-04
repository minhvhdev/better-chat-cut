/**
 * Deterministic full regression groups M1A–M7B (fail-fast).
 * Avoids `npm run` + shell nesting on Windows (esbuild service handles can hang spawnSync forever).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = process.cwd();
const require = createRequire(join(repoRoot, 'package.json'));
const tsxCli = require.resolve('tsx/cli');

const groups: Record<string, string[]> = {
  'assets-motion': [
    'verify:better-chat-cut-assets',
    'verify:better-chat-cut-motion',
  ],
  scenes: [
    'verify:better-chat-cut-scenes',
    'verify:better-chat-cut-asset-resolver',
    'verify:better-chat-cut-scene-drafts',
    'verify:better-chat-cut-project-scenes',
    'verify:better-chat-cut-project-scenes:session',
  ],
  video: [
    'verify:better-chat-cut-video-plans',
    'verify:better-chat-cut-video-assembly',
    'verify:better-chat-cut-video-assembly:session',
  ],
  'narration-render': [
    'verify:better-chat-cut-narration-plans',
    'verify:better-chat-cut-narration-audio',
    'verify:better-chat-cut-voiceover-alignment',
    'verify:better-chat-cut-project-narration',
    'verify:better-chat-cut-project-narration:session',
    'verify:better-chat-cut-production-render-plans',
    'verify:better-chat-cut-production-render-bundles',
    'verify:better-chat-cut-production-render-bundles:mcp',
  ],
  'orchestration-publishing': [
    'verify:better-chat-cut-production-contracts',
    'verify:better-chat-cut-production-runs',
    'verify:better-chat-cut-production-orchestrator',
    'verify:better-chat-cut-production-orchestrator:session',
    'verify:better-chat-cut-production-orchestrator:e2e',
    'verify:better-chat-cut-publishing-contracts',
    'verify:better-chat-cut-publishing-assets',
    'verify:better-chat-cut-publishing-operations',
    'verify:better-chat-cut-publishing-mcp',
    'verify:better-chat-cut-publishing:e2e',
  ],
  'workspace-finalization': [
    'verify:better-chat-cut-workspace-contracts',
    'verify:better-chat-cut-workspace-services',
    'verify:better-chat-cut-workspace-ui',
    'verify:better-chat-cut-workspace-health',
    'verify:better-chat-cut-workspace-migrations',
    'verify:better-chat-cut-workspace:mcp',
    'verify:better-chat-cut-workspace:e2e',
    'verify:better-chat-cut-workspace:desktop',
  ],
  'm7b-finalization': [
    'verify:better-chat-cut-distribution-contracts',
    'verify:better-chat-cut-desktop-distribution',
    'verify:better-chat-cut-desktop-security',
    'verify:better-chat-cut-connection-onboarding',
    'verify:better-chat-cut-connection-onboarding:desktop',
    'verify:better-chat-cut-backup-restore',
    'verify:better-chat-cut-backup-restore:e2e',
    'verify:better-chat-cut-release-qualification',
    'verify:better-chat-cut-finalization:mcp',
    'verify:better-chat-cut-m7b:e2e',
  ],
};

const order = [
  'assets-motion',
  'scenes',
  'video',
  'narration-render',
  'orchestration-publishing',
  'workspace-finalization',
  'm7b-finalization',
] as const;

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

function runScript(script: string): void {
  console.log(`\n>>> ${script}`);
  const raw = pkg.scripts?.[script];
  if (!raw) {
    console.error(`Unknown script: ${script}`);
    process.exit(2);
  }

  // Prefer direct `tsx file.ts` invocations over `npm run` (avoids Windows handle hangs).
  const parts = raw.trim().split(/\s+/);
  let r: ReturnType<typeof spawnSync>;
  if (parts[0] === 'tsx' && parts.length >= 2) {
    r = spawnSync(process.execPath, [tsxCli, ...parts.slice(1)], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
      windowsHide: true,
    });
  } else if (parts[0] === 'npx' && parts[1] === 'tsx') {
    r = spawnSync(process.execPath, [tsxCli, ...parts.slice(2)], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
      windowsHide: true,
    });
  } else {
    // Shell fallback for composite scripts (&& chains)
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    r = spawnSync(npm, ['run', script], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
      env: process.env,
      windowsHide: true,
    });
  }

  if (r.error) {
    console.error(`FAIL: ${script} error ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`FAIL: ${script} exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

const only = process.argv[2];
const selected = only ? [only] : [...order];

for (const g of selected) {
  const scripts = groups[g];
  if (!scripts) {
    console.error(`Unknown group: ${g}. Known: ${Object.keys(groups).join(', ')}`);
    process.exit(2);
  }
  console.log(`\n==== GROUP ${g} ====`);
  for (const s of scripts) runScript(s);
  console.log(`==== GROUP ${g} done ====`);
}

console.log('\nfull-regression: ok');
process.exit(0);
