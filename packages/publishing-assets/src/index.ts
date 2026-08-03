/**
 * Thin packaging/thumbnail surface re-exporting orchestrator helpers.
 * Physical renders use scene preview / Remotion (BetterChatCutThumbnailStill).
 */
export {
  buildThumbnailScene,
  buildPublishingPackage,
  validateThumbnailPlan,
  validatePublishingPackage,
  computePublishingPackageHash,
  type ThumbnailPlanV1,
  type PublishingPackageV1,
} from '../../publishing-contracts/src/index.ts';

export type ThumbnailQaResultV1 = {
  valid: boolean;
  dimensionsValid: boolean;
  formatValid: boolean;
  byteLengthValid: boolean;
  fullyTransparent: boolean;
  mostlyBlank: boolean;
  textChecks: {
    overlayId: string;
    withinSafeArea: boolean;
    textNonEmpty: boolean;
    fontSizeValid: boolean;
    estimatedContrast?: number;
  }[];
  errors: { severity: string; code: string; message: string }[];
  warnings: { severity: string; code: string; message: string }[];
};

export function evaluateThumbnailQa(input: {
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  byteLength: number;
  fullyTransparent?: boolean;
  overlays?: {
    id: string;
    type: 'label' | 'shape';
    text?: string;
    fontSize?: number;
    box: { x: number; y: number; width: number; height: number };
  }[];
  safeArea?: { top: number; right: number; bottom: number; left: number };
}): ThumbnailQaResultV1 {
  const safe = input.safeArea ?? { top: 40, right: 40, bottom: 40, left: 40 };
  const errors: ThumbnailQaResultV1['errors'] = [];
  const dimensionsValid = input.width === input.expectedWidth && input.height === input.expectedHeight;
  if (!dimensionsValid) errors.push({ severity: 'error', code: 'PUBLISHING_THUMBNAIL_QA_FAILED', message: 'dimensions mismatch' });
  const byteLengthValid = input.byteLength > 0;
  if (!byteLengthValid) errors.push({ severity: 'error', code: 'PUBLISHING_THUMBNAIL_QA_FAILED', message: 'empty bytes' });
  if (input.fullyTransparent) errors.push({ severity: 'error', code: 'PUBLISHING_THUMBNAIL_QA_FAILED', message: 'fully transparent' });
  const textChecks = (input.overlays ?? []).filter((o) => o.type === 'label').map((o) => {
    const within = o.box.x >= safe.left
      && o.box.y >= safe.top
      && o.box.x + o.box.width <= input.width - safe.right
      && o.box.y + o.box.height <= input.height - safe.bottom;
    const textNonEmpty = Boolean(o.text?.trim());
    const fontSizeValid = (o.fontSize ?? 0) >= 18;
    if (!within || !textNonEmpty || !fontSizeValid) {
      errors.push({ severity: 'error', code: 'PUBLISHING_THUMBNAIL_QA_FAILED', message: `label ${o.id} failed` });
    }
    return { overlayId: o.id, withinSafeArea: within, textNonEmpty, fontSizeValid };
  });
  return {
    valid: errors.length === 0,
    dimensionsValid,
    formatValid: true,
    byteLengthValid,
    fullyTransparent: Boolean(input.fullyTransparent),
    mostlyBlank: false,
    textChecks,
    errors,
    warnings: [],
  };
}
