import {
  MOTION_COMPILER_VERSION,
  MOTION_RUNTIME_CONTRACT_VERSION,
  MOTION_SANDBOX_CONTRACT_VERSION,
  MOTION_SDK_VERSION,
  MOTION_SOURCE_PIPELINE_VERSION,
} from '../constants.ts';

const SOURCE_TEMPLATE = `import {
  defineMotionComponent,
  useMotionFrame,
  useMotionVideoConfig,
  interpolate,
  resolveThemeColor,
} from "@better-chat-cut/motion-sdk";

type Props = {
  bodyRadius: number;
  orbitRadius: number;
  fill: string;
  orbitColor: string;
};

export const OrbitingBody = defineMotionComponent<Props>(
  function OrbitingBody(props, context) {
    const frame = useMotionFrame();
    const { durationInFrames } = useMotionVideoConfig();
    const angle = interpolate(frame, [0, durationInFrames - 1], [0, 360]);
    const cx = 300 + props.orbitRadius * Math.cos((angle * Math.PI) / 180);
    const cy = 300 + props.orbitRadius * Math.sin((angle * Math.PI) / 180);
    const fill = props.fill || resolveThemeColor(context.theme, "colors.accent", "#38bdf8");
    return (
      <svg viewBox="0 0 600 600" role="img" aria-label="Orbiting body">
        <circle cx="300" cy="300" r={props.orbitRadius} fill="none" stroke={props.orbitColor} strokeWidth="2" />
        <circle cx={cx} cy={cy} r={props.bodyRadius} fill={fill} />
      </svg>
    );
  }
);
`;

export function getMotionSourceContract(format: 'summary' | 'full' = 'summary') {
  const summary = {
    schemaVersion: '1.0.0',
    sdkVersion: MOTION_SDK_VERSION,
    sdkContractVersion: MOTION_SOURCE_PIPELINE_VERSION,
    compilerVersion: MOTION_COMPILER_VERSION,
    sandboxContractVersion: MOTION_SANDBOX_CONTRACT_VERSION,
    runtimeContractVersion: MOTION_RUNTIME_CONTRACT_VERSION,
    allowedImports: ['@better-chat-cut/motion-sdk'],
    allowedSdkExports: [
      'defineMotionComponent',
      'useMotionFrame',
      'useMotionVideoConfig',
      'interpolate',
      'spring',
      'clamp',
      'mapRange',
      'mix',
      'resolveThemeColor',
    ],
    bannedApis: [
      'Date', 'Math.random', 'performance.now', 'crypto', 'fetch', 'eval', 'Function',
      'require', 'import()', 'process', 'fs', 'network', 'localStorage', 'document', 'window',
    ],
    sizeLimits: {
      sourceBytes: 128 * 1024,
      bundleBytes: 512 * 1024,
    },
    rules: [
      'Single file index.tsx',
      'One named export matching manifest.implementation.exportName',
      'defineMotionComponent entry required',
      'Frame-driven animation only',
      'SVG/React only; no DOM mutation, no event handlers',
    ],
  };
  if (format === 'summary') return summary;
  return {
    ...summary,
    sourceTemplate: SOURCE_TEMPLATE,
    exampleComponent: SOURCE_TEMPLATE,
  };
}

export { SOURCE_TEMPLATE };
