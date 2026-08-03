import {
  DEFAULT_YOUTUBE_CAPABILITIES,
  publishingDiagnostic,
  type PublishingTargetV1,
} from '../../../publishing-contracts/src/index.ts';
import { PublishingOperationError } from '../contracts/publishing-operation-errors.ts';
import type {
  PublishingConnectionInspectionV1,
  ResolvedPublishingConnection,
} from '../contracts/publishing-run.ts';

/**
 * Environment-based connection resolver for personal forks.
 * Never persists tokens under the publishing root.
 *
 * Env:
 * - BETTER_CHAT_CUT_YOUTUBE_CONNECTION_<CONNECTION_ID>_CHANNEL_ID
 * - BETTER_CHAT_CUT_YOUTUBE_CONNECTION_<CONNECTION_ID>_ACCESS_TOKEN (in-memory only during operation)
 * Token env is optional for inspect; required for resolveForOperation live path.
 */
export type PublishingConnectionResolver = {
  inspect(ref: PublishingTargetV1): Promise<PublishingConnectionInspectionV1>;
  resolveForOperation(ref: PublishingTargetV1): Promise<ResolvedPublishingConnection>;
};

function envKeyPart(connectionId: string): string {
  return connectionId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
}

export function createEnvPublishingConnectionResolver(): PublishingConnectionResolver {
  return {
    async inspect(ref) {
      const part = envKeyPart(ref.connectionId);
      const channelId = process.env[`BETTER_CHAT_CUT_YOUTUBE_CONNECTION_${part}_CHANNEL_ID`]
        ?? process.env.BETTER_CHAT_CUT_YOUTUBE_CHANNEL_ID;
      const tokenPresent = Boolean(
        process.env[`BETTER_CHAT_CUT_YOUTUBE_CONNECTION_${part}_ACCESS_TOKEN`]
        ?? process.env.BETTER_CHAT_CUT_YOUTUBE_ACCESS_TOKEN,
      );
      const errors = [];
      if (!channelId) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_CONNECTION_NOT_CONFIGURED', 'YouTube channel not configured for connection', {
          details: { connectionId: ref.connectionId },
          recovery: 'Set BETTER_CHAT_CUT_YOUTUBE_CONNECTION_<ID>_CHANNEL_ID or use fake adapter',
        }));
      }
      if (channelId && ref.expectedChannelId && ref.expectedChannelId !== channelId) {
        errors.push(publishingDiagnostic('error', 'PUBLISHING_CONNECTION_CHANNEL_MISMATCH', 'Expected channel mismatch', {
          details: { expected: ref.expectedChannelId, actual: channelId },
        }));
      }
      if (channelId && !tokenPresent) {
        errors.push(publishingDiagnostic('warning', 'PUBLISHING_CONNECTION_AUTH_REQUIRED', 'Access token not present in environment (ok for inspect-only)'));
      }
      return {
        platform: 'youtube',
        connectionId: ref.connectionId,
        configured: Boolean(channelId),
        authenticated: Boolean(channelId && tokenPresent),
        channel: channelId ? { id: channelId, displayName: process.env.BETTER_CHAT_CUT_YOUTUBE_CHANNEL_NAME } : undefined,
        capabilities: DEFAULT_YOUTUBE_CAPABILITIES,
        errors: errors.filter((e) => e.severity === 'error'),
        warnings: errors.filter((e) => e.severity === 'warning'),
      };
    },
    async resolveForOperation(ref) {
      const inspection = await this.inspect(ref);
      if (!inspection.configured || !inspection.channel) {
        throw new PublishingOperationError('PUBLISHING_CONNECTION_NOT_CONFIGURED', 'Connection not configured');
      }
      if (ref.expectedChannelId && ref.expectedChannelId !== inspection.channel.id) {
        throw new PublishingOperationError('PUBLISHING_CONNECTION_CHANNEL_MISMATCH', 'Channel mismatch');
      }
      // Do not attach actual token values to returned object.
      return {
        platform: 'youtube',
        connectionId: ref.connectionId,
        channelId: inspection.channel.id,
        channelDisplayName: inspection.channel.displayName,
        credentialHandle: Symbol(`youtube-cred:${ref.connectionId}`),
      };
    },
  };
}
