import type { AssetCompositionResolvedPartV1 } from '../../../asset-resolver/src/index.ts';
import { SceneDraftError, draftDiagnostic } from '../contracts/scene-draft-errors.ts';
import type { AssetPlanCompositionPartPlacementOverrideV1 } from '../contracts/asset-plan-composition-spec.ts';

export const ROW_COLUMN_GAP = 0.04;

export type NormalizedBox = { x: number; y: number; width: number; height: number };

function isLabelPart(part: AssetCompositionResolvedPartV1): boolean {
  const role = (part.role ?? '').toLowerCase();
  const tags = [
    role,
    part.selection.asset.kind,
    part.selection.asset.name.toLowerCase(),
    part.partId.toLowerCase(),
  ];
  return tags.some((t) => t.includes('label') || t === 'ui' || t.includes('caption') || t.includes('title'));
}

export function resolvePartNormalizedBox(input: {
  layoutHint: 'overlay' | 'row' | 'column' | 'labelled' | 'radial' | 'custom';
  parts: AssetCompositionResolvedPartV1[];
  part: AssetCompositionResolvedPartV1;
  override?: AssetPlanCompositionPartPlacementOverrideV1;
}): NormalizedBox {
  if (input.override?.normalizedBox) {
    return validateNormalizedBox(input.override.normalizedBox, input.part.partId);
  }
  if (input.part.normalizedBox) {
    return validateNormalizedBox(input.part.normalizedBox, input.part.partId);
  }

  const sorted = [...input.parts].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.partId.localeCompare(b.partId);
  });
  const index = sorted.findIndex((p) => p.partId === input.part.partId);
  if (index < 0) {
    throw new SceneDraftError('SCENE_COMPOSITION_PART_NOT_FOUND', `Part ${input.part.partId} not found`);
  }

  switch (input.layoutHint) {
    case 'overlay':
      return { x: 0, y: 0, width: 1, height: 1 };
    case 'row': {
      const n = sorted.length;
      const usable = 1 - ROW_COLUMN_GAP * Math.max(0, n - 1);
      const width = usable / n;
      return { x: index * (width + ROW_COLUMN_GAP), y: 0, width, height: 1 };
    }
    case 'column': {
      const n = sorted.length;
      const usable = 1 - ROW_COLUMN_GAP * Math.max(0, n - 1);
      const height = usable / n;
      return { x: 0, y: index * (height + ROW_COLUMN_GAP), width: 1, height };
    }
    case 'labelled': {
      const labels = sorted.filter(isLabelPart);
      const bodies = sorted.filter((p) => !isLabelPart(p));
      if (labels.length !== 1 || bodies.length !== 1) {
        throw new SceneDraftError(
          'SCENE_COMPOSITION_LAYOUT_REQUIRED',
          'labelled layout requires exactly one label part and one body part, or explicit normalizedBox overrides',
          {
            diagnostics: [
              draftDiagnostic(
                'error',
                'SCENE_COMPOSITION_LAYOUT_REQUIRED',
                'Ambiguous labelled layout; provide partOverrides.normalizedBox',
                { requirementId: input.part.partId },
              ),
            ],
            recovery: 'Provide normalizedBox overrides for each part',
          },
        );
      }
      if (isLabelPart(input.part)) {
        return { x: 0.1, y: 0.76, width: 0.8, height: 0.18 };
      }
      return { x: 0, y: 0, width: 1, height: 0.72 };
    }
    case 'radial':
    case 'custom':
      throw new SceneDraftError(
        'SCENE_COMPOSITION_LAYOUT_REQUIRED',
        `${input.layoutHint} layout requires normalizedBox for every part`,
        {
          recovery: 'Set part.normalizedBox or partOverrides.normalizedBox',
          details: { partId: input.part.partId },
        },
      );
    default:
      throw new SceneDraftError('SCENE_COMPOSITION_LAYOUT_REQUIRED', `Unknown layoutHint ${String(input.layoutHint)}`);
  }
}

export function validateNormalizedBox(box: NormalizedBox, partId: string): NormalizedBox {
  const { x, y, width, height } = box;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new SceneDraftError('SCENE_COMPOSITION_INVALID_NORMALIZED_BOX', `Invalid box for ${partId}`);
  }
  if (width <= 0 || height <= 0) {
    throw new SceneDraftError('SCENE_COMPOSITION_INVALID_NORMALIZED_BOX', `Box size must be > 0 for ${partId}`);
  }
  if (x < 0 || y < 0 || x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
    throw new SceneDraftError('SCENE_COMPOSITION_INVALID_NORMALIZED_BOX', `Box out of 0..1 bounds for ${partId}`);
  }
  return box;
}

export function convertNormalizedBoxToLayout(
  groupLayout: { x: number; y: number; width: number; height: number },
  box: NormalizedBox,
): { x: number; y: number; width: number; height: number } {
  return {
    x: box.x * groupLayout.width,
    y: box.y * groupLayout.height,
    width: box.width * groupLayout.width,
    height: box.height * groupLayout.height,
  };
}
