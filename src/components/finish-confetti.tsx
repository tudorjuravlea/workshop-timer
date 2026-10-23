"use client"

import confetti from "canvas-confetti"
import * as React from "react"

import { useBrand } from "@/components/brand-provider"

// The celebration when a countdown reaches zero, fired with the gong.
//
// The canvas sits BEHIND the dial and the readout, over the ground only, so the
// paper bursts out from under the instrument and around it rather than across
// the numbers someone is still reading. The patterns take turns, one per
// finish, so the third round of a workshop does not get the same burst as the
// first. They are in the brand's colours only: the accent and the face, the
// two things the room has been looking at the whole time.
//
// Anyone who has asked their system for less movement gets none of it;
// `disableForReducedMotion` makes every pattern a no-op for them.

type Fire = (options: confetti.Options) => void

type Pattern = (fire: Fire, colors: string[], lift: number) => () => void

const NONE = () => {}

/** A fountain from under the readout: one shot of several spreads, the
 *  "realistic" burst from the library's own demos. */
const fountain: Pattern = (fire, colors, lift) => {
  const base = { origin: { x: 0.5, y: 1.05 }, angle: 90, colors }
  const shot = (ratio: number, o: confetti.Options) =>
    fire({ ...base, ...o, particleCount: Math.round(260 * ratio) })
  shot(0.25, { spread: 26, startVelocity: 62 * lift })
  shot(0.2, { spread: 60, startVelocity: 55 * lift })
  shot(0.35, { spread: 100, startVelocity: 50 * lift, decay: 0.91, scalar: 0.8 })
  shot(0.1, { spread: 120, startVelocity: 35 * lift, decay: 0.92, scalar: 1.2 })
  shot(0.1, { spread: 120, startVelocity: 50 * lift })
  return NONE
}

/** Two cannons in the bottom corners, crossing over the dial for two and a
 *  half seconds. */
const cannons: Pattern = (fire, colors, lift) => {
  const end = Date.now() + 2500
  let frame = 0
  const loop = () => {
    fire({ particleCount: 3, angle: 60, spread: 55, startVelocity: 60 * lift, origin: { x: 0, y: 1 }, colors })
    fire({ particleCount: 3, angle: 120, spread: 55, startVelocity: 60 * lift, origin: { x: 1, y: 1 }, colors })
    if (Date.now() < end) frame = requestAnimationFrame(loop)
  }
  loop()
  return () => cancelAnimationFrame(frame)
}

/** Bursts on either side of the dial, a few a second for three seconds. */
const fireworks: Pattern = (fire, colors) => {
  const end = Date.now() + 3000
  const between = (min: number, max: number) => Math.random() * (max - min) + min
  const burst = () => {
    const count = Math.round(60 * ((end - Date.now()) / 3000)) + 15
    const shared = { spread: 360, startVelocity: 30, ticks: 70, particleCount: count, colors }
    fire({ ...shared, origin: { x: between(0.08, 0.28), y: between(0.15, 0.6) } })
    fire({ ...shared, origin: { x: between(0.72, 0.92), y: between(0.15, 0.6) } })
  }
  burst()
  const id = window.setInterval(() => {
    if (Date.now() >= end) return window.clearInterval(id)
    burst()
  }, 250)
  return () => window.clearInterval(id)
}

const PATTERNS: Pattern[] = [fountain, cannons, fireworks]

/** @param bursts how many times the countdown has finished. Every increase
 *    fires the next pattern; the first render fires nothing. */
export function FinishConfetti({ bursts }: { bursts: number }) {
  const { colors } = useBrand()
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const fireRef = React.useRef<confetti.CreateTypes | null>(null)
  const shown = React.useRef(bursts)

  // Started on mount, so the worker is already running when the first finish
  // arrives; created lazily on that finish, the first burst came out visibly
  // thinner than the same pattern the second time. A worker-backed canvas can
  // hand its drawing over only once, so the ref guards against the
  // development double-mount trying twice (refs survive it).
  React.useEffect(() => {
    if (!canvasRef.current) return
    fireRef.current ??= confetti.create(canvasRef.current, {
      resize: true,
      useWorker: true,
      disableForReducedMotion: true,
    })
    return () => fireRef.current?.reset()
  }, [])

  React.useEffect(() => {
    if (bursts === shown.current) return
    shown.current = bursts
    const canvas = canvasRef.current
    const fire = fireRef.current
    if (!canvas || !fire) return
    // The library's speeds are in pixels, so on a tall projector a burst
    // tuned on a laptop would never clear the dial. Scale them with height.
    const lift = Math.max(1, canvas.clientHeight / 760)
    const pattern = PATTERNS[(bursts - 1) % PATTERNS.length]
    return pattern((o) => void fire(o), [colors.accent, colors.accent, colors.face], lift)
  }, [bursts, colors.accent, colors.face])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
}
