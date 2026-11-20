# Security

Runcraft starts processes on your machine, so it is built to be reachable only by you.

## How Runcraft protects you

- **Local only.** The server listens on `127.0.0.1`. Other machines on your network cannot connect to it.
- **Access token.** Every API and WebSocket request needs a random token, generated on first run and stored in `~/.runcraft/token`. On macOS and Linux the file is readable only by your user. The link printed at startup contains it.
- **No cross-site access.** Requests must come from Runcraft's own address. Requests from other websites, and DNS rebinding attempts that point a domain at `127.0.0.1`, are rejected.
- **No framing.** The dashboard cannot be embedded in another site.
- **Files stay in the project.** The Changes view only reads and writes files inside the project's git repository.
- **Backups.** Every `.env` edit is preceded by a backup in `~/.runcraft/backups`.
- **Small dependency surface.** The published package has one runtime dependency (`ws`). The interface is prebuilt, so nothing is compiled or downloaded during install.

## What you should know

- `runcraft.json` contains shell commands, just like `package.json` scripts. Opening a project never runs anything, but pressing Start does. Review `runcraft.json` before starting services in a repository you do not trust.
- Anyone who has your token and can reach `127.0.0.1` on your machine can control Runcraft. Do not share the startup link. Delete `~/.runcraft/token` to rotate it.
- Values in the Variables tab are masked on screen, but they are stored in plain text in your `.env` files, as usual.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through [GitHub security advisories](https://github.com/thekirankumarv/runcraft/security/advisories/new). You will get a response within a few days, and a fix will be released as soon as possible with credit to you, unless you prefer otherwise.
