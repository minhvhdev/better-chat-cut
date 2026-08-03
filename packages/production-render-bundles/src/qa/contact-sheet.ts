import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { ffmpegBin } from '../../../../server/media-binaries.ts';
import { tileContactSheet } from '../../../../server/frame-grid.ts';
import { readFile } from 'node:fs/promises';
import { productionRenderDiagnostic } from '../../../production-render-plans/src/contracts/production-render-errors.ts';

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (c: Buffer) => { stderr += String(c); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function buildQaContactSheet(input: {
  videoPath: string;
  frames: number[];
  fps: number;
  workDir: string;
  columns: number;
  outputPath: string;
}): Promise<{ ok: boolean; error?: ReturnType<typeof productionRenderDiagnostic> }> {
  try {
    const cells: { jpeg: Buffer; label: string }[] = [];
    for (const frame of input.frames) {
      const seconds = frame / Math.max(1, input.fps);
      const out = join(input.workDir, `qa-frame-${frame}.jpg`);
      await run(ffmpegBin(), [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(Math.max(0, seconds)),
        '-i', input.videoPath,
        '-frames:v', '1', '-q:v', '4', out,
      ]);
      cells.push({
        jpeg: await readFile(out),
        label: `f${frame} · ${(seconds).toFixed(2)}s`,
      });
    }
    if (!cells.length) {
      // Minimal 1x1 PNG placeholder when no frames
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      writeFileSync(input.outputPath, png);
      return { ok: true };
    }
    const sheet = await tileContactSheet(cells, { cols: input.columns, cellWidth: 240 });
    writeFileSync(input.outputPath, sheet);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: productionRenderDiagnostic('error', 'PRODUCTION_RENDER_CONTACT_SHEET_FAILED', 'Contact sheet generation failed', {
        details: { message: error instanceof Error ? error.message : String(error) },
        recovery: 'Retry QA; structural media checks may still pass',
      }),
    };
  }
}
