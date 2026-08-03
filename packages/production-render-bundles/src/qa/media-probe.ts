import { spawn } from 'node:child_process';
import { ffmpegBin, ffprobeBin } from '../../../../server/media-binaries.ts';

export type MediaProbeResult = {
  container: string;
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  video?: {
    codec: string;
    width: number;
    height: number;
    fps: number;
    fpsNumerator?: number;
    fpsDenominator?: number;
    pixelFormat?: string;
  };
  audio?: {
    codec: string;
    sampleRate?: number;
    channels?: number;
    durationMs?: number;
  };
  raw?: unknown;
};

function runProcess(command: string, args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout?.on('data', (c: Buffer) => { stdout += String(c); });
    child.stderr?.on('data', (c: Buffer) => { stderr += String(c); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exit ${code}: ${stderr.slice(-800)}`));
    });
  });
}

function parseRate(value?: string): { fps: number; num?: number; den?: number } {
  if (!value) return { fps: 0 };
  const [n, d = '1'] = value.split('/');
  const num = Number(n);
  const den = Number(d);
  const fps = den ? num / den : num;
  return { fps: Number.isFinite(fps) ? fps : 0, num, den };
}

export async function probeMediaFile(file: string): Promise<MediaProbeResult> {
  const { stdout } = await runProcess(ffprobeBin(), [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ], 60_000);
  const probe = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const video = probe.streams?.find((s) => s.codec_type === 'video');
  const audio = probe.streams?.find((s) => s.codec_type === 'audio');
  const durationSec = Number(probe.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  const rate = parseRate(String(video?.avg_frame_rate ?? video?.r_frame_rate ?? ''));
  return {
    container: String(probe.format?.format_name ?? 'mp4'),
    durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    ...(video ? {
      video: {
        codec: String(video.codec_name ?? 'unknown'),
        width: Number(video.width ?? 0),
        height: Number(video.height ?? 0),
        fps: rate.fps,
        fpsNumerator: rate.num,
        fpsDenominator: rate.den,
        pixelFormat: typeof video.pix_fmt === 'string' ? video.pix_fmt : undefined,
      },
    } : {}),
    ...(audio ? {
      audio: {
        codec: String(audio.codec_name ?? 'unknown'),
        sampleRate: Number(audio.sample_rate ?? 0) || undefined,
        channels: Number(audio.channels ?? 0) || undefined,
        durationMs: Number(audio.duration) ? Math.round(Number(audio.duration) * 1000) : undefined,
      },
    } : {}),
    raw: probe,
  };
}

export async function analyzeBlackAndFreeze(file: string): Promise<{ stderr: string }> {
  const { stderr } = await runProcess(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-i', file,
    '-map', '0:v:0',
    '-vf', 'blackdetect=d=0.12:pic_th=0.98:pix_th=0.10,freezedetect=n=-50dB:d=0.5',
    '-an', '-f', 'null', '-',
  ]);
  return { stderr };
}

export async function analyzeSilenceAndLoudness(file: string): Promise<{ stderr: string }> {
  const { stderr } = await runProcess(ffmpegBin(), [
    '-nostdin', '-hide_banner', '-i', file,
    '-map', '0:a:0',
    '-af', 'silencedetect=n=-50dB:d=2,volumedetect',
    '-vn', '-f', 'null', '-',
  ]);
  return { stderr };
}

export function parseBlackRanges(log: string): Array<{ startMs: number; endMs: number; durationMs: number }> {
  const ranges: Array<{ startMs: number; endMs: number; durationMs: number }> = [];
  const re = /black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(log))) {
    const startMs = Math.round(Number(match[1]) * 1000);
    const endMs = Math.round(Number(match[2]) * 1000);
    const durationMs = Math.round(Number(match[3]) * 1000);
    ranges.push({ startMs, endMs, durationMs });
  }
  return ranges;
}

export function parseFreezeRanges(log: string): Array<{ startMs: number; endMs: number; durationMs: number }> {
  const ranges: Array<{ startMs: number; endMs: number; durationMs: number }> = [];
  const starts = [...log.matchAll(/freeze_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/freeze_end:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  for (let i = 0; i < Math.min(starts.length, ends.length); i += 1) {
    const startMs = Math.round(starts[i]! * 1000);
    const endMs = Math.round(ends[i]! * 1000);
    ranges.push({ startMs, endMs, durationMs: Math.max(0, endMs - startMs) });
  }
  return ranges;
}

export function parseSilenceRanges(log: string): Array<{ startMs: number; endMs: number; durationMs: number }> {
  const ranges: Array<{ startMs: number; endMs: number; durationMs: number }> = [];
  const starts = [...log.matchAll(/silence_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end:\s*([0-9.]+)(?:\s*\|\s*silence_duration:\s*([0-9.]+))?/g)];
  for (let i = 0; i < Math.min(starts.length, ends.length); i += 1) {
    const startMs = Math.round(starts[i]! * 1000);
    const endMs = Math.round(Number(ends[i]![1]) * 1000);
    const durationMs = ends[i]![2] ? Math.round(Number(ends[i]![2]) * 1000) : Math.max(0, endMs - startMs);
    ranges.push({ startMs, endMs, durationMs });
  }
  return ranges;
}

export function parseVolumeDetect(log: string): { peakDbfs?: number; meanVolume?: number } {
  const peak = log.match(/max_volume:\s*([-0-9.]+)\s*dB/);
  const mean = log.match(/mean_volume:\s*([-0-9.]+)\s*dB/);
  return {
    peakDbfs: peak ? Number(peak[1]) : undefined,
    meanVolume: mean ? Number(mean[1]) : undefined,
  };
}

export { runProcess, ffmpegBin, ffprobeBin };
