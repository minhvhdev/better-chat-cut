# Connection credential vault (M7B)

Encrypted vault for OAuth access/refresh tokens.

- Cipher: AES-256-GCM
- Layout: under Electron userData-equivalent path or `BETTER_CHAT_CUT_CONNECTION_VAULT_ROOT` (tests only; not a portability mechanism)
- Metadata (`channelId`, status) separate from ciphertext
- Never backed up by default
- Never plaintext token files
