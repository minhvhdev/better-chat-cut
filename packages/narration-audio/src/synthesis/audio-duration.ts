/** Minimal WAV PCM helpers for deterministic scene/segment audio without FFmpeg. */

export function encodeSilenceWav(durationMs: number, sampleRate = 24000, channels = 1): Buffer {
  const samples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataSize = samples * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // PCM already zero = silence
  return buffer;
}

export function encodeToneWav(durationMs: number, sampleRate = 24000, freq = 440): Buffer {
  const samples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.2;
    buffer.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sample * 32767))), 44 + i * 2);
  }
  return buffer;
}

export function concatWavPcm(parts: Buffer[]): Buffer {
  if (parts.length === 0) return encodeSilenceWav(1);
  if (parts.length === 1) return parts[0]!;
  const sampleRate = parts[0]!.readUInt32LE(24);
  const channels = parts[0]!.readUInt16LE(22);
  const pcmChunks: Buffer[] = [];
  for (const part of parts) {
    if (part.readUInt32LE(24) !== sampleRate || part.readUInt16LE(22) !== channels) {
      throw new Error('WAV format mismatch while concatenating narration audio');
    }
    pcmChunks.push(part.subarray(44));
  }
  const data = Buffer.concat(pcmChunks);
  const out = Buffer.alloc(44 + data.length);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + data.length, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * channels * 2, 28);
  out.writeUInt16LE(channels * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}

export function probeWavDurationMs(wav: Buffer): number {
  if (wav.length < 44) return 0;
  const sampleRate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22);
  const bits = wav.readUInt16LE(34);
  const dataSize = wav.readUInt32LE(40);
  if (!sampleRate || !channels || !bits) return 0;
  const bytesPerSample = (bits / 8) * channels;
  const samples = Math.floor(dataSize / bytesPerSample);
  return Math.max(1, Math.round((samples / sampleRate) * 1000));
}
