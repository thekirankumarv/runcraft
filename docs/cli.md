# Command line

```text
runcraft [dir] [--port 4949] [--no-open]   open the dashboard for a project

runcraft status                  list services and their state
runcraft start [service...]      start services (all if none given)
runcraft stop [service...]       stop services (all if none given)
runcraft restart <service>       restart one service
runcraft logs <service> [-f]     print recent logs, -f to follow
runcraft --version               print the version
```

## Opening the dashboard

`runcraft` with no command starts the dashboard for the current folder, or for `dir` if you pass one.

If Runcraft is already running, it does not start a second copy. It adds the folder to the running dashboard and opens it in your browser, so you can run `runcraft` from each project you work on.

## Controlling services

`status`, `start`, `stop`, `restart` and `logs` talk to the running dashboard, so start the dashboard first. They act on the project that contains the current folder: Runcraft walks up from where you are until it finds a `runcraft.json`, so you can run them from any subfolder.

```sh
$ runcraft status
Redis                running     :6390
API                  running     :8080
Worker               running
Web                  stopped     :5173

$ runcraft start web
Starting web

$ runcraft logs api -f
INFO  API ready on http://localhost:8080
INFO  GET /users 200 4ms
```

`start` includes dependencies, the same as in the dashboard. `stop` stops dependents first.

`start`, `stop` and `restart` return as soon as the request is accepted. Use `runcraft status` or the dashboard to follow progress.

Service names are ids from `runcraft.json`. An unknown name prints the list of valid ones. Every command exits with code 1 when something goes wrong, for example when Runcraft is not running.
