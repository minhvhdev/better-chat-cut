import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function resolvePublishingRoot(override?: string): string {
  const env = override
    ?? process.env.BETTER_CHAT_CUT_PUBLISHING_ROOT
    ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'publishing');
  return resolve(env);
}
