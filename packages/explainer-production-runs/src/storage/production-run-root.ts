import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function resolveProductionRunRoot(override?: string): string {
  const env = override
    ?? process.env.BETTER_CHAT_CUT_PRODUCTION_RUN_ROOT
    ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'production-runs');
  return resolve(env);
}
