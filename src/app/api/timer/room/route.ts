import type { NextRequest } from "next/server"

import { clampMs } from "@/lib/timer-clock"
import { createRoom, isSameOrigin, viewRoom } from "@/lib/timer-room"

// Opening a room for the phone remote. The screen posts what it is currently
// showing and gets back a five-character code to put on the wall; everything
// after that goes through `[code]/route.ts`.
//
// `force-dynamic` because a relay must never be served from a cache, whatever
// defaults a host or a future layout introduces above it.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Cross-origin", { status: 403 })

  const body: unknown = await request.json().catch(() => null)
  const fields = (body ?? {}) as {
    durationMs?: unknown
    remainingMs?: unknown
    running?: unknown
  }
  const durationMs = clampMs(fields.durationMs)
  if (durationMs === null) return new Response("Bad duration", { status: 400 })
  const remainingMs =
    typeof fields.remainingMs === "number" && Number.isFinite(fields.remainingMs)
      ? fields.remainingMs
      : durationMs

  const room = createRoom({ durationMs, remainingMs, running: fields.running === true })
  return Response.json(viewRoom(room, "screen"))
}
