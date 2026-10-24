"use client"

import * as React from "react"
import { Pause, Play, RotateCcw } from "lucide-react"

import { useBrand } from "@/components/brand-provider"
import { Watermark } from "@/components/watermark"
import { needsPlinth } from "@/lib/brand"
import { DEFAULT_MINUTES, PRESETS, formatClock, parseDuration } from "@/lib/timer-clock"
import {
  DEFAULT_RELAY_PATH,
  type RelayResult,
  readRoom,
  writeRoom,
} from "@/lib/timer-relay-client"
// Type only: the relay module imports node:crypto and must never be bundled
// for a browser. Keep this an `import type`.
import type { TimerAction, TimerRoomView } from "@/lib/timer-room"
import { cn } from "@/lib/utils"
import { TIMER_VERSION } from "@/lib/version"

// The phone half of the remote. The facilitator stands with the room and still
// starts, pauses, extends and retimes the clock on the projector.
//
// It keeps no authority over the countdown: every press goes to the relay and
// the relay's answer is what moves the digits here, so the phone and the
// projector can never disagree. What a press gets immediately is a flash on
// the button, which is all a thumb needs to know it landed — the same trick
// html-deck-kit's remote uses, and the reason this page carries no second copy
// of the start/pause/reset rules.

const POLL_MS = 1000
const PEER_TIMEOUT_MS = 4000
const CODE_LENGTH = 5
/** Every length the grid offers, smallest first, and how many sit in a row.
 *  The column count drives both the grid and the extra minute's span, so the
 *  two can never disagree about where a row ends. */
const LENGTHS = PRESETS
const GRID_COLUMNS = 4

/** What the dot at the top is saying. Four states, because "it is not working"
 *  has four different answers and only one of them is the phone's fault.
 *  `null` is a fifth thing and not one of them: nothing has been tried yet. The
 *  page opened saying "Offline. Use the laptop." before anybody had touched it,
 *  which reads as a fault report about a connection that was never attempted. */
type Link = "listening" | "waiting" | "offline" | "gone"

const LINK_TEXT: Record<Link, string> = {
  listening: "Connected to the screen",
  waiting: "No screen yet. Press R on the laptop.",
  offline: "Offline. Use the laptop.",
  gone: "That code is not live. Check the screen.",
}

function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH)
}

export type TimerRemoteProps = {
  /** Where the relay routes are served, when not at `/api/timer/room`. */
  relayPath?: string
  /** On the root `<main>`. The id defaults to "main", a skip link's target. */
  id?: string
  /** Merged onto the root `<main>`, last, so it can undo a host's own rules
   *  for `main` elements. */
  className?: string
  /** Replaces the brand's watermark. Leave it out for the default; pass null
   *  for none. */
  watermark?: React.ReactNode
}

function TimerRemote({
  relayPath = DEFAULT_RELAY_PATH,
  id = "main",
  className,
  watermark,
}: TimerRemoteProps = {}) {
  const brand = useBrand()

  const [code, setCode] = React.useState<string | null>(null)
  const [entry, setEntry] = React.useState("")
  const [link, setLink] = React.useState<Link | null>(null)

  const [durationMs, setDurationMs] = React.useState(DEFAULT_MINUTES * 60_000)
  const [remainingMs, setRemainingMs] = React.useState(DEFAULT_MINUTES * 60_000)
  const [running, setRunning] = React.useState(false)
  const [flash, setFlash] = React.useState<string | null>(null)
  // Raw keystrokes while the field has focus, the live clock the rest of the
  // time. null means nobody is typing. Same arrangement as the screen's own
  // readout, and the same grammar: 7:30, 1:05:00, or a bare 20 for minutes.
  const [draft, setDraft] = React.useState<string | null>(null)

  const deadlineRef = React.useRef(0)
  const revRef = React.useRef(0)

  const finished = remainingMs <= 0

  /** Take the relay's word for it. The deadline is rebuilt against THIS
   *  phone's clock from the milliseconds remaining, which is why no timestamp
   *  crosses the wire: see the note at the top of `lib/timer-room.ts`. */
  const absorb = React.useCallback((view: TimerRoomView) => {
    setLink(view.peerAgo !== null && view.peerAgo < PEER_TIMEOUT_MS ? "listening" : "waiting")
    if (view.rev === revRef.current) return
    revRef.current = view.rev
    setDraft(null)
    setDurationMs(view.durationMs)
    setRemainingMs(view.remainingMs)
    if (view.running && view.remainingMs > 0) {
      deadlineRef.current = Date.now() + view.remainingMs
      setRunning(true)
    } else {
      setRunning(false)
    }
  }, [])

  const send = React.useCallback(
    (action: TimerAction, tag: string) => {
      if (!code) return
      setFlash(tag)
      window.setTimeout(() => setFlash(null), 180)
      void writeRoom(code, "phone", action, relayPath).then((result) => {
        if (result.ok) absorb(result.view)
        else setLink(result.reason)
      })
    },
    [code, absorb, relayPath]
  )

  /** Take whatever is in the field. Unparseable input silently reverts to the
   *  current duration rather than throwing an error at somebody mid-workshop,
   *  and a value that has not changed is not worth a round trip. */
  const commitDraft = React.useCallback(() => {
    if (draft === null) return
    const seconds = parseDuration(draft)
    setDraft(null)
    if (seconds !== null && seconds * 1000 !== durationMs) {
      send({ kind: "duration", durationMs: seconds * 1000 }, "field")
    }
  }, [draft, durationMs, send])

  /** What to do with the relay's answer to a pairing attempt. Shared by the
   *  field and by a code in the address, so the two cannot drift. */
  const land = React.useCallback(
    (next: string, result: RelayResult) => {
      if (!result.ok) {
        setLink(result.reason)
        return
      }
      revRef.current = 0
      setCode(next)
      setEntry("")
      absorb(result.view)
      // The code goes in the fragment, so reopening the page after the phone
      // locks reconnects without typing it again. A fragment never reaches the
      // server, which is the right place for it.
      window.history.replaceState(null, "", `#${next}`)
    },
    [absorb]
  )

  const [connecting, setConnecting] = React.useState(false)
  const connect = React.useCallback(
    (raw: string) => {
      const next = cleanCode(raw)
      if (next.length !== CODE_LENGTH) return
      setConnecting(true)
      void readRoom(next, "phone", relayPath).then((result) => {
        setConnecting(false)
        land(next, result)
      })
    },
    [land, relayPath]
  )

  // Reconnect from the fragment on open, so a code typed once survives the
  // phone locking, the browser being swiped away and the page being reloaded.
  React.useEffect(() => {
    const fromHash = cleanCode(window.location.hash.slice(1))
    if (fromHash.length !== CODE_LENGTH) return
    let live = true
    void readRoom(fromHash, "phone", relayPath).then((result) => {
      if (live) land(fromHash, result)
    })
    return () => {
      live = false
    }
  }, [land, relayPath])

  // One poll per tick while paired, with a busy flag so a reply slower than the
  // interval cannot stack requests on a weak venue network, and nothing at all
  // while the phone is in a pocket.
  React.useEffect(() => {
    if (!code) return
    let busy = false
    const beat = async () => {
      if (busy || document.hidden) return
      busy = true
      const result = await readRoom(code, "phone", relayPath)
      busy = false
      if (result.ok) absorb(result.view)
      else if (result.reason === "gone") {
        revRef.current = 0
        setCode(null)
        setLink("gone")
      } else setLink("offline")
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
  }, [code, absorb, relayPath])

  // The same deadline-driven tick as the screen, at a quarter of the rate:
  // there is no wedge here to keep smooth, only digits that change once a
  // second.
  React.useEffect(() => {
    if (!running) return
    const tick = () => {
      const left = deadlineRef.current - Date.now()
      setRemainingMs(left <= 0 ? 0 : left)
      if (left <= 0) setRunning(false)
    }
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [running])

  // Hold the phone's screen on while the clock is running, so the remote is
  // still there when the facilitator looks down. Released as soon as it stops,
  // rather than held for the whole session, which would be somebody's battery.
  React.useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    navigator.wakeLock
      .request("screen")
      .then((s) => {
        if (cancelled) void s.release()
        else sentinel = s
      })
      .catch(() => {})
    return () => {
      cancelled = true
      void sentinel?.release().catch(() => {})
    }
  }, [running])

  const durationSeconds = Math.round(durationMs / 1000)
  const fieldText = draft ?? formatClock(remainingMs)

  return (
    <main
      id={id}
      data-timer-version={TIMER_VERSION}
      className={cn(
        "timer-font-body relative flex h-dvh flex-col overflow-hidden bg-linear-135 from-brand-ground-from from-0% via-brand-ground via-40% to-brand-ground-to select-none",
        className
      )}
    >
      {/* The same ground as the screen it drives. Sized by HEIGHT, not by a
          width percentage: a phone is a tall narrow band, so a watermark whose
          WIDTH bleeds off the sides is left floating in the middle of the
          screen, which is the stamp a watermark exists not to be. 120dvh
          bleeds top and bottom at any aspect ratio, and a mark wider than it
          is tall then runs off the sides for free. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {watermark === undefined ? <Watermark className="h-[120dvh] w-auto" /> : watermark}
      </div>

      <h1 className="sr-only">{brand.name} remote</h1>

      {/* The light only burns once there is something for it to report. Before
          pairing the one instruction on the page is the label over the field,
          and a status line beside it would be answering a question nobody has
          asked yet. */}
      <header className="relative z-10 flex min-h-9 shrink-0 items-center gap-2 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 text-sm text-brand-on-ground/80">
        {code && link && (
          <>
            <span
              aria-hidden
              // Three steps of BRIGHTNESS rather than three colours. A
              // white-label brand has no green and no amber to borrow, and
              // inventing a pair would put two more colours on a page whose
              // whole argument is that there is one accent and it means time.
              // The wording beside the dot names the state; the dot only says
              // how much of a connection there is.
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                link === "listening"
                  ? "bg-brand-face"
                  : link === "waiting"
                    ? "bg-brand-on-ground/55"
                    : "bg-brand-on-ground/25"
              )}
            />
            <span>{LINK_TEXT[link]}</span>
            <span className="ml-auto timer-font-mono font-bold text-brand-on-ground">{code}</span>
          </>
        )}
      </header>

      {code === null ? (
        // Before pairing there is one job on this page, so it is the only thing
        // on it. The code is five characters read off a screen at the front of
        // a room, which is why the field is display-sized and spaced out.
        <form
          onSubmit={(e) => {
            e.preventDefault()
            connect(entry)
          }}
          className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6"
        >
          <label htmlFor="pair-code" className="text-center text-base text-brand-on-ground/80">
            Enter the code shown on the screen
          </label>
          <input
            id="pair-code"
            value={entry}
            onChange={(e) => setEntry(cleanCode(e.target.value))}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={CODE_LENGTH}
            className="w-full max-w-xs bg-brand-face px-5 py-4 text-center timer-font-display text-4xl font-bold tracking-[0.2em] text-brand-ink uppercase outline-none focus-visible:ring-4 focus-visible:ring-brand-on-ground/60"
          />
          <button
            type="submit"
            disabled={entry.length < CODE_LENGTH || connecting}
            className="min-h-11 bg-brand-face px-7 py-3 text-base font-bold text-brand-ink transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-brand-on-ground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ground focus-visible:outline-none disabled:bg-brand-on-ground/20 disabled:text-brand-on-ground/50"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
          {link && link !== "listening" && link !== "waiting" && !connecting && (
            <p aria-live="polite" className="text-center text-sm text-brand-on-ground/80">
              {LINK_TEXT[link]}
            </p>
          )}
        </form>
      ) : (
        <>
          {/* Every length in rows of four, above the clock rather than below
              it, smallest first, then the extra minute: it belongs with them,
              since everything in this grid is a number of minutes. The
              lengths rarely divide evenly into rows, so the extra minute
              stretches across whatever the last row has left and the block
              stays square. */}
          <div className="relative z-10 shrink-0 px-5 pb-1">
            <p className="timer-label mb-2 text-brand-on-ground/60">
              Minutes
            </p>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}
            >
              {LENGTHS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send({ kind: "duration", durationMs: p * 60_000 }, `p${p}`)}
                  aria-pressed={p * 60 === durationSeconds}
                  aria-label={`${p} ${p === 1 ? "minute" : "minutes"}`}
                  className={cn(
                    "min-h-12 text-base font-bold transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-brand-on-ground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ground focus-visible:outline-none",
                    p * 60 === durationSeconds
                      ? "bg-brand-face text-brand-ink"
                      : "text-brand-on-ground ring-1 ring-brand-on-ground/25",
                    flash === `p${p}` && "brightness-75"
                  )}
                >
                  {p}′
                </button>
              ))}
              {/* Filled rather than outlined, because it DOES something where
                  the others only say what the clock is set to. Its span is
                  worked out from the count, not written down, so adding or
                  removing a length cannot leave a hole in the last row. */}
              <button
                type="button"
                onClick={() => send({ kind: "add", ms: 60_000 }, "add")}
                aria-label="Add one minute"
                style={{ gridColumn: `span ${GRID_COLUMNS - (LENGTHS.length % GRID_COLUMNS)}` }}
                className={cn(
                  "min-h-12 bg-brand-on-ground/15 text-base font-bold text-brand-on-ground ring-1 ring-brand-on-ground/30 transition-[filter] duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-brand-on-ground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ground focus-visible:outline-none",
                  flash === "add" && "brightness-75"
                )}
              >
                +1′
              </button>
            </div>
          </div>

          {/* The readout is the flexible row, the same arrangement the screen
              uses: it absorbs whatever the fixed controls below leave over, so
              one layout fits a small phone and a large one with no breakpoint
              guesses. */}
          <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-3">
            <div
              data-timer-plate={needsPlinth(brand) ? "on" : "off"}
              className={cn(
                "focus-within:ring-2 focus-within:ring-brand-on-ground/60",
                needsPlinth(brand) && "rounded-[var(--brand-radius-control,12px)] bg-brand-face px-3 py-1",
                finished && "opacity-80"
              )}
            >
              {/* Typeable, like the one on the screen. The phone is often the
                  only thing in reach once a session has started, so the length
                  has to be settable from here and not just from the presets.
                  The accent on a bright plinth at display size, which is the
                  one reading on either page allowed to take a brand colour:
                  it is an instrument's value, not emphasis on prose. */}
              <input
                data-timer-digits=""
                value={fieldText}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => {
                  const whole = formatClock(durationMs)
                  const el = e.currentTarget
                  setDraft(whole)
                  // Select the lot so the first keystroke replaces the time.
                  // Once synchronously, and again next frame for when React is
                  // about to rewrite the value — guarded both times, because an
                  // unguarded deferred select lands AFTER the first keystroke on
                  // a busy page and eats it. The screen's field had exactly that
                  // bug.
                  const selectWhole = () => {
                    if (el.value === whole) el.select()
                  }
                  selectWhole()
                  requestAnimationFrame(selectWhole)
                }}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitDraft()
                    e.currentTarget.blur()
                  } else if (e.key === "Escape") {
                    setDraft(null)
                    e.currentTarget.blur()
                  }
                }}
                readOnly={running}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                aria-label="Countdown length, as minutes and seconds"
                // SIZED FROM THE STRING, not from a fixed clamp.
                //
                // The phone has one job and the clock is it, so the digits
                // should fill the width. A single font size cannot: the
                // readout is "20:00" for most of a session and "00:59:94" in
                // the last minute, and a size that fills the width with five
                // characters sends eight of them off both edges. So the size
                // divides the available width by the character count, and the
                // readout stays edge to edge as it changes shape.
                //
                // 0.645 is the per-character advance in ems, measured on the
                // real face rather than guessed: the figures are tabular, so
                // every character in this string has the same advance, and the
                // `ch` unit used for the width is the slightly wider
                // proportional zero, which keeps the box a hair clear of the
                // ink. The vh ceiling is there for a short, wide screen, where
                // width is not the binding constraint.
                style={{
                  width: `${fieldText.length + 0.1}ch`,
                  fontSize: `min(calc((100vw - 1.5rem) / ${(fieldText.length * 0.645).toFixed(3)}), 24vh)`,
                }}
                className={cn(
                  "block bg-transparent text-center timer-font-display leading-none font-extrabold tracking-[-0.03em] tabular-nums outline-none read-only:cursor-default",
                  needsPlinth(brand) ? "text-brand-accent-face" : "text-brand-accent"
                )}
              />
            </div>
          </div>

          <p aria-live="polite" className="sr-only">
            {finished
              ? "Time is up."
              : running
                ? `Running, ${formatClock(remainingMs)} left.`
                : `Paused at ${formatClock(remainingMs)}.`}
          </p>

          {/* Only the transport down here, where a thumb rests. Start takes
              the width because it is the one control reached for while
              talking; everything that SETS the clock has moved to the top of
              the screen, out of that thumb's way. */}
          <div className="relative z-10 flex shrink-0 gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => send({ kind: running ? "pause" : "start" }, "run")}
              className={cn(
                "flex min-h-24 flex-[2] items-center justify-center gap-3 bg-brand-face text-2xl font-bold text-brand-ink transition-[filter] duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-brand-on-ground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ground focus-visible:outline-none",
                flash === "run" && "brightness-75"
              )}
            >
              {running ? "Pause" : finished ? "Start again" : "Start"}
              {running ? <Pause className="size-7" /> : <Play className="size-7" />}
            </button>
            <button
              type="button"
              onClick={() => send({ kind: "reset" }, "reset")}
              className={cn(
                "flex min-h-24 flex-1 flex-col items-center justify-center gap-1 text-base font-bold text-brand-on-ground ring-1 ring-brand-on-ground/30 transition-[filter] duration-150 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-brand-on-ground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ground focus-visible:outline-none",
                flash === "reset" && "brightness-75"
              )}
            >
              <RotateCcw className="size-6" />
              Reset
            </button>
          </div>
        </>
      )}
    </main>
  )
}

export { TimerRemote }
