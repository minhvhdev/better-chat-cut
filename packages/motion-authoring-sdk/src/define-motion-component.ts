import type { ReactNode } from 'react';
import type { MotionRenderContext, MotionThemeTokens } from './contracts.ts';

export type MotionComponentProps<P extends Record<string, unknown>> = P & {
  theme?: MotionThemeTokens;
};

/**
 * Wrap an authored render function as a React functional component.
 * Hooks used inside `render` run under this wrapper (Rules of Hooks).
 */
export function defineMotionComponent<P extends Record<string, unknown>>(
  render: (props: P, context: MotionRenderContext) => ReactNode,
): (props: MotionComponentProps<P>) => ReactNode {
  const name = render.name || 'MotionComponent';
  function DefinedMotionComponent(allProps: MotionComponentProps<P>): ReactNode {
    const { theme, ...rest } = allProps;
    return render(rest as P, { theme });
  }
  Object.defineProperty(DefinedMotionComponent, 'name', { value: name });
  return DefinedMotionComponent;
}
