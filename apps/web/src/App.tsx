import { useEffect, useState, type FormEvent } from 'react'
import type { AuthLocked, PingRecord, PingResponse } from '@app/schema'
import { Badge } from '@app/ui/components/badge'
import { Button } from '@app/ui/components/button'
import { Input } from '@app/ui/components/input'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@app/ui/components/card'
import { Agent } from './agent.tsx'
import { environment } from './environment.ts'
import { currentTheme, setTheme, type Theme } from './theme.ts'

const localTime = (iso: string) => new Date(iso).toLocaleString()

type Auth = 'checking' | 'out' | 'in'

export default function App() {
  const [auth, setAuth] = useState<Auth>('checking')

  // Relative paths: Vite proxies them in dev, Caddy in production.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => setAuth(res.ok ? 'in' : 'out'))
      .catch(() => setAuth('out'))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Frontend ↔ Backend ↔ Database</CardTitle>
          <CardDescription>
            {auth === 'out' ? 'Log in to continue' : 'Three containers, one server'}
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <EnvironmentBadge />
            <ThemeToggle />
            {auth === 'in' && <LogOutButton onLoggedOut={() => setAuth('out')} />}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {auth === 'out' && <LoginForm onLoggedIn={() => setAuth('in')} />}
          {/* Any 401 means the session ended (expired, or logged out elsewhere): back to the login. */}
          {auth === 'in' && <Pinger onUnauthorized={() => setAuth('out')} />}
        </CardContent>
      </Card>
      {/* Edith, the voice agent: only for people who are logged in. */}
      {auth === 'in' && <Agent />}
    </main>
  )
}

function Pinger({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [pings, setPings] = useState<PingRecord[]>([])

  const loadPings = async () => {
    const res = await fetch('/api/pings')
    if (res.status === 401) onUnauthorized()
    else if (res.ok) setPings(await res.json())
  }

  useEffect(() => {
    loadPings()
  }, [])

  return (
    <>
      <PingButton onPinged={loadPings} onUnauthorized={onUnauthorized} />
      <RecentPings pings={pings} />
    </>
  )
}

const waitText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  // Count down while locked out, then unlock the form.
  useEffect(() => {
    if (lockedUntil === null) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= lockedUntil) setLockedUntil(null)
    }, 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  const locked = lockedUntil !== null && now < lockedUntil

  const logIn = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.status === 204) return onLoggedIn()
      setPassword('')
      if (res.status === 429) {
        const body: AuthLocked = await res.json()
        setNow(Date.now())
        setLockedUntil(Date.now() + body.detail.retryAfter * 1000)
      } else if (res.status === 401) setError("That password didn't work.")
      else if (res.status === 503) setError("Login isn't set up on this server yet.")
      else setError(`Couldn't log in (HTTP ${res.status}). Try again.`)
    } catch {
      setError("Couldn't reach the server. Is it running?")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={logIn} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-sm font-medium">
        Password
      </label>
      <Input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={error ? true : undefined}
        disabled={busy || locked}
      />
      <Button type="submit" disabled={busy || locked || !password}>
        {busy ? 'Checking…' : 'Log in'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {locked && (
        <p role="status" className="text-destructive text-sm">
          Too many attempts. Try again in {waitText(lockedUntil - now)}.
        </p>
      )}
    </form>
  )
}

function LogOutButton({ onLoggedOut }: { onLoggedOut: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        onLoggedOut()
      }}
    >
      Log out
    </Button>
  )
}

// Staging gets a loud colour so it can't be mistaken for production at a glance.
function EnvironmentBadge() {
  if (environment === 'staging') return <Badge className="bg-amber-500 text-white">staging</Badge>
  return <Badge variant={environment === 'local' ? 'outline' : 'default'}>{environment}</Badge>
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        setTheme(next)
        setThemeState(next)
      }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </Button>
  )
}

function PingButton({ onPinged, onUnauthorized }: { onPinged: () => void; onUnauthorized: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ping: PingResponse; roundTripMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ping = async () => {
    setLoading(true)
    setError(null)
    const start = performance.now()
    try {
      const res = await fetch('/api/ping', { method: 'POST' })
      if (res.status === 401) return onUnauthorized()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ping: PingResponse = await res.json()
      setResult({ ping, roundTripMs: Math.round(performance.now() - start) })
      onPinged()
    } catch {
      setError("Couldn't reach the server. Is it running?")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={ping} disabled={loading}>
        {loading ? 'Pinging…' : 'Say hello to the server'}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {result && !error && <PingResult {...result} />}
    </div>
  )
}

function PingResult({ ping, roundTripMs }: { ping: PingResponse; roundTripMs: number }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <p className="font-semibold">Ping #{ping.count}</p>
      <p>{ping.message}</p>
      <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3">
        <dt>Served at</dt>
        <dd>{localTime(ping.servedAt)}</dd>
        <dt>Commit</dt>
        <dd className="font-mono">{ping.commit}</dd>
        <dt>Round trip</dt>
        <dd>{roundTripMs} ms</dd>
      </dl>
    </div>
  )
}

function RecentPings({ pings }: { pings: PingRecord[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Recent pings</h2>
      {pings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No pings yet.</p>
      ) : (
        <ul className="text-sm">
          {pings.map((p) => (
            <li key={p.id} className="flex justify-between border-b py-1 last:border-b-0">
              <span>#{p.id}</span>
              <span className="text-muted-foreground">{localTime(p.createdAt)}</span>
              <span className="font-mono">{p.commit}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
