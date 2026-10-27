// sdlc: the app's API from a terminal, for people and for agents like Claude Code.
//
//   bun run sdlc ping     [--env local|staging|production] [--json]
//   bun run sdlc pings    [--env ...] [--json]
//   bun run sdlc health   [--env ...] [--json]
//
// The token comes from SDLC_TOKEN, never a flag, so it stays out of shell history.
// health is public and works without one. Local dev's token is "local".
import { parseArgs } from 'node:util'
import type { Health, PingRecord, PingResponse } from '@app/schema'

const URLS = {
  local: 'http://localhost:8000',
  staging: 'https://sdlc-staging.itspjbell.com',
  production: 'https://sdlc.itspjbell.com',
}
type Env = keyof typeof URLS

const USAGE = `usage: bun run sdlc <ping|pings|health> [--env local|staging|production] [--json]`

/** Prints a message and stops with a non-zero exit code. */
function fail(message: string, code = 1): never {
  console.error(`sdlc: ${message}`)
  process.exit(code)
}

const { values, positionals } = parseArgs({
  options: {
    env: { type: 'string', default: 'local' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
})
const [command] = positionals
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (!(values.env in URLS)) fail(`unknown --env "${values.env}"\n${USAGE}`, 2)
const env = values.env as Env

/** Calls the API and returns its JSON body, or stops with a message saying what went wrong. */
async function call<T>(method: 'GET' | 'POST', path: string): Promise<{ status: number; body: T }> {
  const token = process.env.SDLC_TOKEN
  let res: Response
  try {
    res = await fetch(URLS[env] + path, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    const hint = env === 'local' ? ' Is `bun run dev` running?' : ''
    fail(`can't reach ${URLS[env]}.${hint}`)
  }
  const body = await res.json().catch(() => null)
  if (res.status === 401) {
    fail(token ? `SDLC_TOKEN was rejected by ${env}` : `set SDLC_TOKEN to an API token for ${env}`)
  }
  // /health answers 503 with a normal body when the database is down; let it through.
  if (!res.ok && res.status !== 503) fail(`${res.status} from ${path}: ${body?.detail ?? res.statusText}`)
  return { status: res.status, body: body as T }
}

const time = (iso: string) => iso.slice(0, 19).replace('T', ' ') + ' UTC'

if (command === 'ping') {
  const { body } = await call<PingResponse>('POST', '/api/ping')
  console.log(values.json ? JSON.stringify(body, null, 2) : `Ping #${body.count} on ${env}, commit ${body.commit}, at ${time(body.servedAt)}`)
} else if (command === 'pings') {
  const { body } = await call<PingRecord[]>('GET', '/api/pings')
  if (values.json) console.log(JSON.stringify(body, null, 2))
  else if (body.length === 0) console.log(`No pings on ${env} yet.`)
  else for (const p of body) console.log(`#${p.id}  ${time(p.createdAt)}  ${p.commit}`)
} else if (command === 'health') {
  const { body } = await call<Health>('GET', '/health')
  console.log(values.json ? JSON.stringify(body, null, 2) : body.ok ? `${env} is healthy, commit ${body.commit}` : `${env} is unhealthy: database is down, commit ${body.commit}`)
  if (!body.ok) process.exit(1)
} else {
  fail(command ? `unknown command "${command}"\n${USAGE}` : USAGE, 2)
}
