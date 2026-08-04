export type ConnectionOnboardingRequestV1 = {
  schemaVersion: '1.0.0';
  platform: 'youtube';
  connectionId: string;
  expectedChannelId?: string;
  requestedScopes: string[];
};

export type OnboardingSessionStatus =
  | 'pending'
  | 'awaiting-callback'
  | 'exchanging'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled';

/** Safe session view — never includes state secret, PKCE verifier, or tokens. */
export type ConnectionOnboardingSessionV1 = {
  schemaVersion: '1.0.0';
  sessionId: string;
  connectionId: string;
  platform: 'youtube';
  status: OnboardingSessionStatus;
  authorizationUrl?: string;
  expectedChannelId?: string;
  channel?: { id: string; displayName?: string };
  requiresReauthentication: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  error?: { code: string; message: string };
};

export type ConnectionMetadataV1 = {
  schemaVersion: '1.0.0';
  connectionId: string;
  platform: 'youtube';
  channelId?: string;
  channelDisplayName?: string;
  scopes: string[];
  status: 'active' | 'requires-reauthentication' | 'disconnected';
  createdAt: string;
  updatedAt: string;
  lastAuthenticatedAt?: string;
};

export type ConnectionVaultEntryV1 = {
  schemaVersion: '1.0.0';
  connectionId: string;
  platform: 'youtube';
  /** AES-GCM ciphertext of JSON token payload — never returned to UI/MCP. */
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
  metadata: ConnectionMetadataV1;
};
