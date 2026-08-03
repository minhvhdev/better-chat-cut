# Diagnostic bundles

`WorkspaceDiagnosticBundleV1` export via Health page or `workspace_export_diagnostics`.

## Included

App version/runtime, health report, redacted run summaries, failed operations, recent diagnostics, data area versions, bundle hash.

## Excluded

Tokens, API keys, absolute paths, project JSON, research/script/storyboard bodies, media bytes, provider raw responses, source code.

## Redaction

Defense in depth: key-name allow/deny, secret regexes, path redaction, max field length.
