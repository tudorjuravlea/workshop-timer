// The three requests the remote makes, written once because both ends make all
// three: the projected screen (`components/use-timer-remote.ts`) and the phone
// (`components/timer-remote.tsx`). Keeping them here is also what lets each side's
// React code stay free of fetch handling, which matters more than it sounds:
// every one of these has to tell a lost room apart from a lost network, and
// those two produce different words on screen.

// Types only. The relay itself imports node:crypto and must never be bundled
// for a browser, so these imports stay `import type`.
import type { TimerAction, TimerRoomView } from "@/lib/timer-room"

/** The part of the countdown both devices share. */
export type TimerShare = {
  durationMs: number
  remainingMs: number
  running: boolean
}

export type TimerSide = "screen" | "phone"

/** `gone` means the relay has no such room and never will again — a deploy
 *  took it, or the code was mistyped. `offline` means we could not ask, which
 *  is worth retrying. Nothing else needs distinguishing. */
export type RelayResult =
  | { ok: true; view: TimerRoomView }
  | { ok: false; reason: "gone" | "offline" }

/** The wire shape of an action. One place, because both ends send these. */
function actionBody(action: TimerAction): Record<string, unknown> {
  if (action.kind === "duration") return { action: "duration", durationMs: action.durationMs }
  if (action.kind === "add") return { action: "add", ms: action.ms }
  return { action: action.kind }
}

async function ask(url: string, init?: RequestInit): Promise<RelayResult> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init })
    if (res.status === 404) return { ok: false, reason: "gone" }
    if (!res.ok) return { ok: false, reason: "offline" }
    return { ok: true, view: (await res.json()) as TimerRoomView }
  } catch {
    return { ok: false, reason: "offline" }
  }
}

/** Open a room, seeded with what the screen is showing, and get its code. */
export function openRoom(share: TimerShare): Promise<RelayResult> {
  return ask("/api/timer/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(share),
  })
}

/** Read the room and record that this side is still listening. */
export function readRoom(code: string, side: TimerSide): Promise<RelayResult> {
  return ask(`/api/timer/room/${code}?as=${side}`)
}

/** Apply one change and get the result, so a caller never has to guess what
 *  its own press did. */
export function writeRoom(
  code: string,
  side: TimerSide,
  action: TimerAction
): Promise<RelayResult> {
  return ask(`/api/timer/room/${code}?as=${side}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(actionBody(action)),
  })
}
