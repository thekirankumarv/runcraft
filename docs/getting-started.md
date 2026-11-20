# Getting started

## Requirements

- Node.js 20.11 or newer
- macOS or Linux. Windows support is new and less tested.
- Git, if you want to use the Changes view

## Install

Run it once without installing:

```sh
npx runcraft
```

Or install it globally so the `runcraft` command is always available:

```sh
npm install -g runcraft
# or
pnpm add -g runcraft
```

## First run

From your project folder:

```sh
runcraft
```

You can also point it at a folder:

```sh
runcraft ~/code/my-app
```

Runcraft starts a small local server, prints a link like `http://127.0.0.1:4949/?t=…` and opens it in your browser. The `t=` part is a private access token. Keep the link to yourself.

| Option       | What it does                                                                          |
| ------------ | ------------------------------------------------------------------------------------- |
| `--port <n>` | Use a specific port. By default Runcraft uses 4949, or the next free port up to 4960. |
| `--no-open`  | Do not open the browser automatically.                                                |

## Add your services

The first time you open a project, Runcraft scans it for things it can run:

- `package.json` scripts such as `dev`, `start` or `serve`, including workspaces in a monorepo. The package manager is picked from your lockfile.
- `Procfile` and `Procfile.dev`
- `docker-compose.yml` and `compose.yaml` services
- `Makefile` targets such as `dev` or `run`
- Django (`manage.py`), Rails (`bin/rails`), Go (`go.mod`) and Rust (`Cargo.toml`)

Tick the ones you want and press **Add**. If nothing is detected, or you need something else, use **Add service** in the bottom left:

- **Detected**: the scan results.
- **Templates**: ready-made setups for common tools, plus any templates you saved.
- **Custom**: any shell command.

Each service has a name, a command and a working directory. Setting a **port** is optional, but it enables health checks, the port link and conflict detection. If you leave it empty, Runcraft picks up the port from the service's logs when it prints something like `http://localhost:3000`.

## Connect services

Drag from the right edge of one service to the left edge of another to make the second depend on the first. When you start a service, its dependencies start first and Runcraft waits until they are healthy. To remove a dependency, select the line and press <kbd>Backspace</kbd>.

Press **Arrange** to lay the canvas out automatically.

## Start and stop

- **Start all** in the top right starts everything in dependency order. The arrow next to it lets you start a profile or pick services.
- Each card has its own start, stop and restart buttons.
- Click a card to open its panel with logs, variables, the HTTP client and settings.

Stopping always stops dependents before the services they rely on, and kills each service's whole process tree so ports are freed.

## Share the setup

Everything is saved to `runcraft.json` in your project root. Commit it and teammates get the same canvas by running `npx runcraft`.

Personal settings live in `runcraft.local.json`. Add it to `.gitignore`; **Settings → Personal overrides** can do that for you.

## Next steps

- [Features guide](features.md)
- [Configuration reference](configuration.md)
- [Command line](cli.md)
