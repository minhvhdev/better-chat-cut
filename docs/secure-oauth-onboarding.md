# Secure OAuth onboarding (Better Chat Cut)

YouTube (and similar) connections use:

- External system browser (not embedded WebView login)
- Loopback redirect receiver
- PKCE + state anti-replay
- AES-256-GCM encrypted credential vault at rest
- MCP/status tools never return access/refresh tokens or verifiers

Live Google OAuth is not required for default verification; host tests use fake provider paths that still exercise vault encryption and secrecy.

Desktop-oriented checks: `npm run verify:better-chat-cut-connection-onboarding:desktop`
