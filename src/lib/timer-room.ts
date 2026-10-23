import { randomInt } from "node:crypto"

import { MAX_SECONDS, clampMs } from "@/lib/timer-clock"

// The relay behind the phone remote: a handful of live countdowns held
// in memory, each addressed by a short code the screen shows and the phone
// types in. Modelled on html-deck-kit's remote
// (github.com/adyrugina/html-deck-kit), with one deliberate departure.
//
// IT RELAYS STATE, NOT COMMANDS. The deck kit sends `next` / `back` taps and
// throws away any tap older than three seconds, because a deck has no clock:
// the keypress is the only thing worth sending, and a late one would jump the
// slides under the presenter. A countdown does have a clock, and this one is
// already deadline-driven, so the relay carries where the clock IS. That buys
// three things the command version cannot have: a missed poll costs nothing, a
// late delivery is harmless because the state is still true when it lands, and
// both devices keep counting correctly while the relay is unreachable, because
// each already knows when the clock runs out.
//
// NO ABSOLUTE TIME EVER CROSSES THE WIRE. A reply carries `remainingMs`, and
// each side turns that into a deadline against its own clock the moment it
// arrives. Sending the deadline instead would mean trusting two unsynchronised
// clocks to agree, and a phone a minute out would retime the room for the
// whole audience. The cost of doing it this way is the network round trip,
// around a tenth of a second, applied the same way on both sides: invisible on
// a fifteen-minute workshop clock, and it cannot accumulate, because a fresh
// `remainingMs` arrives with every poll.
//
// This is memory, so it is lost on every deploy, and it would not be shared if
// the service ever ran a second instance. Both are accepted rather than
// overlooked: a lost room shows up as an amber light on the phone and is fixed
// by pairing again, and the countdown on the screen never stops either way.
// Should this ever need to survive a deploy, the shape to keep is the view
// below; where the map lives is the only part that would change.

/** Unambiguous alphabet: no O/0, I/1, S/5, B/8 or Z/2, because this code gets
 *  read off a projector from the back of a room and typed into a phone. Five
 *  characters is around twelve million rooms, which is why there is no
 *  rate limiter here: a code is worth a workshop clock for four hours, and
 *  guessing one takes longer than that by several orders of magnitude. */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679"
const CODE_LENGTH = 5

/** Four hours is a long workshop. A room nobody has touched for that long is
 *  gone, and that sweep is the whole of this module's housekeeping. */
const ROOM_TTL_MS = 4 * 60 * 60_000

/** A ceiling, so the map cannot grow without bound; the room touched longest
 *  ago gives way. Nothing here is worth a database. */
const MAX_ROOMS = 200

/** Which side of the pair is asking. The relay keeps nothing but the time each
 *  was last heard from, which is what draws the phone's traffic light. */
export type TimerSide = "screen" | "phone"

export type TimerAction =
  | { kind: "start" }
  | { kind: "pause" }
  | { kind: "reset" }
  | { kind: "duration"; durationMs: number }
  /** Buy more time on the clock that is already running. */
  | { kind: "add"; ms: number }

export type TimerRoom = {
  code: string
  durationMs: number
  /** Epoch ms on THIS process's clock while running, null while paused. It
   *  never leaves the server; `remainingMs` is what goes on the wire. */
  deadline: number | null
  /** What is left while paused. Stale while running, where the deadline is
   *  the truth. */
  restingMs: number
  running: boolean
  /** Bumped on every write. Each side remembers the last one it saw, so it can
   *  tell a change made elsewhere from the echo of its own. */
  rev: number
  seen: Record<TimerSide, number>
  touchedAt: number
}

/** What both sides receive. No absolute timestamps, by design (see above). */
export type TimerRoomView = {
  code: string
  durationMs: number
  remainingMs: number
  running: boolean
  rev: number
  /** Milliseconds since the other side last asked, or null if it never has.
   *  A duration rather than a time, for the same reason as `remainingMs`. */
  peerAgo: number | null
}

// Module state does not survive a hot reload, which during `npm run dev` would
// drop a paired room on every file save. Hanging it off the global keeps a
// local pairing alive across reloads; in production this is plain module state.
type GlobalWithRooms = typeof globalThis & { __pmTimerRooms?: Map<string, TimerRoom> }
const rooms: Map<string, TimerRoom> = ((globalThis as GlobalWithRooms).__pmTimerRooms ??=
  new Map())

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
}

/** Uppercase and strip whatever a phone keyboard added, so "a4-k2 j" and
 *  "A4K2J" reach the same room. */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function remainingAt(room: TimerRoom, now: number): number {
  if (!room.running || room.deadline === null) return room.restingMs
  return Math.max(0, room.deadline - now)
}

function sweep(now: number): void {
  for (const [code, room] of rooms) {
    if (now - room.touchedAt > ROOM_TTL_MS) rooms.delete(code)
  }
  while (rooms.size >= MAX_ROOMS) {
    let oldest: TimerRoom | null = null
    for (const room of rooms.values()) {
      if (!oldest || room.touchedAt < oldest.touchedAt) oldest = room
    }
    if (!oldest) break
    rooms.delete(oldest.code)
  }
}

function newCode(): string {
  // A bounded retry rather than a loop: with twelve million codes and at most
  // two hundred rooms, one collision is a curiosity and twenty in a row cannot
  // happen, but a `while` here would be a way to hang a request if that ever
  // stopped being true. Giving up is louder than overwriting a live room.
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = ""
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
  throw new Error("timer relay: could not find a free room code")
}

/** Open a room seeded with what the screen is showing right now, so the phone's
 *  first poll already agrees with the projector rather than resetting it.
 *
 *  `running` is part of that seed and not an afterthought: pairing halfway
 *  through a workshop is the normal case, and a room that opened paused would
 *  have the phone reporting a stopped clock while the dial is visibly turning. */
export function createRoom(seed: {
  durationMs: number
  remainingMs: number
  running: boolean
}): TimerRoom {
  const now = Date.now()
  sweep(now)
  const durationMs = clampMs(seed.durationMs) ?? 15 * 60_000
  const restingMs = Math.min(durationMs, Math.max(0, Math.round(seed.remainingMs)))
  const running = seed.running && restingMs > 0
  const code = newCode()
  const room: TimerRoom = {
    code,
    durationMs,
    deadline: running ? now + restingMs : null,
    restingMs,
    running,
    rev: 1,
    seen: { screen: now, phone: 0 },
    touchedAt: now,
  }
  rooms.set(code, room)
  return room
}

export function findRoom(code: string): TimerRoom | null {
  const room = rooms.get(code)
  if (!room) return null
  if (Date.now() - room.touchedAt > ROOM_TTL_MS) {
    rooms.delete(code)
    return null
  }
  return room
}

/** Record that a side is still there, which is all the phone's traffic light
 *  and the screen's "phone connected" dot are reading. */
export function markSeen(room: TimerRoom, side: TimerSide, now = Date.now()): void {
  room.seen[side] = now
  room.touchedAt = now
}

export function applyAction(room: TimerRoom, action: TimerAction, now = Date.now()): void {
  switch (action.kind) {
    case "start": {
      // Starting from zero rewinds, the same way the screen's own Start does
      // after the chime, so "start again" needs no second action.
      const left = remainingAt(room, now)
      const from = left > 0 ? left : room.durationMs
      room.deadline = now + from
      room.restingMs = from
      room.running = true
      break
    }
    case "pause":
      room.restingMs = remainingAt(room, now)
      room.deadline = null
      room.running = false
      break
    case "reset":
      room.restingMs = room.durationMs
      room.deadline = null
      room.running = false
      break
    case "duration":
      room.durationMs = action.durationMs
      room.restingMs = action.durationMs
      room.deadline = null
      room.running = false
      break
    case "add": {
      // Only the time LEFT grows. `durationMs` is the length that was set, and
      // it is what Reset goes back to; an extension granted in the room is not
      // a change to the plan, so a reset still returns to the plan. It also
      // keeps the preset chips and the URL fragment honest, both of which
      // describe the set length rather than the clock.
      const next = Math.min(MAX_SECONDS * 1000, remainingAt(room, now) + action.ms)
      room.restingMs = next
      if (room.running) room.deadline = now + next
      break
    }
  }
  room.rev += 1
  room.touchedAt = now
}

export function viewRoom(room: TimerRoom, side: TimerSide, now = Date.now()): TimerRoomView {
  const peer: TimerSide = side === "screen" ? "phone" : "screen"
  const peerSeen = room.seen[peer]
  return {
    code: room.code,
    durationMs: room.durationMs,
    remainingMs: remainingAt(room, now),
    running: room.running,
    rev: room.rev,
    peerAgo: peerSeen ? Math.max(0, now - peerSeen) : null,
  }
}

/** Reject a write that a different site's page tried to make. Browsers always
 *  send `Origin` on a cross-origin POST, so a missing one is our own page or a
 *  command-line client, both of which are fine. This timer may be framed by any site
 *  (see `next.config.ts`), but a framed copy of our own page is still our
 *  origin, so this costs a facilitator who embeds it nothing.
 *
 *  It lives here rather than beside the routes because a `route.ts` may export
 *  nothing but its HTTP methods and the segment config; Next rejects the build
 *  over any other export. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === request.headers.get("host")
  } catch {
    return false
  }
}

/** Read an action off a request body. Anything unrecognised is rejected rather
 *  than coerced: a malformed write here would move a clock in front of a room. */
export function parseAction(body: unknown): TimerAction | null {
  if (!body || typeof body !== "object") return null
  const kind = (body as { action?: unknown }).action
  if (kind === "start" || kind === "pause" || kind === "reset") return { kind }
  if (kind === "duration") {
    const durationMs = clampMs((body as { durationMs?: unknown }).durationMs)
    return durationMs === null ? null : { kind: "duration", durationMs }
  }
  if (kind === "add") {
    const ms = (body as { ms?: unknown }).ms
    // A bounded, positive amount only: this is the one action that can grow
    // the clock, and it is reachable by anyone holding the code.
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0 || ms > 60 * 60_000) {
      return null
    }
    return { kind: "add", ms: Math.round(ms) }
  }
  return null
}
