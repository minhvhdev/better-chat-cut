import { registerBuiltInAnimations } from './animations/index.ts';
import { registerBuiltInComponents } from './components/index.ts';
import { registerBuiltInThemes } from './themes/index.ts';

let booted = false;

/** Register built-in themes, animations, and React/SVG components. */
export function ensureBetterChatCutMotionRuntime(): void {
  if (booted) return;
  registerBuiltInThemes();
  registerBuiltInAnimations();
  registerBuiltInComponents();
  booted = true;
}
