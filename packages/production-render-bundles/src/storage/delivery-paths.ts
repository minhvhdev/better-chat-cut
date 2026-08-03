import { join, resolve } from 'node:path';
import { ProductionRenderError } from '../../../production-render-plans/src/contracts/production-render-errors.ts';

export function assertSafeSegment(value: string, label: string): void {
  if (!value || value.includes('..') || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new ProductionRenderError('PRODUCTION_RENDER_PATH_TRAVERSAL', `Unsafe ${label}`, {
      recovery: 'Use opaque ids without path separators',
    });
  }
}

export function assertPathInsideRoot(root: string, target: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + '\\') && !resolvedTarget.startsWith(resolvedRoot + '/')) {
    throw new ProductionRenderError('PRODUCTION_RENDER_PATH_TRAVERSAL', 'Path escapes delivery root', {
      recovery: 'Keep artifacts under BETTER_CHAT_CUT_DELIVERY_ROOT',
    });
  }
}

export function operationDir(root: string, operationId: string): string {
  assertSafeSegment(operationId, 'operationId');
  return join(root, 'operations', operationId);
}

export function bundleDir(root: string, bundleId: string): string {
  assertSafeSegment(bundleId, 'bundleId');
  return join(root, 'bundles', bundleId);
}

export function downloadUrlFor(bundleId: string, fileName: string): string {
  assertSafeSegment(bundleId, 'bundleId');
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new ProductionRenderError('PRODUCTION_RENDER_DOWNLOAD_NOT_ALLOWED', 'Unsafe artifact filename');
  }
  return `/api/better-chat-cut/deliveries/${encodeURIComponent(bundleId)}/${encodeURIComponent(fileName)}`;
}
