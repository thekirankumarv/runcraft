# Configuration reference

Runcraft keeps its settings in plain JSON files. Everything can be edited in the UI, but you can also edit the files by hand: changes are picked up immediately, including after a `git pull`.

| File                  | Where            | In git? | Holds                                          |
| --------------------- | ---------------- | ------- | ---------------------------------------------- |
| `runcraft.json`       | Project root     | Yes     | Services, dependencies, profiles               |
| `runcraft.local.json` | Project root     | No      | Your machine's overrides                       |
| `~/.runcraft/`        | Your home folder | No      | Project list, access token, templates, backups |

## runcraft.json

```json
{
  "name": "acme",
  "services": [
    {
      "id": "api",
      "name": "API",
      "cwd": "apps/api",
      "command": "pnpm dev",
      "pre": "pnpm prisma generate",
      "envFile": ".env",
      "env": { "LOG_LEVEL": "debug" },
      "port": 4000,
      "dependsOn": ["db"],
      "health": { "type": "http", "url": "http://localhost:4000/health" },
      "autoRestart": true,
      "watch": ["src/config"],
      "icon": "server",
      "color": "violet",
      "group": "backend"
    }
  ],
  "profiles": { "Frontend": ["web"], "Backend": ["api", "worker"] },
  "envProfiles": ["staging"],
  "editor": "cursor"
}
```

### Project fields

| Field         | Type                    | Description                                                                                 |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `name`        | string                  | Display name. Defaults to the folder name.                                                  |
| `services`    | array                   | The services, described below.                                                              |
| `profiles`    | object of string arrays | Start profiles: a name and the service ids it starts. Dependencies are added automatically. |
| `envProfiles` | string array            | Environment profile names, such as `staging`. See below.                                    |
| `editor`      | string                  | Team default for file links: `vscode`, `cursor`, `windsurf`, `vscode-insiders` or `zed`.    |

### Service fields

| Field         | Type         | Description                                                                                                                                      |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | string       | **Required.** Unique id, used in `dependsOn`, profiles and the CLI.                                                                              |
| `name`        | string       | **Required.** Display name.                                                                                                                      |
| `command`     | string       | **Required.** Shell command. `&&` chains and `VAR=value` prefixes work (on Windows, use `cmd` syntax).                                           |
| `cwd`         | string       | Working directory, relative to the project root. Default `.`.                                                                                    |
| `pre`         | string       | Command to run before `command`, joined with `&&`.                                                                                               |
| `envFile`     | string       | Env file, relative to `cwd`. Edits in the Variables tab are written here.                                                                        |
| `env`         | object       | Extra variables. They override values from `envFile`.                                                                                            |
| `port`        | number       | Sets the `PORT` variable, and is used for health checks, the port link and conflict detection.                                                   |
| `dependsOn`   | string array | Ids of services that must be healthy before this one starts.                                                                                     |
| `health`      | object       | `{ "type": "tcp" }` (default when a port is known), `{ "type": "tcp", "port": 5432 }`, `{ "type": "http", "url": "…" }` or `{ "type": "none" }`. |
| `autoRestart` | boolean      | Restart after a crash, with backoff up to 30 seconds.                                                                                            |
| `watch`       | string array | Paths relative to `cwd`. A change restarts the service. `node_modules`, `.git`, `dist` and `.next` are ignored.                                  |
| `icon`        | string       | `terminal`, `globe`, `server`, `database`, `radio`, `clock`, `cog`, `box`, `zap`, `cloud`, `mail`, `calendar` and more.                          |
| `color`       | string       | `violet`, `blue`, `cyan`, `emerald`, `amber`, `rose`, `pink` or `zinc`. Defaults to a color that matches the icon.                               |
| `requests`    | array        | Saved HTTP requests. Managed from the HTTP tab.                                                                                                  |
| `position`    | `{ x, y }`   | Position on the canvas. Managed by dragging.                                                                                                     |

Every service gets `FORCE_COLOR=1` so tools keep their colored output, and `PORT` when `port` is set.

## Environment profiles

With `"envProfiles": ["staging"]` and the `staging` profile active, a service with `"envFile": ".env"` loads:

1. `.env`
2. `.env.staging`, overriding values from step 1
3. the service's `env` object, overriding both

Edits in the Variables tab go to `.env.staging`. Switch profiles from the top bar, the command palette or `runcraft.local.json`. Switching marks running services with an env file as needing a restart.

## runcraft.local.json

Settings for your machine only. Keep it in `.gitignore`.

```json
{
  "envProfile": "staging",
  "editor": "zed",
  "services": {
    "api": { "port": 4001, "command": "pnpm dev --inspect" }
  }
}
```

| Field        | Description                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `envProfile` | The active environment profile.                                                         |
| `editor`     | Your editor for file links. Overrides the project `editor`.                             |
| `services`   | Per-service overrides. Any service field can be set here and wins over `runcraft.json`. |

When a service has overrides, its Settings tab says so. The form always shows the shared values from `runcraft.json`.

## ~/.runcraft

| File             | Contents                                                      |
| ---------------- | ------------------------------------------------------------- |
| `token`          | The private access token. Delete it to generate a new one.    |
| `projects.json`  | Projects you have opened, for the project menu.               |
| `templates.json` | Your saved templates.                                         |
| `server.json`    | Port and process id of the running Runcraft, used by the CLI. |
| `backups/`       | Copies of `.env` files taken before each edit.                |

Set `RUNCRAFT_HOME` to keep these somewhere else.
