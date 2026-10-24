import { cn } from "@/lib/utils"

// The clock face itself, kept in its own file so anything else that wants to
// show the real dial — a link-preview card, a screenshot route, an embed — can
// render this rather than a drawing of one. Two copies of a clock drift the
// first time the wedge colour or the tick spacing changes.
//
// The face is the WHOLE countdown, whatever its length: the wedge starts full
// and empties as the time goes, so a one-minute pitch round and a one-hour
// exercise both start as a full dial and both read "half gone" at six o'clock.
// Until 2026-10-23 the face was always one hour, like a kitchen timer; that made
// a quarter turn mean fifteen minutes, but left a one-minute timer as a sliver
// too thin to read. `fraction` is remaining ÷ duration. Time added past the
// chosen length keeps the wedge full until the clock drops back under it,
// rather than redrawing the scale while the room is watching.
//
// The scale is drawn per length, in round units, so the marks always mean
// something you could say out loud ("every ten seconds"). A fixed sixty marks
// would make a seven-minute dial tick every seven seconds, and no number could
// sit on a mark. The marks are hairlines; the ones carrying a number are
// longer, the way a stopwatch tells its fives apart, and twelve is longest.
//
// Coordinates are ROUNDED, which is the load-bearing part. `Math.sin`/`Math.cos` are
// not bit-identical between Node and V8 in the browser, so an unrounded
// coordinate serialises as 35.91412011995155 on the server and ...56 on the
// client, and React throws away the whole tree with a hydration mismatch that
// names an attribute rather than the cause. Three decimals is far finer than a
// pixel at any size this renders at, and is the same string on both sides.
const round3 = (v: number) => Number(v.toFixed(3))

/** Where the marks end, just inside the face at r=94. */
const TICK_OUTER = 90

/** Round spacings for the marks, in seconds. The scale takes the smallest that
 *  leaves at most sixty marks AND lands a mark under every number, so a
 *  one-minute dial ticks every second and an hour ticks every minute, as the
 *  hour face always did. */
const TICK_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 180, 300, 900]
const MAX_TICKS = 60

/** How far apart the numbers sit, by length: seconds for a minute, half
 *  minutes up to two, every minute up to fourteen, every five up to the hour,
 *  every fifteen beyond it. Each band keeps the count to thirteen or fewer and
 *  every number in one short unit. Fourteen is the last length numbered by the
 *  minute because thirteen numbers still clear each other at this radius, and
 *  numbered in fives it would have no number at its halfway, 7′. */
function numeralStep(durationSeconds: number): number {
  if (durationSeconds <= 60) return 10
  if (durationSeconds <= 120) return 30
  if (durationSeconds <= 14 * 60) return 60
  if (durationSeconds <= 3600) return 300
  return 900
}

/** Written the way the chips write a length, in ONE unit per dial: seconds up
 *  to two minutes (30″ 60″ 90″), whole minutes beyond (4′, 15′). A mixed mark
 *  such as 1′30″ is the busiest thing on a face and reads slowest. */
function formatMark(seconds: number, totalSeconds: number): string {
  return totalSeconds <= 120 ? `${seconds}″` : `${seconds / 60}′`
}

/** The numbers sit at r=69, inside the wedge rather than outside the face, so
 *  the edge sweeps across them and you read the time where the colour stops.
 *  That costs nothing in legibility: ink on the accent and ink on the face
 *  both clear 5:1, which is the reason the numerals are ink in the first place
 *  rather than a second use of the accent. */
const NUMERAL_RADIUS = 69

/** The marks and numbers for a countdown of this length.
 *
 *  WHICH NUMBER GOES WHERE IS NOT A CHOICE. The wedge opens clockwise from 12
 *  by the fraction still to come, so with four minutes left of eight the edge
 *  sits at six o'clock — and "4′" has to be printed at six o'clock. The numbers
 *  therefore ascend CLOCKWISE, each at its share of the whole turn. A length
 *  that is not a whole number of steps simply ends on a shorter gap, the way a
 *  ruler stops at its length rather than at its next centimetre. */
export function dialScale(durationSeconds: number) {
  const total = Math.max(1, Math.round(durationSeconds))
  const labelStep = numeralStep(total)
  const tickStep =
    TICK_STEPS.find((step) => total / step <= MAX_TICKS && labelStep % step === 0) ??
    labelStep
  const angle = (seconds: number) => (seconds / total) * 2 * Math.PI

  const ticks = []
  for (let t = 0; t < total; t += tickStep) {
    const a = angle(t)
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    const top = t === 0
    const major = t % labelStep === 0
    const inner = top ? 78 : major ? 81 : 84.5
    ticks.push({
      seconds: t,
      x1: round3(100 + inner * sin),
      y1: round3(100 - inner * cos),
      x2: round3(100 + TICK_OUTER * sin),
      y2: round3(100 - TICK_OUTER * cos),
      major,
      top,
    })
  }

  const numerals = []
  for (let t = labelStep; t < total; t += labelStep) {
    const a = angle(t)
    numerals.push({
      seconds: t,
      label: formatMark(t, total),
      x: round3(100 + NUMERAL_RADIUS * Math.sin(a)),
      y: round3(100 - NUMERAL_RADIUS * Math.cos(a)),
    })
  }

  return { ticks, numerals }
}

/** The remaining slice of the countdown, as an SVG wedge starting at 12 o'clock and
 *  opening CLOCKWISE. Angles are clock angles (clockwise from 12), so a point
 *  sits at (cx + r·sin φ, cy − r·cos φ). An empty string at zero, which is how
 *  the wedge disappears when the time runs out.
 *
 *  The direction here is about the edge that MOVES, not the one that is drawn.
 *  Opening the wedge anticlockwise, as this did until 2026-10-22, puts the
 *  remaining slice on the left and sends its edge sweeping clockwise back up to
 *  12 as the time goes — which is a hand going round a clock, and reads as one.
 *  Opening it clockwise puts the slice on the right and the moving edge runs
 *  anticlockwise, which no clock does. The wedge is the same shape either way;
 *  only the direction of travel tells you what kind of instrument this is. */
export function wedgePath(
  fraction: number,
  cx: number,
  cy: number,
  r: number
): string {
  const theta = Math.min(1, Math.max(0, fraction)) * 2 * Math.PI
  if (theta <= 0) return ""
  // A full turn cannot be drawn as one arc — its start and end coincide, and
  // the path collapses to nothing. Two half-circles instead.
  if (theta >= 2 * Math.PI - 1e-6) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
  }
  const x = cx + r * Math.sin(theta)
  const y = cy - r * Math.cos(theta)
  const largeArc = theta > Math.PI ? 1 : 0
  // sweep-flag 1 = clockwise on screen.
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`
}

/** @param fraction remaining ÷ duration, clamped by the caller.
 *  @param durationSeconds the length the face is drawn for; the marks and
 *    numbers are laid out from it.
 *  @param urgent inside the last minute: the whole face shakes. */
function TimerDial({
  fraction,
  durationSeconds,
  urgent = false,
  className,
}: {
  fraction: number
  durationSeconds: number
  urgent?: boolean
  className?: string
}) {
  const { ticks, numerals } = dialScale(durationSeconds)
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className={cn(
        "drop-shadow-[0_20px_50px_rgb(0_0_0/0.35)]",
        urgent && "timer-dial-shake",
        className
      )}
    >
      {/* Three roles, one colour each: the GROUND is the field, the FACE is
          the dial, the ACCENT is time. Putting the wedge on the face is what
          lets the accent be a saturated colour at all — a saturated accent on a
          saturated ground is often under 2:1 and vibrates, where against a
          near-white face it separates cleanly. That relationship is the one
          thing a brand must not invert (see `lib/brand.ts`). */}
      <circle cx="100" cy="100" r="94" className="fill-brand-face" />
      {/* The marks sit in the ring outside the wedge, so a full dial never
          hides them. Hairlines for the minutes, enough weight on the fives to
          count by, and the most on twelve, which is where every reading on
          this face starts and ends. */}
      {ticks.map((t) => (
        <line
          key={t.seconds}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          className={
            t.top ? "stroke-brand-ink/70" : t.major ? "stroke-brand-ink/45" : "stroke-brand-ink/28"
          }
          // Hairlines throughout, and the fives are told apart by LENGTH
          // rather than by weight. Weight was the first thing tried and it
          // made them read as twelve lozenges with filler between, which is a
          // clock face again; length keeps all sixty looking like one scale.
          strokeWidth={t.top ? 2.2 : t.major ? 1.2 : 0.7}
          strokeLinecap="butt"
        />
      ))}
      {/* The wedge reaches almost to the marks. It used to stop at r=68, which
          left a band of empty white between the colour and the rim wide enough
          to read as a mistake once the marks moved outward and got thin. */}
      <path d={wedgePath(fraction, 100, 100, 80)} className="fill-brand-accent" />
      {/* Drawn AFTER the wedge, so the figures stay readable where the colour
          has reached them. */}
      {numerals.map((n) => (
        <text
          key={n.seconds}
          x={n.x}
          y={n.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
          fontWeight="600"
          className="fill-brand-ink font-sans"
        >
          {n.label}
        </text>
      ))}
      <circle cx="100" cy="100" r="6" className="fill-brand-ink" />
    </svg>
  )
}

export { TimerDial }
