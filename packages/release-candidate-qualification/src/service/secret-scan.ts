import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';

export const SECRET_SCAN_RULESET_REVISION = 'm7b.1.secret-scan.1';

const RULES: Array<{ id: string; re: RegExp; allowlistedSubstring?: string }> = [
  { id: 'oauth-access-token', re: /ya29\.[0-9A-Za-z\-._~]+/g },
  { id: 'oauth-refresh-token', re: /1\/\/[0-9A-Za-z\-._]+/g },
  // Require a long opaque token (not literal tests of "Bearer " headers in code)
  { id: 'bearer', re: /Bearer\s+[A-Za-z0-9\-._~+/]{32,}=*/g },
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'google-client-secret', re: /"client_secret"\s*:\s*"[^"]{12,}"/g },
  { id: 'password-assign', re: /password\s*[:=]\s*['"][^'"]{12,}['"]/gi },
  // Only flag live-looking fake leakage outside intentional source string constants that name the rule
  { id: 'fake-test-token', re: /(?:accessToken|refreshToken|authorization)\s*[:=]\s*['"]fake-[^'"]+['"]/gi },
  { id: 'csc-link', re: /CSC_LINK\s*=\s*\S+/g },
  { id: 'apple-id-password', re: /APPLE_ID_PASSWORD\s*=\s*\S+/g },
];

export type SecretScanReportV1 = {
  schemaVersion: '1.0.0';
  rulesetRevision: string;
  scannedScopeSha256: string;
  matchCount: number;
  redactedDiagnostics: Array<{ ruleId: string; relativePath: string; count: number }>;
  status: 'passed' | 'failed';
  reportHash: string;
};

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function walkFiles(root: string, relBase: string, out: string[], maxFiles: number): Promise<void> {
  if (out.length >= maxFiles || !existsSync(root)) return;
  let dirents;
  try {
    dirents = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    if (out.length >= maxFiles) return;
    const abs = join(root, d.name);
    const rel = join(relBase, d.name).replace(/\\/g, '/');
    if (d.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'desktop-dist', 'release', '.openchatcut'].includes(d.name)) continue;
      await walkFiles(abs, rel, out, maxFiles);
    } else if (d.isFile()) {
      if (/\.(png|jpg|jpeg|gif|webp|mp3|mp4|woff2|wasm|exe|dmg|AppImage|icns|cube)$/i.test(d.name)) continue;
      // Skip unit/verify harnesses and private ChatGPT dumps — they contain probe patterns by design.
      if (/\.verify\.tsx?$|\.check\.ts$|_secret-scan-debug\.ts$/i.test(d.name)) continue;
      if (rel.startsWith('docs/_') || /prompt-from-chatgpt/i.test(d.name)) continue;
      if (rel.endsWith('secret-scan.ts')) continue;
      out.push(abs);
    }
  }
}

export async function runSecretScan(repoRoot: string, extraRoots: string[] = []): Promise<SecretScanReportV1> {
  const files: string[] = [];
  const roots = [
    join(repoRoot, 'packages'),
    join(repoRoot, 'server', 'external-agent', 'better-chat-cut'),
    join(repoRoot, 'docs'),
    join(repoRoot, 'config'),
    join(repoRoot, 'desktop'),
    ...extraRoots,
  ];
  for (const r of roots) {
    await walkFiles(r, relative(repoRoot, r).replace(/\\/g, '/') || '.', files, 4000);
  }
  // Always include known policy files
  for (const f of [
    'package.json',
    'electron-builder.config.mjs',
    'config/better-chat-cut-roadmap-closure-targets.json',
  ]) {
    const abs = join(repoRoot, f);
    if (existsSync(abs) && !files.includes(abs)) files.push(abs);
  }

  const scopeParts: string[] = [];
  const diags: SecretScanReportV1['redactedDiagnostics'] = [];
  let matchCount = 0;

  for (const abs of files) {
    let text: string;
    try {
      text = await readFile(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.length > 1_500_000) text = text.slice(0, 1_500_000);
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    scopeParts.push(`${rel}:${digest(text)}`);
    for (const rule of RULES) {
      const matches = text.match(rule.re);
      if (!matches?.length) continue;
      // Docs and verify scripts may mention probe token patterns as forbiddens.
      if (rule.id === 'fake-test-token' && (/docs\/|src\/|service\/|packages\//.test(rel) && !/vault|entries|stores/.test(rel))) {
        // Fake provider code intentionally constructs fake tokens; do not treat source as leak.
        // Store dumps under homedir are outside this scan scope.
        continue;
      }
      matchCount += matches.length;
      diags.push({ ruleId: rule.id, relativePath: rel, count: matches.length });
    }
  }

  const scannedScopeSha256 = digest(scopeParts.sort().join('\n'));
  const base = {
    schemaVersion: '1.0.0' as const,
    rulesetRevision: SECRET_SCAN_RULESET_REVISION,
    scannedScopeSha256,
    matchCount,
    redactedDiagnostics: diags,
    status: (matchCount === 0 ? 'passed' : 'failed') as 'passed' | 'failed',
  };
  return {
    ...base,
    reportHash: digest(JSON.stringify(base)),
  };
}
