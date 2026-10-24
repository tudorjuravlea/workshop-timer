"use client"

import * as React from "react"

import {
  DEFAULT_RELAY_PATH,
  type TimerShare,
  openRoom,
  readRoom,
  writeRoom,
} from "@/lib/timer-relay-client"
// Type only, so nothing from the relay module (which imports node:crypto)
// reaches the browser bundle. Keep this an `import type`.
import type { TimerAction, TimerRoomView } from "@/lib/timer-room"

// The projected screen's half of the phone remote. The phone's half is
// `components/timer-remote.tsx`; the relay they meet in is `lib/timer-room.ts`,
// which
// explains why state crosses the wire instead of taps.
//
// Polling, not a socket, for the two reasons html-deck-kit gives and a third of
// its own: short polls get through the kind of venue network that blocks
// everything but HTTPS, a phone that locks and wakes needs no reconnect, and a
// relay that is only ever read cannot hold a connection open against a Next
// server that restarts on every deploy. One second each way, where the deck
// kit uses 300ms: a slide has to turn on the beat of a sentence, where a
// quarter-second on a fifteen-minute countdown is not perceptible.

const POLL_MS = 1000

/** How long the other side may be silent before its light goes out. Four
 *  seconds is three missed polls, so a single slow reply never flickers it. */
const PEER_TIMEOUT_MS = 4000

export type TimerRemote = {
  /** The code on the wall, or null when nothing is paired. */
  code: string | null
  /** A pairing request is in flight. */
  pairing: boolean
  /** The relay answered the last poll. */
  online: boolean
  /** A phone has asked about this room in the last few seconds. */
  phoneHere: boolean
  /** The room went away under us, almost always a deploy. Cleared by pairing
   *  again, which is the only cure. */
  dropped: boolean
  /** Open a room seeded with what this screen is showing right now. */
  pair: (share: TimerShare) => void
  unpair: () => void
  /** Tell the relay about a change the person made on this screen, so the
   *  phone's buttons and clock follow the laptop as well as drive it. */
  publish: (action: TimerAction) => void
}

export function useTimerRemote({
  onAdopt,
  relayPath = DEFAULT_RELAY_PATH,
}: {
  /** A change that came from the phone. Called with the relay's state, never
   *  with the echo of something this screen just published. */
  onAdopt: (state: TimerShare) => void
  /** Where the relay routes are served. */
  relayPath?: string
}): TimerRemote {
  const [code, setCode] = React.useState<string | null>(null)
  const [pairing, setPairing] = React.useState(false)
  const [online, setOnline] = React.useState(false)
  const [phoneHere, setPhoneHere] = React.useState(false)
  const [dropped, setDropped] = React.useState(false)

  // Held in a ref and refreshed from an effect, so the polling loop never has
  // to be torn down and rebuilt as the clock ticks: a running countdown
  // changes state ten times a second.
  const adoptRef = React.useRef(onAdopt)
  React.useEffect(() => {
    adoptRef.current = onAdopt
  }, [onAdopt])

  /** The last revision this screen knows about, whether it caused it or heard
   *  about it. A reply carrying the same number is an echo of our own write. */
  const revRef = React.useRef(0)

  /** The code again, in a ref, so `publish` never changes identity. It is not
   *  a convenience: the hash listener on the screen is registered once and
   *  holds whatever `publish` it was given, so a `publish` that closed over
   *  `code` would still be the pre-pairing one — and retiming the clock
   *  through the URL would silently stop reaching the phone. */
  const codeRef = React.useRef<string | null>(null)

  const absorb = React.useCallback((view: TimerRoomView, adopt: boolean) => {
    setOnline(true)
    setPhoneHere(view.peerAgo !== null && view.peerAgo < PEER_TIMEOUT_MS)
    if (view.rev === revRef.current) return
    revRef.current = view.rev
    if (adopt) {
      adoptRef.current({
        durationMs: view.durationMs,
        remainingMs: view.remainingMs,
        running: view.running,
      })
    }
  }, [])

  const unpair = React.useCallback(() => {
    revRef.current = 0
    codeRef.current = null
    setCode(null)
    setOnline(false)
    setPhoneHere(false)
  }, [])

  const pair = React.useCallback((share: TimerShare) => {
    setDropped(false)
    setPairing(true)
    void openRoom(share, relayPath).then((result) => {
      setPairing(false)
      if (!result.ok) {
        setDropped(true)
        return
      }
      revRef.current = result.view.rev
      codeRef.current = result.view.code
      setCode(result.view.code)
      setOnline(true)
    })
  }, [relayPath])

  const publish = React.useCallback(
    (action: TimerAction) => {
      const current = codeRef.current
      if (!current) return
      void writeRoom(current, "screen", action, relayPath).then((result) => {
        if (!result.ok) {
          setOnline(false)
          return
        }
        // Record the revision without adopting: this screen has already made
        // the change locally, and re-applying the relay's answer to it would
        // show as a stutter on the dial.
        absorb(result.view, false)
      })
    },
    [absorb, relayPath]
  )

  // One poll per tick while paired. An interval rather than a chain of
  // timeouts, so this never has to name itself, with a busy flag because a
  // reply slower than the interval would otherwise stack requests on a weak
  // venue network. A hidden tab is skipped: a laptop asleep in a bag should
  // not keep a room alive, and one poll on return catches up completely.
  React.useEffect(() => {
    if (!code) return
    let busy = false
    const beat = async () => {
      if (busy || document.hidden) return
      busy = true
      const result = await readRoom(code, "screen", relayPath)
      busy = false
      if (result.ok) {
        absorb(result.view, true)
      } else if (result.reason === "gone") {
        // The relay is memory, so a deploy takes the room with it. Nothing can
        // be recovered: say so, and let one press of R open a new one. The
        // countdown on this screen is untouched either way.
        unpair()
        setDropped(true)
      } else {
        setOnline(false)
        setPhoneHere(false)
      }
    }
    void beat()
    const id = window.setInterval(() => void beat(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void beat()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [code, absorb, unpair, relayPath])

  return { code, pairing, online, phoneHere, dropped, pair, unpair, publish }
}
