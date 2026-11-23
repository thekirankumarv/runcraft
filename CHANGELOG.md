# Changelog

## 0.2.0

- Terminal view with tabs: open shells in the project folder without leaving Runcraft (adds `@lydell/node-pty`)
- Terminals survive page reloads, open in a service's folder, run `package.json` scripts, and toggle with Ctrl+`
- Traffic tab: see the HTTP requests a Node service receives, with headers and bodies, and replay them
- Phone view: scan a QR code to watch and control services from a phone on the same Wi-Fi
- Commit, push, pull and switch branches from Changes, with a background fetch
- Logs view with every service's output in one stream
- Warns when a service is missing variables listed in its `.env.example`
- Lock an environment profile such as `prod` to make its values read-only
- Run script also lists each service folder's `package.json` scripts
- Lock the canvas layout so nodes can't be moved by accident
- Clear all in Problems
- Clearer Start, Stop and Restart buttons on canvas nodes
- Full branch name on hover in Changes
- Fix a blank page when opening a project that has no `runcraft.json` yet

## 0.1.1

- Published from GitHub Actions with npm provenance, so every release can be traced to its source
- README: download and Node.js version badges, changelog link
- Code of conduct and automated dependency updates
- Updated DOMPurify, used by the diff editor, to fix five low-severity advisories

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
