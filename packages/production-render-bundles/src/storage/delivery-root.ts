import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function resolveDeliveryRoot(override?: string): string {
  const env = override
    ?? process.env.BETTER_CHAT_CUT_DELIVERY_ROOT
    ?? join(homedir(), '.openchatcut', 'better-chat-cut', 'deliveries');
  return resolve(env);
}
