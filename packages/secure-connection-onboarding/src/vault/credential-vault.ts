import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, readdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { ConnectionMetadataV1, ConnectionVaultEntryV1 } from '../contracts/onboarding-types.ts';
import { OnboardingError } from '../contracts/onboarding-errors.ts';

export type TokenPayload = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  scope?: string;
};

export type CredentialVault = {
  put: (connectionId: string, tokens: TokenPayload, metadata: ConnectionMetadataV1) => Promise<void>;
  getMetadata: (connectionId: string) => Promise<ConnectionMetadataV1 | null>;
  /** Returns tokens only for server/main process use. Never expose via API/MCP. */
  resolveTokens: (connectionId: string) => Promise<TokenPayload | null>;
  delete: (connectionId: string) => Promise<void>;
  listMetadata: () => Promise<ConnectionMetadataV1[]>;
  encryptionAvailable: () => boolean;
};

function resolveVaultRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_CHAT_CUT_CONNECTION_VAULT_ROOT) return env.BETTER_CHAT_CUT_CONNECTION_VAULT_ROOT;
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'connection-vault');
}

async function ensureMasterKey(vaultRoot: string): Promise<{ key: Buffer; keyId: string }> {
  const keyPath = join(vaultRoot, 'master.key');
  await mkdir(vaultRoot, { recursive: true });
  if (existsSync(keyPath)) {
    const raw = await readFile(keyPath);
    const keyId = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return { key: raw.subarray(0, 32), keyId };
  }
  const secret = randomBytes(32);
  const tmp = `${keyPath}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, secret, { mode: 0o600 });
  await rename(tmp, keyPath);
  try { await chmod(keyPath, 0o600); } catch { /* windows */ }
  const keyId = createHash('sha256').update(secret).digest('hex').slice(0, 16);
  return { key: secret, keyId };
}

export function createEncryptedCredentialVault(options?: {
  vaultRoot?: string;
  env?: NodeJS.ProcessEnv;
}): CredentialVault {
  const env = options?.env ?? process.env;
  const vaultRoot = options?.vaultRoot ?? resolveVaultRoot(env);
  const entriesDir = join(vaultRoot, 'entries');

  async function loadEntry(connectionId: string): Promise<ConnectionVaultEntryV1 | null> {
    try {
      const raw = await readFile(join(entriesDir, `${encodeURIComponent(connectionId)}.json`), 'utf8');
      return JSON.parse(raw) as ConnectionVaultEntryV1;
    } catch {
      return null;
    }
  }

  return {
    encryptionAvailable: () => true,
    async put(connectionId, tokens, metadata) {
      await mkdir(entriesDir, { recursive: true });
      const { key, keyId } = await ensureMasterKey(vaultRoot);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8');
      const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const entry: ConnectionVaultEntryV1 = {
        schemaVersion: '1.0.0',
        connectionId,
        platform: 'youtube',
        ciphertext: enc.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        keyId,
        metadata,
      };
      const path = join(entriesDir, `${encodeURIComponent(connectionId)}.json`);
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(entry), { encoding: 'utf8', mode: 0o600 });
      await rename(tmp, path);
      // Ensure no plaintext token fields exist on disk
      const check = await readFile(path, 'utf8');
      if (check.includes(tokens.accessToken) || (tokens.refreshToken && check.includes(tokens.refreshToken))) {
        await unlink(path).catch(() => undefined);
        throw new OnboardingError('ONBOARDING_VAULT_UNAVAILABLE', 'Vault refused plaintext persistence');
      }
    },
    async getMetadata(connectionId) {
      const e = await loadEntry(connectionId);
      return e?.metadata ?? null;
    },
    async resolveTokens(connectionId) {
      const e = await loadEntry(connectionId);
      if (!e) return null;
      const { key } = await ensureMasterKey(vaultRoot);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(e.authTag, 'base64'));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(e.ciphertext, 'base64')),
        decipher.final(),
      ]);
      return JSON.parse(dec.toString('utf8')) as TokenPayload;
    },
    async delete(connectionId) {
      await unlink(join(entriesDir, `${encodeURIComponent(connectionId)}.json`)).catch(() => undefined);
    },
    async listMetadata() {
      await mkdir(entriesDir, { recursive: true });
      const files = await readdir(entriesDir);
      const out: ConnectionMetadataV1[] = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = await readFile(join(entriesDir, f), 'utf8');
          const e = JSON.parse(raw) as ConnectionVaultEntryV1;
          out.push(e.metadata);
        } catch { /* skip */ }
      }
      return out;
    },
  };
}

/** Test vault: still AES-encrypted under a temp root. */
export function createFakeCredentialVault(vaultRoot: string): CredentialVault {
  return createEncryptedCredentialVault({ vaultRoot });
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted-oauth]')
      .replace(/1\/\/[A-Za-z0-9._-]+/g, '[redacted-refresh]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|authorization|verifier|ciphertext/i.test(k) && k !== 'ciphertextPresent') {
        out[k] = '[redacted]';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}
