import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  NARRATION_CONTROL_TOOLS,
  NARRATION_PROJECT_TOOLS,
  runNarrationControlTool,
  setNarrationSynthesisServiceForTests,
} from './narration-tools.ts';
import { createNarrationSynthesisService, encodeToneWav } from '../../../packages/narration-audio/src/index.ts';
import { sampleNarrationPlan } from '../../../packages/narration-plans/narration-plans.verify.ts';
import { ensureBetterChatCutMotionRuntime } from '../../../packages/motion-components/src/index.ts';

ensureBetterChatCutMotionRuntime();

const root = mkdtempSync(join(tmpdir(), 'bcc-narration-tools-'));
setNarrationSynthesisServiceForTests(createNarrationSynthesisService({
  narrationRoot: root,
  now: () => '2026-01-01T00:00:00.000Z',
  provider: async (req) => {
    const text = String(req.text ?? '');
    const durationMs = Math.max(500, text.length * 30);
    return { audio: encodeToneWav(durationMs), durationMs, codec: 'wav', sampleRate: 24000 };
  },
}));

assert.deepEqual(
  NARRATION_CONTROL_TOOLS.map((t) => t.name),
  [
    'narration_get_contract',
    'narration_plan_validate',
    'narration_tts_prepare',
    'narration_tts_status',
    'narration_timing_resolve',
  ],
);
assert.ok(NARRATION_PROJECT_TOOLS.some((t) => t.name === 'narration_apply_timeline'));

const contract = await runNarrationControlTool('narration_get_contract', { format: 'full' }) as {
  schemaVersion: string;
  projectSchemaChanged: boolean;
  reservedNarrationPropsKey: string;
  workflow: string[];
};
assert.equal(contract.schemaVersion, '1.0.0');
assert.equal(contract.projectSchemaChanged, false);
assert.equal(contract.reservedNarrationPropsKey, '__betterChatCutNarration');
assert.ok(contract.workflow.includes('narration_apply_timeline'));

const plan = sampleNarrationPlan();
const validated = await runNarrationControlTool('narration_plan_validate', {
  narrationPlan: plan,
  includeNormalizedPlan: true,
}) as { valid: boolean; narrationPlanHash: string; errors: unknown[] };
assert.equal(validated.valid, true, JSON.stringify(validated.errors));

const dry = await runNarrationControlTool('narration_tts_prepare', {
  requestId: 'tools-dry-1',
  narrationPlan: plan,
  dryRun: true,
}) as { dryRun: boolean; submittedCount: number };
assert.equal(dry.dryRun, true);
assert.equal(dry.submittedCount, 0);

const apply = await runNarrationControlTool('narration_tts_prepare', {
  requestId: 'tools-apply-1',
  narrationPlan: plan,
  dryRun: false,
}) as { submittedCount: number; narrationPlanHash: string };
assert.ok(apply.submittedCount >= 3);

const status = await runNarrationControlTool('narration_tts_status', {
  narrationPlanId: plan.id,
  narrationPlanHash: apply.narrationPlanHash,
}) as { status: string };
assert.ok(['complete', 'partially-complete', 'running'].includes(status.status));

const timing = await runNarrationControlTool('narration_timing_resolve', {
  narrationPlan: plan,
}) as { timingSnapshot: { timingHash: string } | null; errors: unknown[] };
assert.ok(timing.timingSnapshot, JSON.stringify(timing.errors));
assert.ok(timing.timingSnapshot!.timingHash);

setNarrationSynthesisServiceForTests(null);
console.log('narration-tools.verify: ok');
