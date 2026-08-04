import { randomUUID } from 'node:crypto';
import { filterAllowedScopes, generateOAuthState, generatePkcePair } from '../oauth/oauth-pkce.ts';
import { startLoopbackCallbackServer, type LoopbackCallbackServer } from '../oauth/oauth-loopback-server.ts';
import {
  type ConnectionMetadataV1,
  type ConnectionOnboardingRequestV1,
  type ConnectionOnboardingSessionV1,
} from '../contracts/onboarding-types.ts';
import { OnboardingError } from '../contracts/onboarding-errors.ts';
import {
  createEncryptedCredentialVault,
  type CredentialVault,
  type TokenPayload,
  redactSecrets,
} from '../vault/credential-vault.ts';

type InternalSession = {
  public: ConnectionOnboardingSessionV1;
  state: string;
  codeVerifier: string;
  usedStates: Set<string>;
  loopback?: LoopbackCallbackServer;
  openBrowser: boolean;
};

export type ConnectionOnboardingServiceOptions = {
  vault?: CredentialVault;
  /** Fake provider: complete without live Google. Default true unless BETTER_CHAT_CUT_ENABLE_YOUTUBE_OAUTH_SMOKE=1 */
  fakeProvider?: boolean;
  clientId?: string;
  now?: () => Date;
};

export type ConnectionOnboardingService = {
  getContract: (format?: 'summary' | 'full') => Record<string, unknown>;
  begin: (
    requestId: string,
    request: ConnectionOnboardingRequestV1,
    options?: { openBrowser?: boolean },
  ) => Promise<ConnectionOnboardingSessionV1>;
  status: (sessionId: string) => Promise<ConnectionOnboardingSessionV1 | null>;
  /** Complete with fake tokens or real authorization code (tests / loopback). */
  completeWithCode: (sessionId: string, code: string, state: string) => Promise<ConnectionOnboardingSessionV1>;
  /** Test helper: complete fake provider instantly. */
  completeFake: (sessionId: string) => Promise<ConnectionOnboardingSessionV1>;
  disconnect: (
    connectionId: string,
    options?: { revokeRemote?: boolean; dryRun?: boolean },
  ) => Promise<{ connectionId: string; disconnected: boolean; dryRun: boolean }>;
  listConnections: () => Promise<ConnectionMetadataV1[]>;
  getConnection: (connectionId: string) => Promise<ConnectionMetadataV1 | null>;
  /** Server-only token resolve. */
  resolveTokensForServer: (connectionId: string) => Promise<TokenPayload | null>;
  vault: CredentialVault;
};

function validationRequest(raw: ConnectionOnboardingRequestV1): ConnectionOnboardingRequestV1 {
  if (raw.schemaVersion !== '1.0.0') throw new OnboardingError('ONBOARDING_VALIDATION_FAILED', 'schemaVersion');
  if (raw.platform !== 'youtube') throw new OnboardingError('ONBOARDING_PROVIDER_UNSUPPORTED', 'Only youtube');
  if (!raw.connectionId) throw new OnboardingError('ONBOARDING_VALIDATION_FAILED', 'connectionId required');
  const scopes = filterAllowedScopes(raw.requestedScopes ?? []);
  if ((raw.requestedScopes ?? []).some((s) => !scopes.includes(s))) {
    throw new OnboardingError('ONBOARDING_SCOPE_FORBIDDEN', 'One or more scopes not allowed');
  }
  if (scopes.length === 0) {
    scopes.push('https://www.googleapis.com/auth/youtube.upload');
  }
  return { ...raw, requestedScopes: scopes };
}

export function createConnectionOnboardingService(
  options: ConnectionOnboardingServiceOptions = {},
): ConnectionOnboardingService {
  const vault = options.vault ?? createEncryptedCredentialVault();
  const fake = options.fakeProvider ?? process.env.BETTER_CHAT_CUT_ENABLE_YOUTUBE_OAUTH_SMOKE !== '1';
  const clientId = options.clientId ?? process.env.BETTER_CHAT_CUT_YOUTUBE_OAUTH_CLIENT_ID ?? 'better-chat-cut-dev';
  const now = options.now ?? (() => new Date());
  const sessions = new Map<string, InternalSession>();
  const usedStates = new Set<string>();

  function toPublic(s: InternalSession): ConnectionOnboardingSessionV1 {
    return { ...s.public };
  }

  async function exchangeAndStore(
    internal: InternalSession,
    code: string,
  ): Promise<ConnectionOnboardingSessionV1> {
    internal.public.status = 'exchanging';
    internal.public.updatedAt = now().toISOString();

    let tokens: TokenPayload;
    let channelId: string;
    let channelDisplayName: string | undefined;

    if (fake) {
      tokens = {
        accessToken: `fake-access.${randomUUID()}`,
        refreshToken: `fake-refresh.${randomUUID()}`,
        expiresAt: new Date(now().getTime() + 3600_000).toISOString(),
        tokenType: 'Bearer',
      };
      channelId = internal.public.expectedChannelId ?? `channel.fake.${internal.public.connectionId}`;
      channelDisplayName = 'Fake YouTube Channel';
    } else {
      // Live path: exchange on server only (never renderer). Requires configured client secret env.
      const clientSecret = process.env.BETTER_CHAT_CUT_YOUTUBE_OAUTH_CLIENT_SECRET;
      if (!clientSecret) {
        throw new OnboardingError('ONBOARDING_TOKEN_EXCHANGE_FAILED', 'OAuth client secret not configured');
      }
      const redirectUri = internal.loopback?.redirectUri;
      if (!redirectUri) throw new OnboardingError('ONBOARDING_TOKEN_EXCHANGE_FAILED', 'No redirect URI');
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: internal.codeVerifier,
      });
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) {
        throw new OnboardingError('ONBOARDING_TOKEN_EXCHANGE_FAILED', `Token exchange HTTP ${res.status}`);
      }
      const json = await res.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        scope?: string;
      };
      if (!json.access_token) {
        throw new OnboardingError('ONBOARDING_TOKEN_EXCHANGE_FAILED', 'Missing access_token');
      }
      tokens = {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: json.expires_in
          ? new Date(now().getTime() + json.expires_in * 1000).toISOString()
          : undefined,
        tokenType: json.token_type,
        scope: json.scope,
      };
      channelId = internal.public.expectedChannelId ?? 'unknown';
    }

    if (!vault.encryptionAvailable()) {
      throw new OnboardingError('ONBOARDING_VAULT_UNAVAILABLE', 'Encrypted vault unavailable; refusing plaintext');
    }

    const metadata: ConnectionMetadataV1 = {
      schemaVersion: '1.0.0',
      connectionId: internal.public.connectionId,
      platform: 'youtube',
      channelId,
      channelDisplayName,
      scopes: [],
      status: 'active',
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
      lastAuthenticatedAt: now().toISOString(),
    };
    await vault.put(internal.public.connectionId, tokens, metadata);

    internal.public.status = 'completed';
    internal.public.channel = { id: channelId, displayName: channelDisplayName };
    internal.public.requiresReauthentication = false;
    internal.public.updatedAt = now().toISOString();
    await internal.loopback?.close().catch(() => undefined);
    internal.loopback = undefined;
    return toPublic(internal);
  }

  return {
    vault,
    getContract(format = 'summary') {
      const base = {
        schemaVersion: '1.0.0',
        milestone: 'M7B',
        providers: ['youtube'],
        flow: 'external-browser + loopback + state + PKCE + server token exchange + encrypted vault',
        vault: 'aes-256-gcm',
        tokensInRenderer: false,
        tokensInMcp: false,
        fakeProviderDefault: fake,
      };
      if (format === 'full') {
        return {
          ...base,
          scopesAllowlist: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly',
          ],
          tools: [
            'connection_onboarding_get_contract',
            'connection_onboarding_begin',
            'connection_onboarding_status',
            'connection_onboarding_disconnect',
          ],
        };
      }
      return base;
    },
    async begin(requestId, request, opts) {
      const req = validationRequest(request);
      const sessionId = `onboard.${requestId}.${randomUUID().slice(0, 8)}`;
      const state = generateOAuthState();
      if (usedStates.has(state)) {
        throw new OnboardingError('ONBOARDING_STATE_REPLAY', 'State collision');
      }
      usedStates.add(state);
      const pkce = generatePkcePair();
      const openBrowser = opts?.openBrowser === true;
      let loopback: LoopbackCallbackServer | undefined;
      let redirectUri = 'http://127.0.0.1:0/oauth/callback';
      if (!fake) {
        loopback = await startLoopbackCallbackServer();
        redirectUri = loopback.redirectUri;
      } else {
        // Fake: still prove loopback bind capability in desktop verify; optional
        loopback = await startLoopbackCallbackServer();
        redirectUri = loopback.redirectUri;
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: req.requestedScopes.join(' '),
        state,
        code_challenge: pkce.challenge,
        code_challenge_method: pkce.method,
        access_type: 'offline',
        prompt: 'consent',
      });
      const authorizationUrl = fake
        ? `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}&bcc_fake=1`
        : `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      const publicSession: ConnectionOnboardingSessionV1 = {
        schemaVersion: '1.0.0',
        sessionId,
        connectionId: req.connectionId,
        platform: 'youtube',
        status: 'awaiting-callback',
        authorizationUrl,
        expectedChannelId: req.expectedChannelId,
        requiresReauthentication: false,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
        expiresAt: new Date(now().getTime() + 15 * 60_000).toISOString(),
      };

      const internal: InternalSession = {
        public: publicSession,
        state,
        codeVerifier: pkce.verifier,
        usedStates,
        loopback,
        openBrowser,
      };
      sessions.set(sessionId, internal);

      // Never open browser unless explicitly requested (MCP default false)
      if (openBrowser && !fake) {
        // Deferred: shell.openExternal only from main process IPC if wired later
      }

      // Public session may include state inside authorizationUrl (provider requirement) but never PKCE verifier or tokens.
      const safe = toPublic(internal);
      const serialized = JSON.stringify(safe);
      if (serialized.includes(pkce.verifier)) {
        throw new OnboardingError('ONBOARDING_FORBIDDEN', 'Session view leaked secrets');
      }
      if ('state' in safe || 'codeVerifier' in safe) {
        throw new OnboardingError('ONBOARDING_FORBIDDEN', 'Session view leaked secrets');
      }
      return safe;
    },
    async status(sessionId) {
      const s = sessions.get(sessionId);
      return s ? toPublic(s) : null;
    },
    async completeWithCode(sessionId, code, state) {
      const internal = sessions.get(sessionId);
      if (!internal) throw new OnboardingError('ONBOARDING_SESSION_NOT_FOUND', 'Unknown session');
      if (state !== internal.state) {
        throw new OnboardingError('ONBOARDING_STATE_MISMATCH', 'State validation failed');
      }
      if (internal.public.status === 'completed') {
        throw new OnboardingError('ONBOARDING_STATE_REPLAY', 'Session already completed');
      }
      // Replay prevention: invalidate state after first use
      internal.state = `used.${internal.state}`;
      return exchangeAndStore(internal, code);
    },
    async completeFake(sessionId) {
      const internal = sessions.get(sessionId);
      if (!internal) throw new OnboardingError('ONBOARDING_SESSION_NOT_FOUND', 'Unknown session');
      return exchangeAndStore(internal, 'fake-code');
    },
    async disconnect(connectionId, options) {
      const dryRun = options?.dryRun !== false;
      if (dryRun) {
        const meta = await vault.getMetadata(connectionId);
        return { connectionId, disconnected: Boolean(meta), dryRun: true };
      }
      await vault.delete(connectionId);
      return { connectionId, disconnected: true, dryRun: false };
    },
    async listConnections() {
      return vault.listMetadata();
    },
    async getConnection(connectionId) {
      return vault.getMetadata(connectionId);
    },
    async resolveTokensForServer(connectionId) {
      return vault.resolveTokens(connectionId);
    },
  };
}

export { redactSecrets };
export type { CredentialVault, TokenPayload };
