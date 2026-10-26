import { lazy, Suspense, useEffect, useState } from 'react'
import { AgentLauncher } from '@app/ui/components/agent-launcher'
import { EDITH } from './agent-content.ts'

// The panel and ElevenLabs' SDK load on first open, so the page ships only the launcher.
const AgentChat = lazy(() => import('./agent-chat.tsx').then((m) => ({ default: m.AgentChat })))

/**
 * Edith on the page: the floating launcher and the conversation panel it opens.
 * Once opened, the panel stays mounted (hidden when closed) so the thread is
 * still there when it's reopened. Escape closes it. Only rendered after login.
 */
export function Agent() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div>
      {loaded && (
        <div hidden={!open}>
          <Suspense fallback={null}>
            <AgentChat onClose={() => setOpen(false)} />
          </Suspense>
        </div>
      )}
      <AgentLauncher
        label={EDITH.launcher}
        closeLabel={EDITH.controls.close}
        open={open}
        // Hidden on phones while open: the panel is full screen there and has its own close.
        className={open ? 'max-md:hidden' : undefined}
        onClick={() => {
          setLoaded(true)
          setOpen((o) => !o)
        }}
      />
    </div>
  )
}
