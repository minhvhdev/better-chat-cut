/**
 * Combines encrypted vault metadata with existing env-based connection resolver.
 * Tokens never leak into inspection responses.
 */
import {
  createEncryptedCredentialVault,
  type CredentialVault,
} from '../../../secure-connection-onboarding/src/index.ts';
import {
  createEnvPublishingConnectionResolver,
  type PublishingConnectionResolver,
} from './env-connection-resolver.ts';
import type { PublishingTargetV1 } from '../../../publishing-contracts/src/index.ts';

export function createVaultAwarePublishingConnectionResolver(
  vault: CredentialVault = createEncryptedCredentialVault(),
): PublishingConnectionResolver {
  const envResolver = createEnvPublishingConnectionResolver();
  return {
    async inspect(ref: PublishingTargetV1) {
      const meta = await vault.getMetadata(ref.connectionId);
      if (meta?.status === 'active' && meta.channelId) {
        return {
          platform: 'youtube',
          connectionId: ref.connectionId,
          configured: true,
          authenticated: true,
          channel: { id: meta.channelId, displayName: meta.channelDisplayName },
          capabilities: (await envResolver.inspect(ref)).capabilities,
          errors: [],
          warnings: [],
        };
      }
      if (meta?.status === 'requires-reauthentication') {
        const base = await envResolver.inspect(ref);
        return {
          ...base,
          configured: Boolean(meta.channelId) || base.configured,
          authenticated: false,
          channel: meta.channelId
            ? { id: meta.channelId, displayName: meta.channelDisplayName }
            : base.channel,
          warnings: [
            ...base.warnings,
            {
              severity: 'warning' as const,
              code: 'PUBLISHING_CONNECTION_REAUTH',
              message: 'Restored connection requires interactive OAuth reauthentication',
            },
          ],
        };
      }
      return envResolver.inspect(ref);
    },
    async resolveForOperation(ref: PublishingTargetV1) {
      const tokens = await vault.resolveTokens(ref.connectionId);
      const meta = await vault.getMetadata(ref.connectionId);
      if (tokens && meta?.channelId) {
        return {
          platform: 'youtube' as const,
          connectionId: ref.connectionId,
          channelId: meta.channelId,
          channelDisplayName: meta.channelDisplayName,
          credentialHandle: Symbol(`youtube-vault:${ref.connectionId}`),
        };
      }
      return envResolver.resolveForOperation(ref);
    },
  };
}
