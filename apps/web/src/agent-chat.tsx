import { Conversation as ElevenLabs } from '@elevenlabs/client'
import audioConcatProcessor from '@elevenlabs/client/worklets/audioConcatProcessor.js?url&no-inline'
import rawAudioProcessor from '@elevenlabs/client/worklets/rawAudioProcessor.js?url&no-inline'
import { useEffect, useRef, useState } from 'react'
import type { AgentSessionPass } from '@app/schema'
import { toBars } from '@app/ui/components/agent-waveform'
import {
  AgentWidget,
  type AgentError,
  type AgentMessage,
  type AgentMode,
  type AgentStatus,
} from '@app/ui/components/agent-widget'
import { EDITH } from './agent-content.ts'
import { pingsChanged } from './pings.ts'

// The SDK's audio processors, served as files from this site rather than as
// blob: or data: scripts.
const workletPaths = { rawAudioProcessor, audioConcatProcessor }

type Session = Awaited<ReturnType<typeof ElevenLabs.startSession>>

/**
 * Tools Edith runs in this browser rather than on ElevenLabs' servers. Her ping is
 * one: it hits the site she's open on, with the visitor's own login, so a ping on
 * production lands in production. Then the Recent pings list refreshes right away.
 */
const clientTools = {
  ping: async () => {
    const res = await fetch('/api/ping', { method: 'POST' })
    if (!res.ok) throw new Error(`ping failed: ${res.status}`)
    pingsChanged()
    return await res.text()
  },
}

/** Mood cues the voice model may write ([calm], [laughs]): tone on calls, never shown as text. */
const clean = (text: string) => text.replace(/\[[a-z][a-z ]*\]\s*/gi, '').trim()

/** A short-lived pass from the server (apps/server/agent.py); the agent accepts nothing else. */
async function getPass(mode: AgentMode) {
  const res = await fetch('/api/agent/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (res.status === 429) throw new Error('busy')
  if (!res.ok) throw new Error('failed')
  return (await res.json()) as AgentSessionPass
}

/**
 * The agent panel wired to ElevenLabs. Loaded only when the launcher first opens
 * it. Chat runs over a signed WebSocket, text only, starting silently with the
 * first message. The mic switches to voice (WebRTC); the earlier chat goes along
 * as context, so the agent picks up where it left off.
 */
export function AgentChat({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [mode, setMode] = useState<AgentMode>('chat')
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<AgentError>()
  const [bars, setBars] = useState<number[]>([])
  const session = useRef<Session | null>(null)
  // Mirrors of state for ElevenLabs' callbacks and for handing context to the next session.
  const log = useRef<AgentMessage[]>([])
  const modeRef = useRef<AgentMode>('chat')

  useEffect(() => () => void session.current?.endSession(), [])

  // On a call, sample whoever is talking about 30 times a second for the waveform.
  useEffect(() => {
    if (mode !== 'voice' || status !== 'live' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let last = 0
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick)
      const s = session.current
      if (!s || t - last < 33) return
      last = t
      setBars(toBars(speaking ? s.getOutputByteFrequencyData() : s.getInputByteFrequencyData()))
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mode, status, speaking])

  const add = (role: AgentMessage['role'], text: string) => {
    log.current = [...log.current, { id: `${role}-${log.current.length}`, role, text }]
    setMessages(log.current)
  }
  const switchMode = (m: AgentMode) => {
    modeRef.current = m
    setMode(m)
  }

  const fail = (e: unknown) => {
    session.current = null
    setThinking(false)
    setError(e instanceof Error && e.message === 'busy' ? 'busy' : 'failed')
    setStatus('error')
  }

  /** Ends whatever is running. `quiet` keeps the thread open (switching modes) instead of showing the end. */
  async function stop(quiet: boolean) {
    const s = session.current
    session.current = null
    await s?.endSession()
    setSpeaking(false)
    setThinking(false)
    setStatus(quiet ? 'idle' : 'ended')
  }

  const callbacks = {
    onDisconnect: () => {
      // The agent hung up (time limit, or it ended the call), not the person.
      if (session.current) {
        session.current = null
        setSpeaking(false)
        setThinking(false)
        setStatus('ended')
      }
    },
    onError: () => fail(new Error('failed')),
    onModeChange: ({ mode: m }: { mode: 'speaking' | 'listening' }) => setSpeaking(m === 'speaking'),
    onMessage: ({ message, role }: { message: string; role: 'agent' | 'user' }) => {
      const text = clean(message)
      // Typed messages are shown as they're sent; in voice, what was heard comes back here.
      if (!text || (role === 'user' && modeRef.current === 'chat')) return
      if (role === 'agent') setThinking(false)
      add(role, text)
    },
  }

  /** What was said so far, so a new session (chat after voice, or voice after chat) has the context. */
  const context = () =>
    log.current.length
      ? `Earlier in this conversation:\n${log.current.map((m) => `${m.role === 'agent' ? 'Edith' : 'PJ'}: ${m.text}`).join('\n')}`
      : ''

  async function send(text: string) {
    // Context is what came before this message; the message itself is sent on its own.
    const earlier = context()
    add('user', text)
    setThinking(true)
    setError(undefined)
    if (session.current && mode === 'chat') return session.current.sendUserMessage(text)
    try {
      switchMode('chat')
      setStatus('connecting')
      const pass = await getPass('chat')
      if (!('signedUrl' in pass)) throw new Error('failed')
      session.current = await ElevenLabs.startSession({
        signedUrl: pass.signedUrl,
        connectionType: 'websocket',
        textOnly: true,
        // Start silently: the person has already spoken first.
        overrides: { conversation: { textOnly: true }, agent: { firstMessage: '' } },
        workletPaths,
        clientTools,
        ...callbacks,
      })
      setStatus('live')
      if (earlier) session.current.sendContextualUpdate(earlier)
      session.current.sendUserMessage(text)
    } catch (e) {
      fail(e)
    }
  }

  async function talk() {
    setError(undefined)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()))
    } catch {
      setError('mic')
      setStatus('error')
      return
    }
    const earlier = context()
    await stop(true)
    switchMode('voice')
    setMuted(false)
    setStatus('connecting')
    try {
      const pass = await getPass('voice')
      if (!('token' in pass)) throw new Error('failed')
      session.current = await ElevenLabs.startSession({
        conversationToken: pass.token,
        connectionType: 'webrtc',
        // After a chat, don't greet again: pick up the thread.
        ...(earlier && { overrides: { agent: { firstMessage: "I'm listening. Go ahead." } } }),
        workletPaths,
        clientTools,
        ...callbacks,
      })
      setStatus('live')
      if (earlier) session.current.sendContextualUpdate(earlier)
    } catch (e) {
      fail(e)
    }
  }

  async function hangUp() {
    await stop(true)
    switchMode('chat')
  }

  return (
    <AgentWidget
      content={EDITH}
      status={status}
      mode={mode}
      messages={messages}
      thinking={thinking}
      speaking={speaking}
      muted={muted}
      bars={bars}
      error={error}
      onSend={send}
      onTalk={talk}
      onHangUp={hangUp}
      onMute={(m) => {
        setMuted(m)
        session.current?.setMicMuted(m)
      }}
      onEnd={() => stop(false)}
      onRestart={() => {
        log.current = []
        setMessages([])
        switchMode('chat')
        setStatus('idle')
      }}
      onRetry={() => (mode === 'voice' ? talk() : setStatus('idle'))}
      onClose={async () => {
        await stop(true)
        onClose()
      }}
    />
  )
}
