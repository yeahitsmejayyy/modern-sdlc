// A new ping row arriving: it flies in from the left with some speed, then lands
// with a burst of confetti from where it hit and a small shake of its card.
// Hand-written with the Web Animations API, so there's no dependency. Skipped
// when the OS asks for reduced motion.

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899']
const PIECES = 72
const GRAVITY = 900 // px/s²
const DURATION = 1250 // ms

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function arrive(row: HTMLElement) {
  if (reducedMotion()) return
  row
    .animate(FLY_IN, { duration: 450, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'backwards' })
    .finished.then(() => land(row))
}

// Accelerates all the way in (ease-in), overshoots a little, and settles.
const FLY_IN: Keyframe[] = [
  { transform: 'translateX(-110%) skewX(-20deg)', opacity: 0 },
  { transform: 'translateX(3%) skewX(6deg)', opacity: 1, offset: 0.85 },
  { transform: 'none', opacity: 1 },
]

function land(row: HTMLElement) {
  const { left, top, height } = row.getBoundingClientRect()
  confetti(left, top + height / 2)
  row.closest('[data-slot="card"]')?.animate(SHAKE, { duration: 400, easing: 'ease-out' })
}

const SHAKE: Keyframe[] = [0, -6, 5, -4, 3, -2, 0].map((x, i) => ({
  transform: `translate(${x}px, ${i % 2 ? 1 : -1}px) rotate(${x / 10}deg)`,
}))

/** Shoots pieces up and to the right from (x, y); each falls on a parabola and fades. */
function confetti(x: number, y: number) {
  const layer = document.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50'
  document.body.append(layer)

  const flights = Array.from({ length: PIECES }, (_, i) => {
    const piece = document.createElement('i')
    const size = 6 + Math.random() * 6
    piece.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * 0.6}px;background:${COLORS[i % COLORS.length]};border-radius:1px`
    layer.append(piece)

    // Mostly up and away from the left edge the row came in from.
    const angle = (-100 + Math.random() * 110) * (Math.PI / 180)
    const speed = 300 + Math.random() * 550 // px/s
    const vx = Math.cos(angle) * speed
    const vy = Math.sin(angle) * speed
    const spin = (Math.random() - 0.5) * 1440

    const frames: Keyframe[] = []
    for (let step = 0; step <= 10; step++) {
      const t = (step / 10) * (DURATION / 1000)
      frames.push({
        transform: `translate(${vx * t}px, ${vy * t + (GRAVITY * t * t) / 2}px) rotate(${spin * t}deg)`,
        opacity: step < 7 ? 1 : 1 - (step - 6) / 4,
      })
    }
    return piece.animate(frames, { duration: DURATION * (0.8 + Math.random() * 0.4), easing: 'linear' }).finished
  })

  Promise.all(flights).finally(() => layer.remove())
}
