# Secure connection onboarding (M7B)

YouTube OAuth onboarding for Better Chat Cut personal fork:

- External browser auth URL (UI may open; MCP defaults `openBrowser: false`)
- Loopback callback on `127.0.0.1` only
- State validation + replay prevention
- PKCE S256
- Server-side token exchange
- AES-256-GCM encrypted credential vault
- Metadata-only to UI/MCP
