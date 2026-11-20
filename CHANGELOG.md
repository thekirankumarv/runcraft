# Changelog

## 0.1.1

- Published from GitHub Actions with npm provenance, so every release can be traced to its source
- README: download and Node.js version badges, changelog link
- Code of conduct and automated dependency updates

## 0.1.0

First release.

- Canvas of services with dependency lines, auto-arrange and live status
- Dependency-ordered start and stop, with health checks and process tree cleanup
- Logs with level filters, search, folded stack traces and editor links
- Overview dashboard with CPU, memory, uptime and crash counts
- Problems view that groups errors across services
- Environment variable editor that writes back to `.env` files, with environment profiles
- Git changes view with side-by-side diffs and in-place editing
- HTTP client with saved requests
- Ports view with one-click kill, and port conflict detection
- Start profiles, templates and personal overrides in `runcraft.local.json`
- Auto-restart on crash and restart on file change
- Command palette, light and dark themes, crash notifications
- CLI: `status`, `start`, `stop`, `restart`, `logs -f`
