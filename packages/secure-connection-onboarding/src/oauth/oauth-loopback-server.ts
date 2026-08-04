import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { OnboardingError } from '../contracts/onboarding-errors.ts';

export type LoopbackCallbackResult = {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
};

export type LoopbackCallbackServer = {
  port: number;
  redirectUri: string;
  waitForCallback: (timeoutMs?: number) => Promise<LoopbackCallbackResult>;
  close: () => Promise<void>;
};

/**
 * Binds exclusively to 127.0.0.1 (loopback). Never 0.0.0.0.
 */
export async function startLoopbackCallbackServer(options?: {
  path?: string;
}): Promise<LoopbackCallbackServer> {
  const callbackPath = options?.path ?? '/oauth/callback';
  let resolveCb: ((r: LoopbackCallbackResult) => void) | null = null;
  let rejected = false;
  const resultPromise = new Promise<LoopbackCallbackResult>((resolve) => {
    resolveCb = resolve;
  });

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const host = `http://127.0.0.1`;
      const url = new URL(req.url ?? '/', host);
      if (url.pathname !== callbackPath) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const result: LoopbackCallbackResult = {
        code: url.searchParams.get('code') ?? undefined,
        state: url.searchParams.get('state') ?? undefined,
        error: url.searchParams.get('error') ?? undefined,
        errorDescription: url.searchParams.get('error_description') ?? undefined,
      };
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body><p>Authorization complete. You can close this window.</p></body></html>');
      if (resolveCb) {
        resolveCb(result);
        resolveCb = null;
      }
    } catch {
      res.statusCode = 500;
      res.end('error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new OnboardingError('ONBOARDING_TOKEN_EXCHANGE_FAILED', 'Loopback server failed to bind');
  }
  const port = addr.port;
  // Hard guarantee: address family is loopback
  if (addr.address !== '127.0.0.1' && addr.address !== '::1' && addr.address !== '::ffff:127.0.0.1') {
    server.close();
    throw new OnboardingError('ONBOARDING_FORBIDDEN', 'Callback server must bind loopback only');
  }

  return {
    port,
    redirectUri: `http://127.0.0.1:${port}${callbackPath}`,
    waitForCallback(timeoutMs = 120_000) {
      return Promise.race([
        resultPromise,
        new Promise<LoopbackCallbackResult>((_, reject) => {
          setTimeout(() => {
            if (!rejected) {
              rejected = true;
              reject(new OnboardingError('ONBOARDING_SESSION_EXPIRED', 'OAuth callback timed out'));
            }
          }, timeoutMs).unref?.();
        }),
      ]);
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
