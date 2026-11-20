# Troubleshooting

## The page says "Open Runcraft from your terminal"

Open the full link printed in the terminal, including `?t=…`. Runcraft remembers the token in that browser afterwards. If you lost the link, run `runcraft` again: if it is already running, it prints the link and opens it.

## "Port 4949 is in use"

Runcraft tries ports 4949 to 4960 and uses the first free one. If you passed `--port`, that exact port must be free. Check what is using it in another Runcraft window's **Ports** view, or with `lsof -i :4949` (macOS, Linux) or `netstat -ano | findstr 4949` (Windows).

## A service says "Port busy"

Another process is already listening on the service's port, often a leftover from an earlier run. The card shows which process. Press **Kill & start**, or free it from the **Ports** view.

## A service stays in "Starting"

Runcraft is waiting for the health check to pass:

- With a port set, it waits until the port accepts connections. Make sure the app listens on the same port. Many frameworks read `PORT`, which Runcraft sets; others need the port passed explicitly.
- With an HTTP health check, the URL must return a status below 500.
- If the service has no port, such as a worker, set **Health check** to **None**.

Dependents wait up to two minutes for a dependency to become healthy, then give up with an error in the logs.

## A service crashes immediately

Open its **Logs** tab: the command, the output and the exit code are all there, and errors are listed under **Problems**. Common causes:

- Wrong working directory. Check **Settings → Working directory**, which is relative to the project root.
- The command is not on your `PATH`. Runcraft runs commands in your system shell with the environment you started it from.
- A missing variable. Check the **Variables** tab and the active environment profile.

## My changes to a service are not applied

Commands, ports, env files and environment variables only apply when a service starts. A **Changes pending** badge appears on running services. Press **Restart to apply**.

## Processes keep running after I close Runcraft

Runcraft stops every service when it exits normally, including after <kbd>Ctrl+C</kbd>. If it is killed forcefully, its services may keep running. Free their ports from the **Ports** view the next time you start Runcraft.

## CPU, memory or the Ports view are empty

Runcraft reads process information from:

- macOS and Linux: `ps`, plus `lsof` for ports. On Linux without `lsof` it falls back to `ss` from iproute2.
- Windows: PowerShell for CPU and memory, `netstat` and `tasklist` for ports.

Install the missing tool, or make sure it is on your `PATH`. On Linux, ports owned by other users only show a process name when you have permission to see them.

## File links open the wrong editor

Choose your editor in **Settings → Editor**. It is saved in `runcraft.local.json`, so it only affects you.

## The Changes view says "Not a git repository"

The project folder needs to be a git repository with `git` on your `PATH`.

## The CLI says Runcraft is not running

`runcraft status`, `start`, `stop`, `restart` and `logs` control the running dashboard. Start it first with `runcraft` in another terminal. If you set `RUNCRAFT_HOME`, use the same value for both.

## Resetting Runcraft

Everything Runcraft stores outside your projects lives in `~/.runcraft`. Delete that folder to start fresh. Your `runcraft.json` files are not affected.

## Still stuck?

[Open an issue](https://github.com/thekirankumarv/runcraft/issues) with your operating system, Node.js version (`node -v`), Runcraft version and the relevant log lines.
