# Production Workspace review surfaces

Human review UI surfaces bound to exact artifact hashes from production/publishing stages.

| Surface | Source |
|---|---|
| Research | production research review |
| Script | production script review |
| Storyboard | production storyboard review |
| Asset plan / authoring | asset-resolution / asset-authoring stages |
| Scene gallery / revision | scene review stage |
| Timeline | edit-session / timeline stages (opens existing project proposal UI) |
| Delivery | delivery stage / package |
| Metadata / compliance | publishing metadata |
| Thumbnail | publishing thumbnail |
| Package | package-review |
| Release | release-review (no bulk approve) |

Stale reviews: orchestrators invalidate downstream artifacts after revision conflicts; UI reloads fingerprint/revision on save failure.

Editors track dirty state, dry-run before apply, and refuse silent merge on concurrency conflicts.
