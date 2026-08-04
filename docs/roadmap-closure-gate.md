# Roadmap closure gate (M7B.1)

The roadmap may only close when profile `roadmap-closure` (or a successfully signed `production-release`) produces:

```
roadmapClosed: true
remainingRequiredMilestones: []
```

Computed from validated evidence, never hard-coded.

## Prerequisites

1. Clean git tree; `HEAD` matches `origin/main` (push first).
2. Real current-host package: `npm run verify:better-chat-cut-desktop-distribution:current-host`
3. Launch smoke: `npm run verify:better-chat-cut-desktop-distribution:smoke`
4. Gate: `npm run verify:better-chat-cut-roadmap-closure`

## Policy file

`config/better-chat-cut-roadmap-closure-targets.json` defines required targets (web + current-host desktop). Cross-platform packages remain optional CI evidence.

Signing production installers remains externally gated when credentials are absent.
