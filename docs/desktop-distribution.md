# Desktop distribution (M7B)

Better Chat Cut builds installers through the existing Electron / electron-builder pipeline (`desktop/*`, `electron-builder.config.mjs`, `desktop:dist*`).

## Plans

`DesktopDistributionPlanV1` records source commit, clean-tree policy, app version, package-lock and builder-config SHA-256, targets, signing **profile references only**, and update policy.

## Targets

| Platform | Arch | Format (repo default) |
|----------|------|------------------------|
| macOS | arm64, x64 | dmg |
| Windows | x64 | nsis |
| Linux | x64 | AppImage |

Local builds only claim the host/os-arch; cross-platform success is CI-only.

## Signing

Modes: `unsigned` | `sign-when-configured` | `require-signed`. Credentials come from external env (`CSC_LINK`, `CSC_NAME`, Apple notarization vars). Never stored in git or manifests.

## Update policy

`disabled` or `manual-download`. Automatic download/install are explicitly **false**. No update server in M7B.

## Data root

`BETTER_CHAT_CUT_DISTRIBUTION_ROOT` (default `~/.openchatcut/better-chat-cut/distributions`).
