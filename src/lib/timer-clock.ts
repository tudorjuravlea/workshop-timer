// The countdown's arithmetic, kept apart from any component because three
// places now need it and none of them should own it: the timer itself
// (`components/timer-screen.tsx`), the phone remote
// (`components/timer-remote.tsx`) and the
// relay route that both of them write through, which has to clamp whatever
// either one sends. While this lived inside the component the remote would
// have had to carry a second copy of `formatClock`, and two clocks that format
// the same milliseconds differently is exactly the bug nobody notices until
// one of them is on a projector.
//
// Everything here is pure and has no React in it, so the route handlers can
// import it without pulling a client component onto the server.

/** Every length the chips offer, in minutes, smallest first. Each one puts a
 *  number at the halfway mark on its dial (see `dialScale`), so "half the time
 *  is gone" can be read off the face. That is why 40 and 50 stand where 45
 *  used to: numbered in fives, 45's halfway (22′30″) falls between two. */
export const PRESETS = [1, 2, 4, 6, 8, 10, 14, 20, 30, 40, 50, 60, 90] as const

export const MAX_MINUTES = 180
export const MIN_SECONDS = 1
export const MAX_SECONDS = MAX_MINUTES * 60

/** Read a duration the way a person would write one, in seconds.
 *
 *  `7:30` is seven and a half minutes, `1:05:00` is an hour and five minutes,
 *  and a bare `20` is twenty MINUTES — not twenty seconds — because the presets
 *  set the expectation that a plain number here means minutes. Parts are
 *  normalised rather than rejected, so `5:90` becomes 6:30 instead of an error
 *  message: someone typing fast into a field on a projector should not be made
 *  to care that they overran a base-60 boundary.
 *
 *  Returns null for anything unparseable, which the caller treats as "leave the
 *  duration alone" rather than as a failure to report. */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!t || !/^\d{1,3}(:\d{0,2}){0,2}$/.test(t)) return null
  const parts = t.split(":").map((p) => (p === "" ? 0 : Number(p)))
  const seconds =
    parts.length === 1
      ? parts[0] * 60
      : parts.length === 2
        ? parts[0] * 60 + parts[1]
        : parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (!Number.isFinite(seconds)) return null
  return clampSeconds(seconds)
}

/** Hold a duration inside the bounds the field accepts. The relay runs this
 *  over anything a phone sends, so a hand-made request cannot park the screen
 *  on a nine-hour countdown. */
export function clampSeconds(seconds: number): number {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)))
}

/** The same bound in milliseconds, which is the unit everything but the field
 *  and the URL fragment works in. */
export function clampMs(ms: unknown): number | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null
  return clampSeconds(ms / 1000) * 1000
}

/** Seconds from the URL fragment. Accepts `#25`, the `#/25` the tool this was
 *  modelled on uses, and `#7:30` — the same grammar as the field, so whatever
 *  is typed can be copied straight into a link. */
export function durationFromHash(hash: string): number | null {
  const m = /^#\/?(\d{1,3}(?::\d{1,2}){0,2})$/.exec(hash)
  return m ? parseDuration(m[1]) : null
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** The same clock at hundredths, for the last minute: `MM:SS:CC`.
 *
 *  Colons throughout rather than a decimal point, so the hundredths read as a
 *  third field of the same kind as the other two rather than as a fraction
 *  hanging off the seconds — two digits moving fast, next to two digits moving
 *  slowly.
 *
 *  Floors rather than ceilings, unlike `formatClock`: at this resolution a
 *  ceiling would park on 00:00:01 for the whole of the last hundredth. */
export function formatClockHundredths(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10))
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(total / 6000))}:${pad(Math.floor(total / 100) % 60)}:${pad(total % 100)}`
}

/** The shortest fragment that round-trips a duration. Whole minutes stay bare
 *  (`#20`) so old links and the original tool's format keep working; anything
 *  with seconds is written the way the field shows it (`#7:30`). */
export function hashFor(seconds: number): string {
  return seconds % 60 === 0 ? String(seconds / 60) : formatClock(seconds * 1000)
}
