/**
 * Deterministic full regression groups M1A–M7B (fail-fast).
 * Usage: tsx packages/release-candidate-qualification/full-regression.ts [group]
 */
import { spawnSync } from 'node:child_process';

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
    'verify:better-chat-cut-distribution-contracts',
    'verify:better-chat-cut-desktop-distribution',
    'verify:better-chat-cut-desktop-security',
    'verify:better-chat-cut-connection-onboarding',
    'verify:better-chat-cut-connection-onboarding:desktop',
    'verify:better-chat-cut-backup-restore',
    'verify:better-chat-cut-backup-restore:e2e',
    'verify:better-chat-cut-release-qualification',
    'verify:better-chat-cut-finalization:mcp',
  ],
};

const order = [
  'assets-motion',
  'scenes',
  'video',
  'narration-render',
  'orchestration-publishing',
  'workspace-finalization',
] as const;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const only = process.argv[2];

function runScript(script: string): void {
  console.log(`\n>>> npm run ${script}`);
  const r = spawnSync(npm, ['run', script], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: process.env,
    // Windows can leave handles open; force hard timeout per child as a backstop
    timeout: 1_200_000,
    killSignal: 'SIGTERM',
  });
  if (r.error) {
    console.error(`FAIL: ${script} error ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`FAIL: ${script} exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

const selected = only
  ? [only]
  : [...order];

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
// Explicit exit so nested spawns cannot keep the process alive on Windows
process.exit(0);