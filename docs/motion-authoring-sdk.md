# Motion Authoring SDK

Package: `packages/motion-authoring-sdk` (`@better-chat-cut/motion-sdk`).

## Allowed imports

Authored `index.tsx` may import only:

```ts
@better-chat-cut/motion-sdk
```

## Exports

- `defineMotionComponent`
- `useMotionFrame`
- `useMotionVideoConfig`
- `interpolate`, `spring`, `clamp`, `mapRange`, `mix`
- `resolveThemeColor`

No Node/FS/network/Remotion full surface.

## Template

```tsx
import {
  defineMotionComponent,
  useMotionFrame,
  useMotionVideoConfig,
  interpolate,
  resolveThemeColor,
} from "@better-chat-cut/motion-sdk";

type Props = { radius: number; fill: string };

export const Example = defineMotionComponent<Props>(function Example(props, context) {
  const frame = useMotionFrame();
  const { durationInFrames } = useMotionVideoConfig();
  const t = interpolate(frame, [0, durationInFrames - 1], [0, 1]);
  const fill = props.fill || resolveThemeColor(context.theme, "colors.accent", "#38bdf8");
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Example">
      <circle cx="50" cy="50" r={props.radius * t} fill={fill} />
    </svg>
  );
});
```

Export name must match `manifest.implementation.exportName`.

Limits: source ≤ 128KiB, bundle ≤ 512KiB. Animation must be frame-driven (no `Date` / `Math.random` / timers).
