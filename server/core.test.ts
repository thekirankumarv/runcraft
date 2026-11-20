import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { test } from 'node:test'
import { updateEnvText } from './env.ts'
import { levelOf, portFrom, ServiceProcess } from './proc.ts'
import { topoSort } from './project.ts'
import { parseLsof, parseNetstat, parsePs, parseSs } from './system.ts'

const alive = (pattern: string) => {
  try {
    return execFileSync('pgrep', ['-f', pattern]).toString().trim() !== ''
  } catch {
    return false
  }
}

test('stop kills the whole process tree', { skip: process.platform === 'win32' }, async () => {
  const marker = `sleep 31${Math.floor(Math.random() * 1000)}`
  const proc = new ServiceProcess({ id: 't', name: 't', cwd: '.', command: `${marker} & ${marker} & wait` }, os.tmpdir(), () => ({}))
  await proc.start()
  await new Promise((r) => setTimeout(r, 300))
  assert.ok(alive(marker), 'children should be running')
  await proc.stop()
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(alive(marker), false, 'no orphaned children after stop')
  assert.equal(proc.status, 'stopped')
})

test('crash is reported with exit code', async () => {
  const proc = new ServiceProcess({ id: 't', name: 't', cwd: '.', command: `node -e "console.error('boom'); process.exit(3)"` }, os.tmpdir(), () => ({}))
  await proc.start()
  await new Promise((r) => proc.on('status', (s) => s.status === 'crashed' && r(null)))
  assert.equal(proc.exitCode, 3)
  assert.ok(proc.logs.some((l) => l.text === 'boom'))
})

test('env update keeps comments and only rewrites changed keys', () => {
  const before = '# db\nDB_URL=postgres://x\n\nexport TOKEN="a b" # secret\nDROP=1\n'
  const after = updateEnvText(before, { DB_URL: 'postgres://x', TOKEN: 'a b c', NEW: 'has space' })
  assert.equal(after, '# db\nDB_URL=postgres://x\n\nTOKEN="a b c"\nNEW="has space"\n')
})

test('topoSort orders deps first and rejects cycles', () => {
  assert.deepEqual(topoSort([{ id: 'web', dependsOn: ['api'] }, { id: 'api', dependsOn: ['db'] }, { id: 'db' }]), ['db', 'api', 'web'])
  assert.throws(
    () =>
      topoSort([
        { id: 'a', dependsOn: ['b'] },
        { id: 'b', dependsOn: ['a'] },
      ]),
    /cycle/,
  )
})

test('log levels and port detection', () => {
  assert.equal(levelOf('TypeError: x is undefined'), 'error')
  assert.equal(levelOf('    at foo (/app/src/a.ts:3:7)'), 'error')
  assert.equal(levelOf('Found 0 errors. Watching for file changes.'), 'info')
  assert.equal(levelOf('\x1b[33mwarn\x1b[0m - deprecated option'), 'warn')
  assert.equal(portFrom('  ➜  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m'), 5173)
  assert.equal(portFrom('Server listening on port 4000'), 4000)
})

test('port listings parse on every platform', () => {
  assert.deepEqual(parseLsof('p812\ncnode\nn*:3000\nn[::1]:3000\np90\ncpostgres\nn127.0.0.1:5432\n'), [
    { address: '*', port: 3000, pid: 812, command: 'node' },
    { address: '[::1]', port: 3000, pid: 812, command: 'node' },
    { address: '127.0.0.1', port: 5432, pid: 90, command: 'postgres' },
  ])
  assert.deepEqual(parseSs('LISTEN 0      511          0.0.0.0:3000      0.0.0.0:*    users:(("node",pid=1234,fd=21))\nLISTEN 0 128 [::]:22 [::]:*\n'), [
    { address: '0.0.0.0', port: 3000, pid: 1234, command: 'node' },
    { address: '[::]', port: 22, pid: 0, command: '' },
  ])
  const netstat = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       4120',
    '  TCP    127.0.0.1:52100        127.0.0.1:3000         ESTABLISHED     900',
    '  TCP    [::]:5173              [::]:0                 ABHÖREN         77',
    '  UDP    0.0.0.0:5353           *:*                                    1',
  ].join('\r\n')
  assert.deepEqual(parseNetstat(netstat, '"node.exe","4120","Console","1","52,000 K"\r\n'), [
    { address: '0.0.0.0', port: 3000, pid: 4120, command: 'node.exe' },
    { address: '[::]', port: 5173, pid: 77, command: '' },
  ])
  assert.deepEqual(parsePs('  10     1   2.5  2048\n  11    10   0.0   512\n'), [
    { pid: 10, ppid: 1, cpu: 2.5, mem: 2048 * 1024 },
    { pid: 11, ppid: 10, cpu: 0, mem: 512 * 1024 },
  ])
})
