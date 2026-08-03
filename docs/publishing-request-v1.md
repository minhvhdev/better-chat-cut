# Publishing Request V1

Purpose: start a publishing workflow from a **completed** M6A production delivery (never mutates the delivery bundle or OpenChatCut project).

## Fields

- `id` — lowercase pattern `publish.topic-name`
- `source.productionRunId`, `source.bundleId`, `source.deliveryManifestHash`
- `target.platform` = `youtube`, opaque `connectionId`, optional `expectedChannelId`
- `release.desiredVisibility`, `release.mode` (`manual` | `immediate` | `scheduled`)
- `subtitles` upload policy
- `workflow` partial override of review/upload flags

## Forbidden

Access tokens, refresh tokens, arbitrary platform URLs/headers, absolute paths, remote video URLs as source of truth.

## Related

See also publishing-run-v1.md and youtube-upload-workflow.md.
