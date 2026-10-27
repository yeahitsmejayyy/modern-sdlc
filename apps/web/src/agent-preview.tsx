import { useEffect, useState } from 'react'
import { AgentLauncher } from '@app/ui/components/agent-launcher'
import { AgentWidget, type AgentMessage, type AgentWidgetProps } from '@app/ui/components/agent-widget'
import { EDITH } from './agent-content.ts'

// Dev only (http://localhost:5173/#agent-preview): every state of the agent
// widget side by side, with no ElevenLabs connection. Production builds drop it.

const thread: AgentMessage[] = [
  { id: 'u0', role: 'user', text: 'Ping the server' },
  { id: 'a0', role: 'agent', text: 'Done. Ping 7 on modern-sdlc staging, commit 3 8 0 6 e 8 9.' },
  { id: 'u1', role: 'user', text: 'What happened recently?' },
]

const inline = 'relative inset-auto z-auto h-[600px] w-[392px] rounded-xl border overflow-hidden md:relative md:inset-auto md:right-auto md:bottom-auto md:h-[600px]'

// A moving waveform, so the call states look alive.
function useBars() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), 80)
    return () => clearInterval(id)
  }, [])
  return Array.from({ length: 24 }, (_, i) => Math.abs(Math.sin(t / 3 + i / 2)) * (1 - Math.abs(i - 11.5) / 14))
}

export function AgentPreview() {
  const bars = useBars()
  const [open, setOpen] = useState(false)
  const base: AgentWidgetProps = { content: EDITH, status: 'idle', mode: 'chat', messages: [], className: inline }
  const states: [string, AgentWidgetProps][] = [
    ['Chat · fresh', base],
    ['Chat · thinking', { ...base, status: 'live', messages: thread, thinking: true }],
    ['Chat · ended', { ...base, status: 'ended', messages: thread.slice(0, 2) }],
    ['Chat · failed', { ...base, status: 'error', error: 'failed', messages: thread.slice(0, 1) }],
    ['Chat · no microphone', { ...base, status: 'error', error: 'mic' }],
    ['Call · connecting', { ...base, mode: 'voice', status: 'connecting' }],
    ['Call · listening', { ...base, mode: 'voice', status: 'live', messages: thread, bars }],
    ['Call · Edith speaking', { ...base, mode: 'voice', status: 'live', messages: thread.slice(0, 2), bars, speaking: true }],
    ['Call · muted', { ...base, mode: 'voice', status: 'live', messages: thread, muted: true }],
  ]

  return (
    <main className="flex flex-col gap-8 p-8">
      <h1 className="text-xl font-bold">Agent widget states</h1>
      <div className="flex flex-wrap gap-8">
        {states.map(([label, props]) => (
          <figure key={label} className="flex flex-col gap-2">
            <figcaption className="text-muted-foreground font-mono text-xs">{label}</figcaption>
            <AgentWidget {...props} />
          </figure>
        ))}
      </div>
      <AgentLauncher label={EDITH.launcher} closeLabel={EDITH.controls.close} open={open} onClick={() => setOpen((o) => !o)} />
    </main>
  )
}
