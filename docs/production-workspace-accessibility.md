# Production Workspace accessibility

- Semantic headings and landmarks (nav, main, status, alert)
- Keyboard focus rings (`:focus-visible`)
- Status not color-only (text + badge)
- Dialogs/forms announce errors via `role=alert` / `aria-invalid`
- Progressbars expose `aria-valuenow`
- `prefers-reduced-motion` disables animations
- Responsive collapse of sidebar under 900px

Manual checklist: Tab/Shift+Tab, Enter/Space, Escape, focus return, contrast in theme.
