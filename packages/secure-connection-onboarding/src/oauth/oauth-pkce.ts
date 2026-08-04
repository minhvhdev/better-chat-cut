import { createHash, randomBytes } from 'node:crypto';

export function generateOAuthState(): string {
  return randomBytes(24).toString('base64url');
}

export function generatePkcePair(): { verifier: string; challenge: string; method: 'S256' } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

export const YOUTUBE_ALLOWED_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'openid',
  'email',
  'profile',
] as const;

export function filterAllowedScopes(requested: string[]): string[] {
  const allow = new Set<string>(YOUTUBE_ALLOWED_SCOPES);
  return requested.filter((s) => allow.has(s));
}
