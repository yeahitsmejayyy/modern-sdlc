import { useEffect, useState } from 'react'
import type { PingRecord, PingResponse } from '@app/schema'
import { Button } from '@app/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/card'

const localTime = (iso: string) => new Date(iso).toLocaleString()

export default function App() {
  const [pings, setPings] = useState<PingRecord[]>([])

  // Relative paths: Vite proxies them in dev, Caddy in production.
  const loadPings = async () => {
    const res = await fetch('/api/pings')
    if (res.ok) setPings(await res.json())
  }

  useEffect(() => {
    loadPings()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Frontend ↔ Backend ↔ Database</CardTitle>
          <CardDescription>Three containers, one server</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PingButton onPinged={loadPings} />
          <RecentPings pings={pings} />
        </CardContent>
      </Card>
    </main>
  )
}

function PingButton({ onPinged }: { onPinged: () => void }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ping: PingResponse; roundTripMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ping = async () => {
    setLoading(true)
    setError(null)
    const start = performance.now()
    try {
      const res = await fetch('/api/ping', { method: 'POST' })
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
        {loading ? 'Pinging…' : 'Ping the server'}
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
