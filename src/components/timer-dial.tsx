import type * as React from "react"

import { cn } from "@/lib/utils"

// The clock face itself, kept in its own file so anything else that wants to
// show the real dial — a link-preview card, a screenshot route, an embed — can
// render this rather than a drawing of one. Two copies of a clock drift the
// first time the wedge colour or the tick spacing changes.
//
// It is a kitchen timer or Time Timer–style dial: the face is always ONE HOUR
// and the wedge is the slice of that hour still to come, so a quarter turn
// reads as fifteen minutes without anyone reading a number. `fraction` is therefore remaining ÷ 3600s,
// not remaining ÷ duration. A duration over an hour is consequently not a bug:
// the wedge sits full until the clock drops under sixty minutes, exactly as the
// physical object behaves.

export const DIAL_SECONDS = 60 * 60

// Sixty marks, one per minute of the hour the face represents, with every
// fifth one longer and heavier — the arrangement a stopwatch uses, and the
// reason it reads as an instrument rather than as a clock: a clock face has
// twelve things on it, a stopwatch has sixty.
//
// They are ROUNDED, which is the load-bearing part. `Math.sin`/`Math.cos` are
// not bit-identical between Node and V8 in the browser, so an unrounded
// coordinate serialises as 35.91412011995155 on the server and ...56 on the
// client, and React throws away the whole tree with a hydration mismatch that
// names an attribute rather than the cause. Three decimals is far finer than a
// pixel at any size this renders at, and is the same string on both sides.
const round3 = (v: number) => Number(v.toFixed(3))

/** Where the marks end, just inside the face at r=94. */
const TICK_OUTER = 90

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i * Math.PI) / 30
  const sin = Math.sin(a)
  const cos = Math.cos(a)
  const top = i === 0
  const major = i % 5 === 0
  const inner = top ? 78 : major ? 81 : 84.5
  return {
    x1: round3(100 + inner * sin),
    y1: round3(100 - inner * cos),
    x2: round3(100 + TICK_OUTER * sin),
    y2: round3(100 - TICK_OUTER * cos),
    major,
    top,
  }
})

/** The minute scale: 5 to 55, every fifth mark.
 *
 *  WHICH NUMBER GOES WHERE IS NOT A CHOICE. The wedge opens clockwise from 12
 *  by the fraction of the hour still to come, so the edge that moves sits at
 *  six degrees per remaining minute, measured clockwise. Twenty minutes left
 *  puts the edge a third of the way round, at four o'clock — so "20" has to be
 *  printed at four o'clock, and the numbers therefore ascend CLOCKWISE. Laying
 *  them out the other way would give a face where the figure under the edge is
 *  never the figure on the clock.
 *
 *  They sit at r=69, inside the wedge rather than outside the face, so the
 *  edge sweeps across them and you read the time where the colour stops. That
 *  costs nothing in legibility: ink on the accent and ink on the face both
 *  clear 5:1, which is the reason the numerals are ink in the first place
 *  rather than a second use of the accent.
 *
 *  Rounded at module scope, for the same hydration reason as the ticks. */
const NUMERAL_RADIUS = 69

const NUMERALS = Array.from({ length: 11 }, (_, i) => {
  const minute = (i + 1) * 5
  const a = (minute * Math.PI) / 30
  return {
    minute,
    x: round3(100 + NUMERAL_RADIUS * Math.sin(a)),
    y: round3(100 - NUMERAL_RADIUS * Math.cos(a)),
  }
})

/** The remaining slice of the hour, as an SVG wedge starting at 12 o'clock and
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

/** @param fraction remaining seconds ÷ 3600, clamped by the caller.
 *  @param lit draw the backlight at all. Off leaves the resting dial and the
 *    link-preview card exactly as they were.
 *  @param spinning turn it. A lit but still backlight is a paused clock.
 *  @param urgent inside the last minute: faster, breathing, and the whole face
 *    shakes. */
function TimerDial({
  fraction,
  lit = false,
  spinning = false,
  urgent = false,
  className,
}: {
  fraction: number
  lit?: boolean
  spinning?: boolean
  urgent?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className={cn(
        // The backlight is drawn wider than the face and has to escape the
        // viewBox to read as light behind an object rather than a ring painted
        // on one. The page's own `overflow-hidden` is the backstop.
        "overflow-visible drop-shadow-[0_20px_50px_rgb(0_0_0/0.35)]",
        urgent && "dial-shake",
        className
      )}
    >
      <defs>
        {/* Two blurs, because the ring and the brightening are doing different
            jobs. The ring wants a tight one, or a 2px stroke spread over 16
            units stops being a ring at all and becomes a wash. The brighter
            side wants a wide one, so it has no edge to give it away as a
            second shape drawn on top. Both need a filter region far larger
            than one bbox; the default would clip the bloom into a square. */}
        <filter id="dial-ring" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id="dial-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* THE BACKLIGHT, and it is drawn first because that is the whole trick:
          it sits BEHIND the white face, at a radius a little larger, so the
          opaque face swallows the inner half of the bloom and only the part
          that escapes past the rim is ever seen. Painted on top at the same
          radius it reads as a ring someone drew on the dial; painted behind it
          reads as a lamp.

          A thin even ring holds the whole contour, and half of it is carried
          a little brighter, so the dial reads as lit from one side and that
          side goes round. Anything shorter than half reads as an object
          travelling rather than as light.

          The brand's BRIGHT tone for most of the run and its ACCENT in the
          last minute, and holding the accent back is the point: the moment it
          appears is itself the warning, before the pulse or the shake have
          said anything. */}
      {lit && (
        // Two groups, not two classes on one. `animation` is a shorthand, so
        // the pulse and the spin on the same element are one property and the
        // last rule wins: the last minute quietly STOPPED the rotation and
        // only breathed. And the play-state is set inline rather than with a
        // utility, because `.dial-spin` is unlayered CSS and beats anything
        // Tailwind emits into a layer — pausing the clock left the light
        // turning.
        <g className={cn(urgent && "dial-urgent")}>
          <g
            className="dial-spin"
            style={
              {
                "--dial-spin-duration": urgent ? "0.4s" : "1s",
                animationPlayState: spinning ? "running" : "paused",
              } as React.CSSProperties
            }
          >
            {/* The ring: the whole contour, thin and even. */}
            <circle
              cx="100"
              cy="100"
              r="96"
              fill="none"
              strokeWidth="1.5"
              opacity={urgent ? 0.55 : 0.45}
              className={urgent ? "stroke-brand-accent" : "stroke-brand-on-ground"}
              filter="url(#dial-ring)"
            />
            {/* And one side of it, a little brighter. Half the circumference,
                not a lobe: a short arc reads as an object travelling round the
                ring, where half of it reads as the ring being lit from one
                side. The gap between this opacity and the ring's is what
                "slightly" means here — far enough apart to see, close enough
                that it never separates into a second thing. */}
            <circle
              cx="100"
              cy="100"
              r="96"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="302 302"
              opacity={urgent ? 0.45 : 0.35}
              className={urgent ? "stroke-brand-accent" : "stroke-brand-on-ground"}
              filter="url(#dial-glow)"
            />
          </g>
        </g>
      )}
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
      {TICKS.map((t, i) => (
        <line
          key={i}
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
      {NUMERALS.map((n) => (
        <text
          key={n.minute}
          x={n.x}
          y={n.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
          fontWeight="600"
          className="fill-brand-ink font-sans"
        >
          {n.minute}
        </text>
      ))}
      <circle cx="100" cy="100" r="6" className="fill-brand-ink" />
    </svg>
  )
}

export { TimerDial }
