/**
 * YouTube publishing adapter.
 *
 * Live network upload is intentionally gated: default tests never call the network.
 * When BETTER_CHAT_CUT_ENABLE_YOUTUBE_SMOKE=1 and a connection resolver supplies
 * credentials via environment, beginUpload may use the Data API resumable session.
 *
 * Without smoke flag, the adapter still provides capability/inspection surfaces and
 * throws capacity errors for upload/release so callers cannot accidentally go live.
 */
import {
  DEFAULT_YOUTUBE_CAPABILITIES,
  publishingDiagnostic,
  type PublishingTargetV1,
} from '../../../../publishing-contracts/src/index.ts';
import { PublishingOperationError } from '../../contracts/publishing-operation-errors.ts';
import type { PublishingPlatformAdapter } from '../publishing-platform-adapter.ts';
import { createEnvPublishingConnectionResolver } from '../../connections/env-connection-resolver.ts';

export function createYouTubePublishingAdapter(options?: {
  connectionResolver?: ReturnType<typeof createEnvPublishingConnectionResolver>;
}): PublishingPlatformAdapter {
  const resolver = options?.connectionResolver ?? createEnvPublishingConnectionResolver();
  const smokeEnabled = process.env.BETTER_CHAT_CUT_ENABLE_YOUTUBE_SMOKE === '1';

  function denyLive(op: string): never {
    throw new PublishingOperationError(
      'PUBLISHING_CONNECTION_CAPABILITY_UNSUPPORTED',
      `Live YouTube ${op} is disabled unless BETTER_CHAT_CUT_ENABLE_YOUTUBE_SMOKE=1 with configured connection`,
      {
        recovery: 'Use FakePublishingPlatformAdapter for tests, or enable the private smoke gate intentionally',
      },
    );
  }

  const adapter: PublishingPlatformAdapter = {
    platform: 'youtube',
    getCapabilities: () => DEFAULT_YOUTUBE_CAPABILITIES,
    async inspectConnection(target: PublishingTargetV1) {
      return resolver.inspect(target);
    },
    async resolveConnection(target) {
      return resolver.resolveForOperation(target);
    },
    async beginUpload() {
      if (!smokeEnabled) denyLive('upload');
      denyLive('upload (smoke adapter not fully wired to network in this build — use fake adapter or extend carefully)');
    },
    async resumeUpload() {
      if (!smokeEnabled) denyLive('resume upload');
      denyLive('resume upload');
    },
    async getUploadStatus() {
      if (!smokeEnabled) denyLive('status');
      denyLive('status');
    },
    async cancelUpload() {
      return { attempted: false, cancelled: false, remoteRetained: true };
    },
    async uploadThumbnail() {
      if (!smokeEnabled) denyLive('thumbnail');
      denyLive('thumbnail');
    },
    async uploadSubtitle() {
      if (!smokeEnabled) denyLive('subtitle');
      denyLive('subtitle');
    },
    async getRemotePublication() {
      if (!smokeEnabled) denyLive('get remote');
      denyLive('get remote');
    },
    async executeRelease() {
      if (!smokeEnabled) denyLive('release');
      denyLive('release');
    },
    async validateRelease() {
      if (!smokeEnabled) denyLive('validate release');
      denyLive('validate release');
    },
    async reconcile() {
      if (!smokeEnabled) denyLive('reconcile');
      denyLive('reconcile');
    },
  };

  void publishingDiagnostic;
  return adapter;
}
