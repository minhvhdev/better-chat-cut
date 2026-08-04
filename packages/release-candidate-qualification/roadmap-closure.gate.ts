/**
 * Roadmap closure gate — profile roadmap-closure only.
 * Expects: clean tree, matching origin/main, prebuilt current-host real distribution.
 * Runs full verification (expensive) via executeCommands=true.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createQualificationService } from './src/index.ts';

const repoRoot = process.cwd();
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim();
assert.equal(porcelain, '', 'roadmap-closure requires clean working tree');

let originHead = '';
try {
  originHead = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {
  console.warn('origin/main not available locally; marking sync check via local refs only');
}
if (originHead && originHead !== head) {
  console.error(`HEAD ${head} != origin/main ${originHead}. Push before closure.`);
  process.exit(1);
}

const evidencePath = join(repoRoot, 'release', 'better-chat-cut-current-host-evidence.json');
assert.ok(existsSync(evidencePath), 'Missing release/better-chat-cut-current-host-evidence.json — run current-host package first');
const hostEv = JSON.parse(await readFileAsync(evidencePath, 'utf8')) as {
  distributionId: string;
  distributionManifestHash: string;
  operationId: string;
  buildMode: string;
  dryRun: boolean;
  stub: boolean;
};
assert.equal(hostEv.buildMode, 'real');
assert.equal(hostEv.dryRun, false);
assert.equal(hostEv.stub, false);

const pkg = JSON.parse(await readFileAsync(join(repoRoot, 'package.json'), 'utf8')) as { version: string };
const svc = createQualificationService({ repoRoot });
const plan = await svc.preparePlan({
  id: 'roadmap-closure',
  name: 'Roadmap Closure Gate',
  version: pkg.version,
  sourceCommit: head,
  distributionManifestHash: hostEv.distributionManifestHash,
  channel: 'candidate',
  profile: 'roadmap-closure',
});

console.log('Running roadmap-closure validation (executeCommands=true) — this will take a long time...');
const { report, closure, evidenceManifest, milestoneEvidence } = await svc.validate(plan, {
  profile: 'roadmap-closure',
  executeCommands: true,
  distributionEvidence: {
    distributionId: hostEv.distributionId,
    distributionManifestHash: hostEv.distributionManifestHash,
    operationId: hostEv.operationId,
  },
});

console.log(JSON.stringify({
  candidateStatus: report.status,
  reportHash: report.reportHash,
  blockingCheckIds: report.blockingCheckIds,
  warningCheckIds: report.warningCheckIds,
  evidenceManifestHash: evidenceManifest.manifestHash,
  roadmapClosed: closure.roadmapClosed,
  remainingRequiredMilestones: closure.remainingRequiredMilestones,
  closureReportHash: closure.reportHash,
  milestones: milestoneEvidence.map((m) => ({ id: m.milestoneId, status: m.status })),
}, null, 2));

// Do not hard-code true — exit non-zero if not closed
if (!closure.roadmapClosed) {
  console.error('Roadmap closed: false');
  process.exit(2);
}
console.log('Roadmap closed: true');
