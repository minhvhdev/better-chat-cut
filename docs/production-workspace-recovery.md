# Production Workspace recovery

| Situation | Guidance |
|---|---|
| Revision / fingerprint conflict | Reload run; copy local unsaved JSON; re-apply |
| Missing / corrupt artifact | Health integrity warn; fix via known orchestrator tools; no auto-repair |
| Stale lock | Report only until process absence + user confirm (M7A does not auto-clear) |
| TTS / render wait | Resume after restart; no duplicate external ops when orchestrator receipt replay works |
| Uncertain upload | Reconciliation stage; resume/reconcile via publishing commands |
| Migration failure | Original data preserved; use backup id from receipt |
| Cancel | Explicit cancel command; dry-run preview first |
