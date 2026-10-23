import type { NextRequest } from "next/server"

import {
  applyAction,
  findRoom,
  isSameOrigin,
  isValidCode,
  markSeen,
  normaliseCode,
  parseAction,
  viewRoom,
} from "@/lib/timer-room"

// One paired countdown. GET reads it and records that this side is still
// listening; POST applies one change and hands back the result, so the caller
// never has to guess what its own action did.
//
// Both sides use both verbs: the phone to drive the screen, the screen to tell
// the phone about a press on the laptop. `?as=screen|phone` only says which of
// the two is asking, which is what draws the phone's traffic light and the
// screen's "phone connected" dot.
export const dynamic = "force-dynamic"

/** Spelled out rather than taken from Next's generated `RouteContext<path>`
 *  helper, which only exists after `next typegen` has run: a plain `tsc
 *  --noEmit` on a clean checkout would not type-check otherwise. `params` is a
 *  promise in this version of Next. */
type RouteParams = { params: Promise<{ code: string }> }

/** 404 for a code that is merely wrong and for one whose room has gone, on
 *  purpose: the phone's reconnect path is identical either way, and neither
 *  needs to know which it was. */
function roomFor(raw: string) {
  const code = normaliseCode(raw)
  return isValidCode(code) ? findRoom(code) : null
}

function sideFrom(request: NextRequest) {
  return request.nextUrl.searchParams.get("as") === "phone" ? "phone" : "screen"
}

export async function GET(request: NextRequest, ctx: RouteParams) {
  const room = roomFor((await ctx.params).code)
  if (!room) return new Response("No such room", { status: 404 })
  const side = sideFrom(request)
  markSeen(room, side)
  return Response.json(viewRoom(room, side))
}

export async function POST(request: NextRequest, ctx: RouteParams) {
  if (!isSameOrigin(request)) return new Response("Cross-origin", { status: 403 })

  const room = roomFor((await ctx.params).code)
  if (!room) return new Response("No such room", { status: 404 })

  const action = parseAction(await request.json().catch(() => null))
  if (!action) return new Response("Bad action", { status: 400 })

  const side = sideFrom(request)
  markSeen(room, side)
  applyAction(room, action)
  return Response.json(viewRoom(room, side))
}
