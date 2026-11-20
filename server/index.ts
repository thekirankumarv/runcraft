#!/usr/bin/env node
import { COMMANDS } from './cli.ts'

const [cmd, ...rest] = process.argv.slice(2)

if (cmd === '--version' || cmd === '-v') {
  const { VERSION } = await import('./store.ts')
  console.log(VERSION)
} else if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(`Usage:
  runcraft [dir] [--port 4949] [--no-open]   open the dashboard for a project

  runcraft status                  list services and their state
  runcraft start [service...]      start services (all if none given)
  runcraft stop [service...]       stop services (all if none given)
  runcraft restart <service>       restart one service
  runcraft logs <service> [-f]     print recent logs, -f to follow
  runcraft --version               print the version

Commands talk to the running dashboard and act on the project in the
current directory. Config is saved to <dir>/runcraft.json.`)
} else if (cmd && COMMANDS.has(cmd)) {
  const { run } = await import('./cli.ts')
  process.exitCode = await run(cmd, rest)
} else {
  const args = process.argv.slice(2)
  const dir = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--port')
  const { openInRunning } = await import('./cli.ts')
  if (args.includes('--port') || args.includes('--dev') || !(await openInRunning(dir, args.includes('--no-open')))) await import('./server.ts')
}
