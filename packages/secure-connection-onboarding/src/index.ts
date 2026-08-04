export type { OnboardingErrorCode, OnboardingDiagnostic } from './contracts/onboarding-errors.ts';
export { OnboardingError } from './contracts/onboarding-errors.ts';
export type {
  ConnectionOnboardingRequestV1,
  OnboardingSessionStatus,
  ConnectionOnboardingSessionV1,
  ConnectionMetadataV1,
  ConnectionVaultEntryV1,
} from './contracts/onboarding-types.ts';
export {
  createEncryptedCredentialVault,
  createFakeCredentialVault,
  redactSecrets,
  type CredentialVault,
  type TokenPayload,
} from './vault/credential-vault.ts';
export { generateOAuthState, generatePkcePair, filterAllowedScopes, YOUTUBE_ALLOWED_SCOPES } from './oauth/oauth-pkce.ts';
export { startLoopbackCallbackServer } from './oauth/oauth-loopback-server.ts';
export {
  createConnectionOnboardingService,
  type ConnectionOnboardingService,
  type ConnectionOnboardingServiceOptions,
} from './service/connection-onboarding-service.ts';
