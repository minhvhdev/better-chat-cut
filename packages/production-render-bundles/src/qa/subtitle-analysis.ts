import { productionRenderDiagnostic, type ProductionRenderDiagnostic } from '../../../production-render-plans/src/contracts/production-render-errors.ts';
import type { ProductionSubtitleQaResultV1 } from '../contracts/qa-report.ts';
import { sha256Bytes } from '../storage/artifact-hash.ts';

export function parseSrt(content: string): { cues: Array<{ index: number; startMs: number; endMs: number; text: string }>; errors: ProductionRenderDiagnostic[] } {
  const errors: ProductionRenderDiagnostic[] = [];
  const cues: Array<{ index: number; startMs: number; endMs: number; text: string }> = [];
  const blocks = content.replace(/^\uFEFF/, '').trim().split(/\n\s*\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split(/\r?\n/);
    const index = Number(lines[0]);
    const timing = lines[1] ?? '';
    const match = timing.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!match) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_INVALID', 'Invalid SRT timing', {
        recovery: 'Regenerate subtitles from a valid timing snapshot',
      }));
      continue;
    }
    const startMs = hmsToMs(match[1]!, match[2]!, match[3]!, match[4]!);
    const endMs = hmsToMs(match[5]!, match[6]!, match[7]!, match[8]!);
    const text = lines.slice(2).join('\n');
    if (!(endMs > startMs) || startMs < 0) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_OUT_OF_RANGE', 'Invalid cue bounds'));
    }
    cues.push({ index: Number.isFinite(index) ? index : cues.length + 1, startMs, endMs, text });
  }
  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i]!.startMs < cues[i - 1]!.startMs) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_INVALID', 'Non-monotonic SRT cues'));
      break;
    }
  }
  return { cues, errors };
}

export function parseVtt(content: string): { cues: Array<{ startMs: number; endMs: number; text: string }>; errors: ProductionRenderDiagnostic[] } {
  const errors: ProductionRenderDiagnostic[] = [];
  if (!content.replace(/^\uFEFF/, '').startsWith('WEBVTT')) {
    errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_INVALID', 'Missing WEBVTT header'));
  }
  const cues: Array<{ startMs: number; endMs: number; text: string }> = [];
  const blocks = content.replace(/^\uFEFF/, '').trim().split(/\n\s*\n/).slice(1);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timingLine = lines.find((l) => l.includes('-->')) ?? '';
    const match = timingLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!match) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_INVALID', 'Invalid VTT timing'));
      continue;
    }
    const startMs = hmsToMs(match[1]!, match[2]!, match[3]!, match[4]!);
    const endMs = hmsToMs(match[5]!, match[6]!, match[7]!, match[8]!);
    const text = lines.filter((l) => !l.includes('-->')).join('\n');
    cues.push({ startMs, endMs, text });
  }
  return { cues, errors };
}

function hmsToMs(h: string, m: string, s: string, ms: string): number {
  return (((Number(h) * 60 + Number(m)) * 60) + Number(s)) * 1000 + Number(ms);
}

export function analyzeSubtitleArtifacts(input: {
  srt?: string | null;
  vtt?: string | null;
  requireSrt: boolean;
  requireVtt: boolean;
  renderDurationMs: number;
}): { results: ProductionSubtitleQaResultV1[]; errors: ProductionRenderDiagnostic[]; warnings: ProductionRenderDiagnostic[] } {
  const errors: ProductionRenderDiagnostic[] = [];
  const warnings: ProductionRenderDiagnostic[] = [];
  const results: ProductionSubtitleQaResultV1[] = [];

  if (input.requireSrt) {
    if (!input.srt) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_MISSING', 'SRT missing'));
      results.push({ role: 'subtitle-srt', valid: false, cueCount: 0, errors: [...errors], warnings: [] });
    } else {
      const parsed = parseSrt(input.srt);
      for (const cue of parsed.cues) {
        if (cue.endMs > input.renderDurationMs + 250) {
          parsed.errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_OUT_OF_RANGE', 'Cue beyond render duration'));
        }
      }
      errors.push(...parsed.errors);
      results.push({ role: 'subtitle-srt', valid: parsed.errors.length === 0, cueCount: parsed.cues.length, errors: parsed.errors, warnings: [] });
    }
  }

  if (input.requireVtt) {
    if (!input.vtt) {
      errors.push(productionRenderDiagnostic('error', 'PRODUCTION_RENDER_SUBTITLE_MISSING', 'VTT missing'));
      results.push({ role: 'subtitle-vtt', valid: false, cueCount: 0, errors: [...errors], warnings: [] });
    } else {
      const parsed = parseVtt(input.vtt);
      errors.push(...parsed.errors);
      results.push({ role: 'subtitle-vtt', valid: parsed.errors.length === 0, cueCount: parsed.cues.length, errors: parsed.errors, warnings: [] });
    }
  }

  if (input.srt && input.vtt) {
    const s = parseSrt(input.srt).cues.map((c) => `${c.startMs}:${c.endMs}:${c.text}`).join('|');
    const v = parseVtt(input.vtt).cues.map((c) => `${c.startMs}:${c.endMs}:${c.text}`).join('|');
    if (sha256Bytes(s) !== sha256Bytes(v)) {
      warnings.push(productionRenderDiagnostic('warning', 'PRODUCTION_RENDER_SUBTITLE_TIMING_MISMATCH', 'SRT/VTT semantic mismatch'));
    }
  }

  return { results, errors, warnings };
}
