import type { ProductionQaCheckResultV1, ProductionQaReportV1, ProductionQualityGateResult } from '../contracts/qa-report.ts';
import type { ProductionQaPolicyV1 } from '../../../production-render-plans/src/contracts/production-qa-policy.ts';

export function evaluateQualityGate(
  report: Pick<ProductionQaReportV1, 'checks' | 'errors'>,
  policy: ProductionQaPolicyV1,
): ProductionQualityGateResult {
  const blockingCheckIds: string[] = [];
  const warningCheckIds: string[] = [];

  const sorted = [...report.checks].sort((a, b) =>
    a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

  for (const check of sorted) {
    if (check.status === 'failed') {
      if (isBlocking(check, policy)) blockingCheckIds.push(check.id);
      else warningCheckIds.push(check.id);
    } else if (check.status === 'warning') {
      if (policy.qualityGate === 'strict' && isStrictBlockingWarning(check)) blockingCheckIds.push(check.id);
      else warningCheckIds.push(check.id);
    }
  }

  for (const err of report.errors) {
    if (!blockingCheckIds.includes(err.code)) blockingCheckIds.push(err.code);
  }

  if (blockingCheckIds.length) {
    return { pass: false, status: 'failed', blockingCheckIds, warningCheckIds };
  }
  if (warningCheckIds.length) {
    return { pass: true, status: 'passed-with-warnings', blockingCheckIds, warningCheckIds };
  }
  return { pass: true, status: 'passed', blockingCheckIds, warningCheckIds };
}

function isBlocking(check: ProductionQaCheckResultV1, policy: ProductionQaPolicyV1): boolean {
  const hard = new Set([
    'video.stream',
    'video.dimensions',
    'video.fps',
    'video.duration',
    'video.decode',
    'video.full-black',
    'audio.stream',
    'audio.decode',
    'audio.entire-narration-silent',
    'subtitle.missing',
    'subtitle.invalid',
    'source.fingerprint',
    'source.dependency',
  ]);
  if (hard.has(check.id)) return true;
  if (policy.qualityGate === 'strict') {
    return [
      'audio.loudness',
      'audio.peak',
      'audio.silence',
      'video.black-range',
      'video.frozen-range',
      'subtitle.timing',
    ].includes(check.id);
  }
  return false;
}

function isStrictBlockingWarning(check: ProductionQaCheckResultV1): boolean {
  return ['audio.loudness', 'audio.peak', 'audio.silence', 'video.black-range', 'video.frozen-range', 'subtitle.timing'].includes(check.id);
}
