# Contributing

Thanks for helping improve Runcraft. Bug reports, ideas and pull requests are all welcome. Please follow the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

You need Node.js 22.18 or newer (the server runs TypeScript directly) and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/thekirankumarv/runcraft.git
cd runcraft
pnpm install
pnpm dev
```

`pnpm dev` runs the server on port 4950 with automatic reload, and the interface on [http://localhost:4951](http://localhost:4951) with hot reload. Open the link printed in the terminal, which includes the access token. On Windows, run `node --watch-path=server server/index.ts --dev --port 4950 --no-open` and `pnpm exec vite` in two terminals.

To try the production build:

```sh
pnpm build
node dist/server/index.js ~/some/project
```

## Project layout

```text
server/          Node.js server and CLI (TypeScript, run directly by Node)
  index.ts       entry point: dashboard or CLI command
  server.ts      HTTP API, WebSocket, static files, security checks
  project.ts     one project: config files, services, start and stop order
  proc.ts        one service process: spawn, logs, health checks, restarts
  system.ts      process trees, CPU and memory, listening ports per platform
  detect.ts      finds runnable things in a project
  env.ts         reads and writes .env files
  git.ts         git status and diffs
  cli.ts         status, start, stop, restart, logs
web/src/         React interface
  components/    views and UI pieces
  lib/           API client, state, log parsing, templates
docs/            user documentation
```

The server uses Node's built-in TypeScript support, so there is no build step in development. Only erasable TypeScript syntax is allowed (no enums or parameter properties), and relative imports use the `.ts` extension.

## Checks

Before opening a pull request:

```sh
pnpm lint      # formatting and type checks
pnpm test      # server tests
pnpm build
```

Run `pnpm format` to fix formatting. CI runs the same checks on macOS, Linux and Windows.

## Guidelines

- Keep the runtime dependency list short. The published package depends only on `ws`, and native modules are off the table, because `npx runcraft` must work without build tools.
- Code should work on macOS, Linux and Windows. Platform-specific code belongs in `server/system.ts`.
- Add a test in `server/*.test.ts` for server logic that is easy to get wrong, such as parsing or ordering.
- Keep comments for explaining why something is done, not what the code does.
- For larger changes, open an issue first so we can agree on the approach.

## Reporting bugs

Open an issue with your operating system, Node.js version, Runcraft version, what you did, what you expected and what happened. Log lines and screenshots help a lot.

For security problems, follow [SECURITY.md](SECURITY.md) instead.
