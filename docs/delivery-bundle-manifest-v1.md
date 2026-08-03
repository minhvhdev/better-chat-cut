# Delivery Bundle Manifest v1

Completed bundles live under `bundles/<bundle-id>/` with `video`, SRT/VTT sidecars, QA report, contact sheet, and `manifest.json` written last.

Artifacts carry SHA-256 and same-origin download URLs (`/api/better-chat-cut/deliveries/<bundle-id>/<file>`). Absolute filesystem paths are never exposed. Completed bundles are immutable.
