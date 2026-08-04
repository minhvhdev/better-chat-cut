# Secure OAuth onboarding (M7B)

YouTube / Google OAuth for publishing connections.

## Flow

1. UI or MCP starts onboarding with opaque `connectionId`.
2. Server generates `state` + PKCE verifier/challenge.
3. Loopback callback binds **127.0.0.1 only**.
4. Authorization URL targets system browser (not the privileged Electron renderer).
5. Callback validates state (replay rejected).
6. Authorization code exchanged **server-side**.
7. Tokens stored in AES-256-GCM vault; UI/MCP receive metadata only.

## Security

- No tokens in renderer, MCP responses, logs, or diagnostics.
- Scope allowlist enforced; arbitrary scopes rejected.
- Disconnect supports dry-run (default) and revoke metadata.

## Dev

Fake provider is default. Set `BETTER_CHAT_CUT_ENABLE_YOUTUBE_OAUTH_SMOKE=1` and client credentials for live smoke.
