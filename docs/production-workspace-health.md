# Production Workspace health

## Modes

- **quick** — roots, integrity sample, locks, runtime node, migrations pending, credentials policy
- **deep** — quick + non-expensive deep probe (no full MP4 render)

## Categories

runtime, storage, data-integrity, operations, projects, render, publishing, credentials, migrations, desktop

## Data roots

Production runs, publishing, scene drafts, deliveries, migrations (logical status only — no absolute paths in UI).

## Policy

Read-only by default. No automatic repair or lock deletion. Recovery text guides manual safe actions.
