# Desktop distribution service (M7B)

Plans and records desktop distribution operations using existing `electron-builder.config.mjs` and `desktop:*` scripts.

- Capability registry mirrors current repo targets (mac dmg arm64/x64, win nsis x64, linux AppImage x64)
- Signing via external env profile references only
- Update policy fixed to disabled / manual-download
- Development operations write hashable stub artifacts under `BETTER_CHAT_CUT_DISTRIBUTION_ROOT`
- Real installers via CI matrix / `npm run desktop:dist:*`
