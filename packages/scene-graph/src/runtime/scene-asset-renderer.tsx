import React from 'react';
import {
  getMotionComponent,
  getMotionTheme,
  validateMotionProps,
} from '../../../motion-components/src/index.ts';
import { SandboxedUserMotion } from '../../../motion-components/src/runtime/SandboxedUserMotion.tsx';
import { resolveThemeRegistryId } from '../dependencies/theme-id.ts';
import type { SceneAssetNodeV1 } from '../contracts/scene-node.ts';
import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import { computeSceneRuntimeRevision } from '../schema/scene-schema.ts';

export type SceneAssetRendererProps = {
  scene: SceneDocumentV1;
  node: SceneAssetNodeV1;
  localFrame: number;
  localDurationInFrames: number;
};

function computeFitStyle(
  fit: 'contain' | 'cover' | 'stretch',
  boxW: number,
  boxH: number,
  intrinsicW: number,
  intrinsicH: number,
): React.CSSProperties {
  if (fit === 'stretch') {
    return { width: boxW, height: boxH };
  }
  const scaleX = boxW / Math.max(1, intrinsicW);
  const scaleY = boxH / Math.max(1, intrinsicH);
  const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = intrinsicW * scale;
  const height = intrinsicH * scale;
  return {
    width,
    height,
    position: 'absolute',
    left: (boxW - width) / 2,
    top: (boxH - height) / 2,
  };
}

export function SceneAssetRenderer({
  scene,
  node,
  localFrame,
  localDurationInFrames,
}: SceneAssetRendererProps) {
  void localFrame;
  void localDurationInFrames;
  const definition = getMotionComponent(node.asset.id, node.asset.version);
  const themeId = resolveThemeRegistryId(scene.theme.id);
  const theme = getMotionTheme(themeId) ?? getMotionTheme('default')!;
  if (!definition) {
    return <div style={{ color: '#f88', fontSize: 12 }}>Missing {node.asset.id}</div>;
  }
  const validated = validateMotionProps(
    definition.propsSchema,
    node.asset.props ?? {},
    definition.defaultProps,
  );
  const intrinsicW = definition.preview.width || node.layout.width;
  const intrinsicH = definition.preview.height || node.layout.height;
  const fit = node.fit ?? 'contain';
  const fitStyle = computeFitStyle(fit, node.layout.width, node.layout.height, intrinsicW, intrinsicH);
  const clipId = `scene-clip-${scene.id}-${node.id}-${computeSceneRuntimeRevision()}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const inner = definition.sandboxedBundle
    ? (
      <SandboxedUserMotion
        bundleCode={definition.sandboxedBundle.code}
        componentProps={validated.normalizedProps}
        theme={theme}
      />
    )
    : definition.component
      ? React.createElement(definition.component, { ...validated.normalizedProps, theme } as never)
      : <div style={{ color: '#f88' }}>No component</div>;

  return (
    <div
      style={{
        width: node.layout.width,
        height: node.layout.height,
        position: 'relative',
        overflow: fit === 'cover' ? 'hidden' : 'visible',
      }}
    >
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={node.layout.width} height={node.layout.height} />
          </clipPath>
        </defs>
      </svg>
      <div style={{ ...fitStyle, clipPath: fit === 'cover' ? `url(#${clipId})` : undefined }}>
        {inner}
      </div>
    </div>
  );
}
