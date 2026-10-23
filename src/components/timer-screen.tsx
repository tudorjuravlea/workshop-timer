"use client"

import * as React from "react"

import { useBrand } from "@/components/brand-provider"
import { FinishConfetti } from "@/components/finish-confetti"
import { TimerChrome, TimerHints, useIdleChrome } from "@/components/timer-chrome"
import { TimerDial } from "@/components/timer-dial"
import { useTimerRemote } from "@/components/use-timer-remote"
import { Watermark } from "@/components/watermark"
import { playGong, playTick, tickFor } from "@/lib/timer-audio"
import { needsPlinth } from "@/lib/brand"
import {
  DEFAULT_MINUTES,
  MAX_SECONDS,
  durationFromHash,
  formatClock,
  formatClockHundredths,
  hashFor,
  parseDuration,
} from "@/lib/timer-clock"
import type { TimerShare } from "@/lib/timer-relay-client"
import { cn } from "@/lib/utils"

// A countdown for the front of a room: workshops, jams, demo rounds.
//
// The dial is the whole countdown: it starts full at any length and empties as
// the time goes, so the room reads how much of THIS exercise is left without
// anyone having to read a number. A minute added past the chosen length keeps
// the wedge full until the clock drops back under it.
//
// The whole thing is deadline-driven rather than decrement-driven: a browser
// throttles timers in a background tab, and a counter that subtracts 100ms per
// tick would quietly lose minutes while someone is presenting in another
// window. Every tick recomputes from a wall-clock deadline instead. That one
// decision is also what lets a phone drive this page from across the room:
// the relay sends how much is left and each device makes its own deadline from
// it (see `use-timer-remote.ts` and `lib/timer-room.ts`).
//
// At rest the page is the dial and the number, and nothing else. The controls
// live in a panel that appears when you move and leaves when you stop, which
// is why there is no separate full-screen layout: see `timer-chrome.tsx`.

function TimerScreen({ defaultMinutes = DEFAULT_MINUTES }: { defaultMinutes?: number }) {
  const brand = useBrand()

  const [durationMs, setDurationMs] = React.useState(defaultMinutes * 60_000)
  const [remainingMs, setRemainingMs] = React.useState(defaultMinutes * 60_000)
  const [running, setRunning] = React.useState(false)
  // How many times the countdown has reached zero here; each one is a burst.
  const [bursts, setBursts] = React.useState(0)
  const [muted, setMuted] = React.useState(false)
  // While the field has focus it holds raw keystrokes, not a formatted clock —
  // reformatting mid-typing would fight the caret. null means "not editing".
  const [draft, setDraft] = React.useState<string | null>(null)

  const deadlineRef = React.useRef(0)
  const audioRef = React.useRef<AudioContext | null>(null)

  // The pairing line names the host this screen is actually served from, so it
  // reads correctly on localhost, behind a reverse proxy and on a public
  // domain alike. Filled when pairing rather than on mount: `window` does not
  // exist during the server render, and putting a value in the markup that the
  // server cannot know is a hydration mismatch.
  const [host, setHost] = React.useState("")

  const finished = remainingMs <= 0

  /** The audio context has to be built inside a real gesture, or Safari keeps
   *  it suspended and the gong never sounds. Called from Start and from
   *  pairing a phone, because pairing may be the only time anybody touches
   *  this screen all session — after that the laptop is across the room. */
  const ensureAudio = React.useCallback(() => {
    if (!audioRef.current && typeof window.AudioContext === "function") {
      audioRef.current = new window.AudioContext()
    }
    void audioRef.current?.resume().catch(() => {})
  }, [])

  /** Take a duration from the relay, where the phone has just changed
   *  something. Deliberately not routed through the local handlers below: those
   *  publish, and publishing what we were just told would echo. */
  const adopt = React.useCallback((next: TimerShare) => {
    setDraft(null)
    setDurationMs(next.durationMs)
    setRemainingMs(next.remainingMs)
    if (next.running && next.remainingMs > 0) {
      deadlineRef.current = Date.now() + next.remainingMs
      setRunning(true)
    } else {
      setRunning(false)
    }
  }, [])

  const remote = useTimerRemote({ onAdopt: adopt })
  // Pulled out because it is the one part of `remote` that never changes
  // identity, which is what lets the hash listener below stay registered once
  // and still reach the phone.
  const { publish } = remote

  /** Set the duration and rewind to it. One path for presets, the field and the
   *  fragment, so all three can never disagree about what the clock is set to. */
  const applyDuration = React.useCallback(
    (seconds: number, syncHash = true) => {
      const ms = seconds * 1000
      setRunning(false)
      setDurationMs(ms)
      setRemainingMs(ms)
      publish({ kind: "duration", durationMs: ms })
      if (syncHash) {
        // replace, not push: the back button should leave the page, not walk
        // back through every duration someone tried.
        window.history.replaceState(null, "", `#${hashFor(seconds)}`)
      }
    },
    [publish]
  )

  // The fragment is the shareable part of the URL: `/#25` opens on 25 minutes,
  // `/#7:30` on seven and a half. Read on mount and kept in step afterwards,
  // so pasting a new fragment into a running tab retimes it.
  //
  // A fragment rather than a query parameter, and that is structural: reading
  // search parameters opts a route out of static rendering, and this page has
  // no reason to be rendered per request. A fragment never reaches the server,
  // so the page stays static and the link stays shareable. (It is also why the
  // brand can arrive in the query string without costing anything: that one is
  // applied in the browser.)
  React.useEffect(() => {
    const apply = () => {
      const seconds = durationFromHash(window.location.hash)
      if (seconds === null) return
      applyDuration(seconds, false)
    }
    apply()
    window.addEventListener("hashchange", apply)
    return () => window.removeEventListener("hashchange", apply)
  }, [applyDuration])

  // Inside the last minute the readout goes to hundredths, and that is also
  // where the ticking and the gong come from. Derived from the remaining time
  // rather than from `urgent`, so a clock PAUSED at forty seconds still shows
  // its hundredths instead of rounding itself off — and so the final frame is
  // 00:00:00 rather than snapping back to a coarser format at the one moment
  // everybody is looking at it.
  const fine = remainingMs < 60_000

  // The value always comes from the deadline, never from subtraction, so what
  // changes here is only how often it is read.
  //
  // A 100ms interval keeps whole seconds honest without the wedge ever
  // visibly stepping. Hundredths cannot be read on an interval at all: at
  // 100ms only every tenth value would ever be drawn, and the two digits would
  // step in tens instead of counting. The last minute runs on
  // requestAnimationFrame instead, which is both the fastest the screen can
  // show and the slowest that shows every value. It costs a render a frame,
  // for at most sixty seconds, and the browser stops calling it in a hidden
  // tab for free.
  React.useEffect(() => {
    if (!running) return
    const tick = () => {
      const left = deadlineRef.current - Date.now()
      if (left <= 0) {
        setRemainingMs(0)
        setRunning(false)
        setBursts((n) => n + 1)
        if (!muted && audioRef.current) playGong(audioRef.current)
        return false
      }
      setRemainingMs(left)
      return true
    }
    if (fine) {
      let frame = 0
      const loop = () => {
        if (tick()) frame = requestAnimationFrame(loop)
      }
      loop()
      return () => cancelAnimationFrame(frame)
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [running, muted, fine])

  // The ticking, scheduled on the AUDIO clock a little ahead of itself rather
  // than fired from the render loop. A `setInterval` drifts by tens of
  // milliseconds under load and the ticks would audibly wander; the audio
  // thread does not. Every 250ms this hands over any tick falling in the next
  // 600ms, and remembers which ones it has already placed.
  // What sounds at each moment is `tickFor`'s to say.
  //
  // The gong is deliberately NOT scheduled here. It sounds at the instant the
  // clock stops, which is the instant this effect tears down, and a cleanup
  // that cancels everything pending would cut it off at the strike. It fires
  // from the countdown above instead, where being a few tens of milliseconds
  // late costs nothing.
  React.useEffect(() => {
    const ctx = audioRef.current
    if (!running || muted || !ctx) return
    let pending: { node: AudioScheduledSourceNode; at: number }[] = []
    const placed = new Set<number>()
    let beat = 0
    const pump = () => {
      const now = Date.now()
      const audioNow = ctx.currentTime
      const deadline = deadlineRef.current
      // Keyed by when the tick is due, not by the time left it marks, so a
      // minute added mid-run cannot place a second tick on the same instant.
      for (let left = Math.floor((deadline - now) / 250) * 250; left > 0 && left >= deadline - now - 600; left -= 250) {
        const due = deadline - left
        const style = tickFor(left)
        if (!style || due < now || placed.has(due)) continue
        placed.add(due)
        const at = audioNow + (due - now) / 1000
        for (const node of playTick(ctx, at, style, beat++)) pending.push({ node, at })
      }
      // Forget what has already sounded, or an hour of ticks is kept alive.
      pending = pending.filter((p) => p.at > audioNow - 1)
    }
    pump()
    const id = window.setInterval(pump, 250)
    return () => {
      window.clearInterval(id)
      // Stopping a node that has already finished is a no-op; stopping one
      // whose start time is still in the future means it never sounds, which
      // is exactly what pausing should do to the rest of the run.
      for (const { node } of pending) {
        try {
          node.stop()
        } catch {}
      }
    }
  }, [running, muted])

  // Keep the screen awake while counting down — a timer that blanks halfway
  // through a workshop is worse than no timer. Silently unavailable on
  // browsers without the API, and released the moment the clock stops.
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

  const start = React.useCallback(() => {
    ensureAudio()
    deadlineRef.current = Date.now() + (remainingMs > 0 ? remainingMs : durationMs)
    if (remainingMs <= 0) setRemainingMs(durationMs)
    setRunning(true)
  }, [remainingMs, durationMs, ensureAudio])

  const toggle = React.useCallback(() => {
    if (running) {
      setRunning(false)
      publish({ kind: "pause" })
    } else {
      start()
      publish({ kind: "start" })
    }
  }, [running, start, publish])

  const reset = React.useCallback(() => {
    setRunning(false)
    setRemainingMs(durationMs)
    publish({ kind: "reset" })
  }, [durationMs, publish])

  /** Another minute on the clock that is already there.
   *
   *  It moves the time LEFT and nothing else. `durationMs` is the length that
   *  was set, so Reset still goes back to it, the preset chip stays truthful
   *  and the URL fragment keeps describing the link rather than the session.
   *  Works stopped as well as running, including after the gong, where it
   *  simply puts a minute back on the clock without restarting it — starting
   *  something is Start's job. */
  const addMinute = React.useCallback(() => {
    const next = Math.min(MAX_SECONDS * 1000, remainingMs + 60_000)
    if (running) deadlineRef.current = Date.now() + next
    setRemainingMs(next)
    publish({ kind: "add", ms: 60_000 })
  }, [remainingMs, running, publish])

  const choose = React.useCallback(
    (minutes: number) => {
      setDraft(null)
      applyDuration(minutes * 60)
    },
    [applyDuration]
  )

  /** Take whatever is in the field. Unparseable input silently reverts to the
   *  current duration rather than throwing an error at someone mid-workshop. */
  const commitDraft = React.useCallback(() => {
    if (draft === null) return
    const seconds = parseDuration(draft)
    setDraft(null)
    if (seconds !== null && seconds * 1000 !== durationMs) applyDuration(seconds)
  }, [draft, durationMs, applyDuration])

  const toggleRemote = React.useCallback(() => {
    if (remote.code) {
      remote.unpair()
      return
    }
    // Pairing is a press on this screen, and it may be the only one all
    // session: after this the laptop is across the room and every later press
    // lands on the phone. So it is also where the audio context gets its
    // gesture, or the gong at zero would never be allowed to sound.
    ensureAudio()
    setHost(window.location.host)
    remote.pair({ durationMs, remainingMs, running })
  }, [remote, ensureAudio, durationMs, remainingMs, running])

  // Fullscreen is tracked from the event, never from the button, because Esc
  // and the browser's own chrome can leave it without going through us.
  const [fullscreen, setFullscreen] = React.useState(false)
  React.useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", sync)
    sync()
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }, [])

  // What the keys do, held in a ref and refreshed after every render, so the
  // listener below can be registered ONCE and never torn down.
  //
  // That is not a tidiness point, it is the fix for a real bug. These handlers
  // change identity on every tick, so the effect used to re-subscribe ten
  // times a second — and the moment a keypress ALSO woke the control panel,
  // the wake was a genuine state change, React flushed it synchronously
  // (keydown is a discrete event), and the flush ran this effect's cleanup.
  // That cleanup called `removeEventListener` in the middle of dispatching the
  // very keypress it was about to handle, and the DOM spec skips a listener
  // removed mid-dispatch. So Space silently did nothing whenever the panel had
  // faded out, which is to say whenever anybody had stopped touching the
  // laptop for three seconds — exactly the situation this key exists for.
  const keysRef = React.useRef({ toggle, toggleFullscreen, toggleRemote })
  React.useEffect(() => {
    keysRef.current = { toggle, toggleFullscreen, toggleRemote }
  })

  // Three keys, because the laptop is usually across the room and half the time
  // nobody is holding the mouse. Space is the one that matters; F and R are
  // there because a facilitator's hands are already on the keyboard.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      const typing = el instanceof HTMLElement && el.tagName === "INPUT"
      if (e.code === "Space" || e.key === " ") {
        // Never steal the space bar from a control that has its own use for it:
        // buttons and links activate on it, and the duration field needs to
        // type.
        if (
          el instanceof HTMLElement &&
          (el.tagName === "BUTTON" || el.tagName === "A" || typing)
        )
          return
        e.preventDefault()
        keysRef.current.toggle()
      } else if (!typing && (e.key === "f" || e.key === "F")) {
        e.preventDefault()
        keysRef.current.toggleFullscreen()
      } else if (!typing && (e.key === "r" || e.key === "R")) {
        e.preventDefault()
        keysRef.current.toggleRemote()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const chrome = useIdleChrome()

  // What the field shows: raw keystrokes while it has focus, the live clock
  // the rest of the time.
  const fieldText =
    draft ?? (fine ? formatClockHundredths(remainingMs) : formatClock(remainingMs))
  const durationSeconds = Math.round(durationMs / 1000)
  const fraction = Math.min(remainingMs, durationMs) / durationMs

  // The backlight is on once the clock has been touched, turns only while it
  // runs, and goes up a gear in the last minute. No angle is computed here:
  // at a turn a second the rotation belongs to a CSS keyframe, not to a value
  // re-rendered ten times a second.
  const plinth = needsPlinth(brand)
  const started = running || remainingMs < durationMs
  const urgent = running && remainingMs > 0 && remainingMs <= 60_000

  return (
    <main
      className={cn(
        "relative flex h-dvh flex-col overflow-hidden bg-linear-135 from-brand-ground-from from-0% via-brand-ground via-40% to-brand-ground-to",
        // The pointer goes with the controls. On a projector a parked mouse
        // arrow is as loud as a button, and `cursor` inherits, so the
        // descendant variant is what actually clears it off the logo.
        !chrome.awake && "cursor-none [&_*]:cursor-none"
      )}
    >
      {/* A bare instrument: the dial carries the meaning and a visible title
          would compete with it, but the document still needs one heading, and
          it has to sit inside this landmark or it reads as stray content. */}
      <h1 className="sr-only">{brand.name}</h1>

      {/* The ground: the brand's gradient, and the brand's watermark if it has
          one. Nothing else. There were two blurred orbs here, which is the
          first thing this style asks you to take out — a soft shape with no
          edge and no job, floating over a measuring instrument. The gradient
          stays because it is doing something the flat colour cannot: it puts
          the lightest part of the field behind the top of the dial, which is
          where every reading on this face starts. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <Watermark className="h-[140%] w-auto min-w-[180%] object-cover" />
      </div>
      {/* Over the ground and under everything else, so the paper comes from
          behind the dial rather than across it. */}
      <FinishConfetti bursts={bursts} />

      {/* The brand mark, and the only thing up here. It does not fade with the
          controls: it is identity, not a control, and a projected clock is
          better for carrying a mark. A brand with no logo falls back to its
          name set quietly in the caption treatment, so a white-label
          deployment still says whose room this is without shipping an asset. */}
      <header className="relative z-10 flex min-h-11 shrink-0 items-start p-6 md:p-8">
        <BrandMark />
      </header>

      {/* The dial is the ONLY flexible row: it takes whatever height the fixed
          rows below leave over. That is what makes the page responsive without
          a single breakpoint guess — on a phone, a laptop or a projector the
          clock grows or shrinks to fit and the readout and controls are never
          pushed off the bottom. `min-h-0` is required, or a flex child refuses
          to shrink below its content and the column overflows again. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-6 md:gap-6">
        {/* The dial sits in a flexible box rather than being the flex child
            itself: an <svg> carries an intrinsic aspect ratio, which stops
            `flex-1` from handing it the full leftover height. The box takes the
            space, the drawing fills it and centres itself. */}
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
          {/* A solid disc the size of the face, under it, which is what the
              room sees once the time is up: the dial fades away and leaves the
              face blank but for the words. It also stops the confetti behind
              from showing through the fading dial. Same viewBox and box as the
              dial, so it lands exactly where the face does. */}
          <svg
            viewBox="0 0 200 200"
            aria-hidden
            className={cn(
              "absolute inset-0 size-full overflow-visible",
              // The dial carries its own shadow; the disc takes it over only
              // once the dial has gone, or the two would stack.
              finished && "drop-shadow-[0_20px_50px_rgb(0_0_0/0.35)]"
            )}
          >
            <circle cx="100" cy="100" r="94" className="fill-brand-face" />
            {finished && (
              <text
                x="100"
                y="100"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="30"
                fontWeight="800"
                className="fill-brand-accent font-sans"
              >
                Time&rsquo;s up!
              </text>
            )}
          </svg>
          <TimerDial
            fraction={fraction}
            durationSeconds={durationSeconds}
            lit={started}
            spinning={running}
            urgent={urgent}
            className={cn(
              "h-full max-h-full w-full transition-opacity duration-500",
              finished && "opacity-0"
            )}
          />
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          {/* The plate behind the digits appears only when the brand's accent
              cannot carry on the brand's own ground — see `needsPlinth`. On a
              dark field it does carry, and the number sits straight on the
              page, which is one less object in a composition that should have
              almost none. */}
          <div
            className={cn(
              "transition-shadow focus-within:ring-2 focus-within:ring-brand-on-ground/60",
              plinth &&
                "bg-brand-face px-[clamp(0.5rem,1.4vh,1rem)] py-[clamp(0.1rem,0.45vh,0.35rem)]",
              finished && "opacity-80"
            )}
          >
            <input
              value={fieldText}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => {
                const whole = formatClock(durationMs)
                const el = e.currentTarget
                setDraft(whole)
                // Select the lot: the first keystroke should replace the time,
                // not append a digit to it. Once synchronously, which is all
                // that is needed when the string is not about to change, and
                // again next frame for when it is (focusing a paused clock
                // swaps the remaining time for the full duration, and React
                // has to write that before there is anything to select).
                //
                // THE GUARD IS THE FIX. This was a bare
                // `requestAnimationFrame(() => e.target.select())`, and when
                // the frame landed after the first keystroke it selected the
                // character that had just been typed, so the next one ate it:
                // "7:30" went in and "30" came out. It needs the page to be
                // busy enough to push that frame past the keyboard, which is
                // why it surfaced as "the field is not editable any more"
                // rather than as a selection bug, and why it came and went
                // with the viewport.
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
              // Sized to its own content so the plinth hugs the digits at every
              // clamp step; `ch` is exact here because the face is tabular.
              style={{ width: `${fieldText.length + 0.4}ch` }}
              className="block bg-transparent text-center font-display text-[clamp(2rem,7.5vh,5.5rem)] leading-none font-semibold tracking-[-0.03em] text-brand-accent tabular-nums outline-none read-only:cursor-default"
            />
          </div>
          {/* The ticking number would flood a screen reader, so it is hidden
              above and only the state changes are announced here. */}
          <p aria-live="polite" className="sr-only">
            {finished
              ? "Time is up."
              : running
                ? `Running, ${formatClock(remainingMs)} left of ${formatClock(durationMs)}.`
                : `Paused at ${formatClock(remainingMs)} of ${formatClock(durationMs)}.`}
          </p>
          {finished && (
            <p className="label text-brand-on-ground">Time&rsquo;s up</p>
          )}
        </div>

        <TimerHints
          fullscreen={fullscreen}
          remote={{ pairing: remote.pairing, dropped: remote.dropped }}
        />
      </div>

      <TimerChrome
        awake={chrome.awake}
        pin={chrome.pin}
        running={running}
        finished={finished}
        muted={muted}
        fullscreen={fullscreen}
        durationSeconds={durationSeconds}
        onToggle={toggle}
        onReset={reset}
        onAddMinute={addMinute}
        onChoose={choose}
        onToggleMuted={() => setMuted((m) => !m)}
        onToggleFullscreen={toggleFullscreen}
        remote={{
          code: remote.code,
          online: remote.online,
          phoneHere: remote.phoneHere,
        }}
        onToggleRemote={toggleRemote}
        remoteHost={host}
      />
    </main>
  )
}

/** The brand's mark, or its name, or nothing.
 *
 *  A plain `<img>` rather than an optimising component on purpose: the source
 *  is whatever a brand file points at, which may be another origin, and an
 *  image pipeline that has to be told about every allowed host in advance is
 *  the opposite of white label. */
function BrandMark() {
  const { name, logo } = useBrand()

  if (!logo) {
    return name ? (
      <span className="label text-brand-on-ground/65">{name}</span>
    ) : null
  }

  const image = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logo.src}
      alt={logo.alt || name}
      className={cn("h-8 w-auto md:h-10", logo.invert && "brightness-0 invert")}
    />
  )

  return logo.href ? (
    <a
      href={logo.href}
      className="inline-flex focus-visible:ring-2 focus-visible:ring-brand-on-ground focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ground focus-visible:outline-none"
    >
      {image}
    </a>
  ) : (
    image
  )
}

export { TimerScreen }
