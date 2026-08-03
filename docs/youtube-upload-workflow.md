# YouTube Upload Workflow

1. Package approved
2. Connection preflight (channel match)
3. Private resumable video upload — remote id persisted immediately when known
4. Processing poll (once per resume)
5. Thumbnail + caption upload
6. Remote snapshot vs local package verification
7. Release review → visibility/schedule

Uncertain outcomes force `reconciliation-required` (no auto duplicate upload). Live tests never run unless `BETTER_CHAT_CUT_ENABLE_YOUTUBE_SMOKE=1`.
