"use client"

import * as React from "react"
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Smartphone,
  Volume2,
  VolumeX,
} from "lucide-react"

import { usePrefersReducedMotion } from "@/components/use-reduced-motion"
import { PRESETS } from "@/lib/timer-clock"
import { cn } from "@/lib/utils"

// The controls, gathered into one panel that shows itself when you move and
// gets out of the way when you stop — including the part most implementations
// leave out: THE CURSOR GOES WITH IT. A mouse pointer parked on a three-metre
// projection is as loud as a button.
//
// Floating the controls rather than docking them has two payoffs. The dial is
// the whole screen at rest, because nothing is reserved for buttons that are
// not there; and full screen stops being a second layout, since there is
// nothing left to hide when the page is projected.

/** Every control wears the same clothes: a leading symbol, a label, no fill,
 *  so nothing in here competes with the clock. `min-h-11` holds a 44px tap
 *  target, which is the smallest a finger reliably hits. */
const CONTROL =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-brand-on-panel/10 focus-visible:ring-2 focus-visible:ring-brand-on-panel focus-visible:ring-offset-2 focus-visible:ring-offset-brand-panel focus-visible:outline-none"

/** The app's one caption treatment (`globals.css`), in ink: a label over a
 *  value being read off an instrument. */
const CAPTION = "label text-brand-ink-2"

/** How long the panel stays after the last movement. Long enough to cross it
 *  with a mouse, short enough that a still room goes back to being a clock. */
const HOLD_MS = 2600

/** Reveal the controls on any sign of a person, hide them when there is none.
 *
 *  Returns `awake` plus the handlers that pin it open, which the panel spreads
 *  onto itself. Three things keep it up: the pointer being over it, focus being
 *  inside it, and a key having just been pressed — that last one is what makes
 *  it reachable by Tab, since the keydown lands before the focus moves and the
 *  panel is visible by the time it arrives.
 *
 *  Under `prefers-reduced-motion` it never hides at all. Someone who has asked
 *  for less movement should not have to produce movement to find the buttons. */
export function useIdleChrome(): {
  awake: boolean
  wake: () => void
  pin: React.HTMLAttributes<HTMLElement>
} {
  const reduced = usePrefersReducedMotion()
  const [moved, setMoved] = React.useState(true)
  const pinnedRef = React.useRef(false)
  const timerRef = React.useRef(0)

  // Derived rather than stored, which is what keeps the reduced-motion case
  // out of the effect below: a pending hide may still fire, and it simply has
  // no effect on what is shown.
  const awake = reduced || moved

  const schedule = React.useCallback(() => {
    window.clearTimeout(timerRef.current)
    if (reduced || pinnedRef.current) return
    timerRef.current = window.setTimeout(() => setMoved(false), HOLD_MS)
  }, [reduced])

  const wake = React.useCallback(() => {
    setMoved(true)
    schedule()
  }, [schedule])

  React.useEffect(() => {
    if (reduced) return
    const on = () => wake()
    // `pointermove` covers the mouse and `pointerdown` the finger; a tap wakes
    // the panel without pressing anything in it, because a hidden panel takes
    // no pointer events at all.
    window.addEventListener("pointermove", on)
    window.addEventListener("pointerdown", on)
    window.addEventListener("keydown", on)
    window.addEventListener("wheel", on, { passive: true })
    schedule()
    return () => {
      window.removeEventListener("pointermove", on)
      window.removeEventListener("pointerdown", on)
      window.removeEventListener("keydown", on)
      window.removeEventListener("wheel", on)
      window.clearTimeout(timerRef.current)
    }
  }, [reduced, wake, schedule])

  const hold = React.useCallback(
    (on: boolean) => {
      pinnedRef.current = on
      if (on) {
        setMoved(true)
        window.clearTimeout(timerRef.current)
      } else {
        schedule()
      }
    },
    [schedule]
  )

  return {
    awake,
    wake,
    pin: {
      onPointerEnter: () => hold(true),
      onPointerLeave: () => hold(false),
      onFocus: () => hold(true),
      onBlur: () => hold(false),
    },
  }
}

export type TimerChromeProps = {
  awake: boolean
  pin: React.HTMLAttributes<HTMLElement>
  running: boolean
  finished: boolean
  muted: boolean
  fullscreen: boolean
  /** Seconds, so a preset can tell whether it is the one selected. */
  durationSeconds: number
  onToggle: () => void
  onReset: () => void
  onAddMinute: () => void
  onChoose: (minutes: number) => void
  onToggleMuted: () => void
  onToggleFullscreen: () => void
  remote: {
    code: string | null
    online: boolean
    phoneHere: boolean
  }
  onToggleRemote: () => void
  /** Host for the pairing line, read on the client so it is right on
   *  localhost, behind a reverse proxy and on a public domain alike. */
  remoteHost: string
}

function Divider() {
  return <span aria-hidden className="hidden h-6 w-px bg-brand-on-panel/20 lg:block" />
}

function TimerChrome({
  awake,
  pin,
  running,
  finished,
  muted,
  fullscreen,
  durationSeconds,
  onToggle,
  onReset,
  onAddMinute,
  onChoose,
  onToggleMuted,
  onToggleFullscreen,
  remote,
  onToggleRemote,
  remoteHost,
}: TimerChromeProps) {
  const presetChip = (p: number) => (
    <button
      key={p}
      type="button"
      onClick={() => onChoose(p)}
      aria-pressed={p * 60 === durationSeconds}
      aria-label={`${p} ${p === 1 ? "minute" : "minutes"}`}
      className={cn(
        "min-h-11 min-w-11 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-brand-on-panel focus-visible:ring-offset-2 focus-visible:ring-offset-brand-panel focus-visible:outline-none",
        p * 60 === durationSeconds
          ? "bg-brand-face text-brand-ink"
          : "text-brand-on-panel hover:bg-brand-on-panel/15"
      )}
    >
      {/* The prime is the minute mark, so each chip carries its own unit and
          the row needs no "min" label trailing after it. */}
      {p}′
    </button>
  )

  return (
    // A panel over the middle of the screen, not a row at the foot of the
    // column. Two things follow from floating it: the dial keeps the whole page
    // at rest, and opacity is the only thing that changes, so nothing on the
    // page moves as the controls come and go — the difference between chrome
    // that appears and chrome that shoves.
    //
    // Centred by a full-width row rather than by `left-1/2` plus a translate.
    // An absolutely positioned box sized to its content measures that content
    // against the space from its own left edge to the container's right one,
    // so `left-1/2` quietly halves the width available to it and the controls
    // wrap into three lines on a screen wide enough for one.
    <div
      // A handle for headless checks: that this fades when idle, comes back on
      // Tab, and never fades at all under reduced motion.
      data-timer-controls=""
      className={cn(
        "pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-4 transition-opacity duration-300 ease-out",
        awake ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        {...pin}
        className={cn(
          "relative flex max-w-full flex-col items-stretch",
          awake && "pointer-events-auto"
        )}
      >
        {/* The fill lives on this row, NOT on the column around it. While the
            column carried it, the slot below was already painted at full
            height the instant a phone paired, and the paper then took half a
            second to cover it: the fill read as a second, faster sheet sliding
            under the first. An unpainted slot shows the dial behind it until
            the paper arrives, which is what a till actually looks like.

            The panel is a solid deep fill rather than a translucent tint of
            the ground, because it floats over the brightest surface on the
            page: a tint reads as a smear once the thing behind it is white. */}
        <div
          className={cn(
            "flex max-w-full flex-col items-center gap-1 bg-brand-panel p-2 shadow-[0_14px_36px_rgb(0_0_0/0.3)] ring-1 ring-brand-on-panel/20",
            // Rounded, and concentric with the controls inside it (see the
            // radius scale in `globals.css`). The foot goes SQUARE the moment
            // a receipt is out: the paper is a sibling directly below, not a
            // layer behind, so a rounded bottom edge would leave the two
            // corners open and show the bright dial through them, right above
            // the sheet's own straight top edge. Flat there makes the join a
            // slot, which is what paper actually comes out of.
            remote.code ? "rounded-t-2xl" : "rounded-2xl"
          )}
        >
          {/* The lengths get a row of their own, above the controls: every
              chip in it is a number of minutes, smallest first, so the row
              reads as one scale from a quick check-in to a full hour. */}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
            {PRESETS.map(presetChip)}
          </div>

          <div className="flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-1">
            <div className="flex items-center">
              <button
                type="button"
                onClick={onToggle}
                // The primary action keeps full-strength ink while the rest sit
                // at 70%: same treatment, but Start is still the one you can
                // find from the back of the room.
                className={cn(CONTROL, "text-brand-on-panel")}
              >
                {running ? <Pause className="size-5" /> : <Play className="size-5" />}
                {running ? "Pause" : finished ? "Start again" : "Start"}
              </button>
              <button
                type="button"
                onClick={onReset}
                className={cn(CONTROL, "text-brand-on-panel/70 hover:text-brand-on-panel")}
              >
                <RotateCcw className="size-5" />
                Reset
              </button>
              {/* The plus is the symbol rather than a character in the label,
                  so this control wears the same clothes as the others. */}
              <button
                type="button"
                onClick={onAddMinute}
                aria-label="Add one minute"
                className={cn(CONTROL, "text-brand-on-panel/70 hover:text-brand-on-panel")}
              >
                <Plus className="size-5" />1 min
              </button>
            </div>

            <Divider />

            <div className="flex items-center">
              <button
                type="button"
                onClick={onToggleMuted}
                aria-pressed={muted}
                className={cn(CONTROL, "text-brand-on-panel/70 hover:text-brand-on-panel")}
              >
                {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                {muted ? "Sound off" : "Sound on"}
              </button>
              <button
                type="button"
                onClick={onToggleFullscreen}
                aria-pressed={fullscreen}
                className={cn(CONTROL, "text-brand-on-panel/70 hover:text-brand-on-panel")}
              >
                {fullscreen ? (
                  <Minimize className="size-5" />
                ) : (
                  <Maximize className="size-5" />
                )}
                {fullscreen ? "Leave full screen" : "Full screen"}
              </button>
              <button
                type="button"
                onClick={onToggleRemote}
                aria-pressed={remote.code !== null}
                className={cn(
                  CONTROL,
                  remote.code
                    ? "text-brand-on-panel"
                    : "text-brand-on-panel/70 hover:text-brand-on-panel"
                )}
              >
                <Smartphone className="size-5" />
                Phone
              </button>
            </div>
          </div>
        </div>

        {/* The pairing details, fed out from under the panel the way a till
            feeds a receipt. It is the one thing on this page somebody reads
            off a screen while holding something else, so it gets paper, ink
            and size rather than a muted line in the chrome.

            It sits INSIDE the panel, which grows and re-centres the moment a
            phone is paired. Hanging it below the panel instead kept the
            controls pinned to the middle, but on a phone the receipt then
            reached down over the clock and its own clip cut the end off the
            address. The re-centring is instant and happens on a button press,
            not during the fade, so nothing animates its way across the page.

            The clip around it is the slot it feeds out of: the receipt starts
            translated a full height up, inside that clip, and slides down into
            place. The clip has no fill of its own, so nothing is painted in
            the part of the slot the paper has not reached yet.

            The paper carries a thick bottom BORDER in a darker tone of itself,
            never black: a pale sheet fed out over a near-white dial has
            nothing but a shadow holding its lower edge, and a shadow is not
            structure. Ink text on it, always. */}
        {remote.code && (
          <div className="overflow-hidden rounded-b-2xl">
            <div className="receipt-feed border-b-4 border-brand-receipt-edge bg-brand-receipt px-5 pt-4 pb-5">
              {/* One sentence of why, then the two things somebody actually
                  reads off the screen, each under its own label.

                  Two fields and not one paragraph because they are read in two
                  separate glances: you take the address, look down and type
                  it, look up again and take the code.

                  Everything inside is LEFT aligned on one edge, in a block
                  centred as a whole. Centring each line individually gives
                  every row a different starting point, which is exactly what
                  you do not want in something transcribed under time
                  pressure. */}
              <div className="mx-auto flex w-fit max-w-full flex-col gap-3 text-left">
                <p className="text-sm text-brand-ink-2">
                  Type the URL below in your phone&rsquo;s browser to control the timer
                  remotely:
                </p>

                <div className="grid gap-3 border-t border-brand-ink/15 pt-3 sm:grid-cols-[1fr_auto] sm:gap-6">
                  <div className="min-w-0">
                    <p className={CAPTION}>Address</p>
                    {/* `wbr` offers the path boundary as the place to break, so
                        a narrow phone splits this after the host instead of
                        mid-word with one orphaned letter on its own line. The
                        anywhere-wrap stays as the last resort for a host long
                        enough that even a segment does not fit. */}
                    <p className="mt-1 text-lg font-bold text-brand-ink [overflow-wrap:anywhere]">
                      {remoteHost}
                      <wbr />
                      /remote
                    </p>
                  </div>

                  <div className="sm:border-l sm:border-brand-ink/15 sm:pl-6">
                    <p className={CAPTION}>Code</p>
                    {/* Mono, because this is five characters being copied one
                        at a time rather than a word being read. The negative
                        right margin takes back the letter-space the tracking
                        adds AFTER the last character, which otherwise sits the
                        code visibly off its own left edge. */}
                    <p className="mt-1 font-mono text-4xl font-bold tracking-[0.25em] text-brand-ink [margin-right:-0.25em]">
                      {remote.code}
                    </p>
                  </div>
                </div>

                <p className={cn(CAPTION, "flex items-center gap-2")}>
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      remote.phoneHere ? "bg-brand-ink" : "bg-brand-ink/30"
                    )}
                  />
                  {remote.phoneHere
                    ? "Phone connected"
                    : remote.online
                      ? "Waiting for the phone"
                      : "Relay unreachable"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export type TimerHintsProps = {
  fullscreen: boolean
  remote: { pairing: boolean; dropped: boolean }
}

/** The keys, set quietly under the clock.
 *
 *  Deliberately NOT inside the floating panel: a legend that fades is a legend
 *  you have to summon, and these three are what tell a first-time user the
 *  panel can be summoned at all. They do go in full screen, where the page is
 *  being projected and the facilitator already knows them. */
function TimerHints({ fullscreen, remote }: TimerHintsProps) {
  return (
    <div
      className={cn(
        "relative z-10 flex shrink-0 flex-col items-center gap-1 text-center",
        fullscreen && "hidden"
      )}
    >
      {remote.pairing && <p className="label text-brand-on-ground/60">Pairing&hellip;</p>}
      {remote.dropped && (
        <p className="label text-brand-on-ground/60">
          Remote dropped. Press R to pair again.
        </p>
      )}
      <p className="label flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-brand-on-ground/60">
        <span>
          <Key>Space</Key> start or pause
        </span>
        <span>
          <Key>F</Key> full screen
        </span>
        <span>
          <Key>R</Key> phone remote
        </span>
      </p>
    </div>
  )
}

/** A key name. No box around it: a drawn keycap is a picture of a keyboard,
 *  and the only thing that has to carry here is which letter to press. The
 *  contrast step between the key and its description does that on its own. */
function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="font-sans text-brand-on-ground/90">{children}</kbd>
}

export { TimerChrome, TimerHints }
