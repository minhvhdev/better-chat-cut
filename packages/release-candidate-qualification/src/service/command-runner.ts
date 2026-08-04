import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import type { QualificationCommandDefinitionV1, QualificationEvidenceV1 } from '../contracts/evidence-types.ts';
import { hashEvidenceBody } from '../evidence/hash.ts';
import { getQualificationCommand } from '../registry/commands.ts';

export type CommandRunResult = {
  exitCode: number;
  stdoutSha256: string;
  stderrSha256: string;
  startedAt: string;
  completedAt: string;
};

function digest(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function runQualificationCommand(
  repoRoot: string,
  commandId: string,
  options: { timeoutMs?: number } = {},
): Promise<{ definition: QualificationCommandDefinitionV1; result: CommandRunResult }> {
  const definition = getQualificationCommand(commandId);
  if (!definition) {
    throw new Error(`Unknown qualification command: ${commandId}`);
  }
  const timeoutMs = options.timeoutMs ?? definition.timeoutMs;
  const startedAt = new Date().toISOString();
  console.error(`[qualification-command] start ${commandId} timeoutMs=${timeoutMs}`);

  let executable: string;
  let args: string[];
  if (definition.npmScript) {
    executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    args = ['run', definition.npmScript];
  } else if (definition.executable) {
    executable = definition.executable;
    args = definition.args ?? [];
    if (executable === 'npx' && process.platform === 'win32') {
      executable = 'npx.cmd';
    }
  } else {
    throw new Error(`Command ${commandId} missing executable definition`);
  }

  const result = await new Promise<CommandRunResult>((resolve) => {
    const child = spawn(executable, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      console.error(`[qualification-command] timeout ${commandId}`);
      try {
        child.kill('SIGTERM');
      } catch { /* ignore */ }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch { /* ignore */ }
        if (settled) return;
        settled = true;
        console.error(`[qualification-command] force-fail after timeout ${commandId}`);
        resolve({
          exitCode: 124,
          stdoutSha256: digest(Buffer.concat(stdoutChunks)),
          stderrSha256: digest(Buffer.concat(stderrChunks)),
          startedAt,
          completedAt: new Date().toISOString(),
        });
      }, 10_000).unref?.();
    }, timeoutMs);

    child.stdout?.on('data', (c: Buffer) => {
      stdoutChunks.push(Buffer.from(c));
      process.stdout.write(c);
      if (Buffer.concat(stdoutChunks).byteLength > 2_000_000) stdoutChunks.splice(0, stdoutChunks.length - 20);
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderrChunks.push(Buffer.from(c));
      process.stderr.write(c);
      if (Buffer.concat(stderrChunks).byteLength > 2_000_000) stderrChunks.splice(0, stderrChunks.length - 20);
    });
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error(`[qualification-command] error ${commandId}`);
      resolve({
        exitCode: 1,
        stdoutSha256: digest(Buffer.concat(stdoutChunks)),
        stderrSha256: digest(Buffer.concat(stderrChunks)),
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error(`[qualification-command] done ${commandId} exit=${code ?? 1}`);
      resolve({
        exitCode: code ?? 1,
        stdoutSha256: digest(Buffer.concat(stdoutChunks)),
        stderrSha256: digest(Buffer.concat(stderrChunks)),
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
  });

  return { definition, result };
}

export function evidenceFromCommand(input: {
  checkId: string;
  commandId: string;
  commit: string;
  appVersion: string;
  required: boolean;
  result: CommandRunResult;
}): QualificationEvidenceV1 {
  const body: Omit<QualificationEvidenceV1, 'evidenceHash'> = {
    schemaVersion: '1.0.0',
    evidenceId: `ev.${randomUUID()}`,
    checkId: input.checkId,
    provider: 'local-command',
    source: { commit: input.commit, appVersion: input.appVersion },
    execution: {
      commandId: input.commandId,
      exitCode: input.result.exitCode,
      startedAt: input.result.startedAt,
      completedAt: input.result.completedAt,
      stdoutSha256: input.result.stdoutSha256,
      stderrSha256: input.result.stderrSha256,
    },
    status: input.result.exitCode === 0 ? 'passed' : 'failed',
    required: input.required,
  };
  return {
    ...body,
    evidenceHash: hashEvidenceBody(body as unknown as Record<string, unknown>),
  };
}

export function evidenceService(input: {
  checkId: string;
  commit: string;
  appVersion: string;
  required: boolean;
  status: QualificationEvidenceV1['status'];
  reports?: QualificationEvidenceV1['reports'];
  artifacts?: QualificationEvidenceV1['artifacts'];
  target?: QualificationEvidenceV1['target'];
  provider?: QualificationEvidenceV1['provider'];
}): QualificationEvidenceV1 {
  const body: Omit<QualificationEvidenceV1, 'evidenceHash'> = {
    schemaVersion: '1.0.0',
    evidenceId: `ev.${randomUUID()}`,
    checkId: input.checkId,
    provider: input.provider ?? 'service-verification',
    source: { commit: input.commit, appVersion: input.appVersion },
    target: input.target,
    artifacts: input.artifacts,
    reports: input.reports,
    status: input.status,
    required: input.required,
  };
  return {
    ...body,
    evidenceHash: hashEvidenceBody(body as unknown as Record<string, unknown>),
  };
}
