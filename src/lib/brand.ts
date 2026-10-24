// What makes this timer somebody else's timer.
//
// Everything a brand can change is a CSS custom property, and every component
// reads those properties through Tailwind theme tokens (`bg-brand-face`,
// `fill-brand-accent`, and so on — see `app/timer.css`). That is the whole
// mechanism: nothing in `components/` knows which brand it is wearing, so a
// new brand is a JSON file and never a patch.
//
// This module is deliberately pure and isomorphic. The server resolves a brand
// at startup (`brand-server.ts`), the browser may resolve a second one from the
// URL (`components/brand-provider.tsx`), and both of them need the same
// validation — a brand that is legal on one side and rejected on the other
// would show up as a colour that works locally and not in the room.

/** The parts that end up in CSS. Named for their ROLE in the instrument, not
 *  for their hue, which is what lets a brand be dark-on-light or light-on-dark
 *  without renaming anything. */
export type BrandColors = {
  /** The field behind everything: a 135° gradient through these three. */
  groundFrom: string
  ground: string
  groundTo: string
  /** The soft orbs over the ground. Decoration; set it to the ground to
   *  switch them off. */
  glow: string
  /** The dial's face, and the plinth under the readout. The brightest surface
   *  on the page, which is what makes the clock the thing you see first. */
  face: string
  /** TIME. The wedge and the digits.
   *  One accent, used nowhere else. */
  accent: string
  /** Text and tick marks on `face`. */
  ink: string
  /** Quieter text on `face` and on `receipt`. */
  ink2: string
  /** The floating control panel. Darker than the ground, so it reads as an
   *  object held over the white face rather than a tint smeared across it. */
  panel: string
  /** Labels on `panel`. */
  onPanel: string
  /** The few words set directly on the ground: the key hints, "Time's up". */
  onGround: string
  /** The pairing receipt's paper. */
  receipt: string
  /** The receipt's bottom edge — a darker tone of the paper, never black,
   *  because a pale sheet fed out over a white dial has nothing else holding
   *  its lower edge. */
  receiptEdge: string
}

export type BrandLogo = {
  src: string
  alt: string
  /** Where the mark links, or null for a mark that is not a link. */
  href: string | null
  /** True for a dark mark that should be flipped to white over the ground. */
  invert: boolean
}

export type BrandWatermark = {
  src: string
  /** 0–1. Keep it a whisper: this sits behind a clock people read from the
   *  back of a room. */
  opacity: number
}

export type BrandFonts = {
  /** Everything that is read as text: buttons, hints, the receipt. */
  body: string
  /** The readout and the headings. Needs real tabular figures. */
  display: string
  /** The pairing code and the small caps labels. */
  mono: string
  /** One stylesheet to load them from, or null to use what is installed. */
  stylesheet: string | null
}

export type Brand = {
  /** Shown top-left when there is no logo, and used as the page title. */
  name: string
  colors: BrandColors
  logo: BrandLogo | null
  watermark: BrandWatermark | null
  fonts: BrandFonts
  /** The corner of a control, in px. The panel that holds the controls takes
   *  this plus the 8px it insets them by, so its corner runs CONCENTRIC with
   *  theirs instead of merely enclosing them: a tighter radius outside turns
   *  the corner sharper than the button inside it and leaves a wedge of fill
   *  at each one. Derived rather than a second setting, so no brand can get
   *  the pair out of step. 0 gives square corners throughout. */
  radius: number
}

/** The built-in brand: deliberately not anybody's.
 *
 *  A black ground, one bright accent, a near-white face. That is not a style
 *  preference, it is the room: these screens live on a projector or a large TV
 *  with the lights down and are read from the back, so the face has to be the
 *  brightest thing in the frame and the accent has to be the only other thing
 *  competing for attention. Black rather than a tinted dark, because any hue
 *  in the field is a hue arguing with the accent, and the accent is the one
 *  carrying the information. The orbs are the single exception: a warm
 *  charcoal, barely there, so the field has some depth without naming a
 *  second colour. */
export const DEFAULT_BRAND: Brand = {
  name: "Workshop Timer",
  colors: {
    groundFrom: "#26262a",
    ground: "#141416",
    groundTo: "#08080a",
    glow: "#3a2b26",
    face: "#fbfbf9",
    accent: "#ff3b00",
    ink: "#15181d",
    ink2: "#454c57",
    panel: "#0d0d0f",
    onPanel: "#ffffff",
    onGround: "#ffffff",
    receipt: "#eef0f6",
    receiptEdge: "#c7ccdb",
  },
  logo: null,
  watermark: null,
  fonts: {
    body: "'Overused Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    display: "'Overused Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    // The same face for the pairing code, rather than a monospace.
    //
    // A fixed width is usually what you reach for when five characters have to
    // be copied one at a time off a screen across a room, and the reason is
    // always the confusable pairs — O against 0, I against 1. Those cannot
    // occur here: the code ALPHABET in `lib/timer-room.ts` has no O, 0, I, 1,
    // S, 5, B, 8, Z or 2 in it. The ambiguity was designed out at the source,
    // so the second typeface it would have justified is not needed, and one
    // face for the whole instrument is the stronger result. `mono` stays in
    // the schema for a brand that wants one anyway.
    mono: "'Overused Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    stylesheet:
      "https://cdn.jsdelivr.net/npm/@sarap422/font-overused-grotesk@1.1.5/font-face.css",
  },
  radius: 12,
}

/** How far the panel insets its controls (`p-2`), which is what makes its
 *  corner concentric at `radius + PANEL_INSET`. */
const PANEL_INSET = 8

/** Which CSS property each colour becomes. Spelled out rather than derived
 *  from the key by casing rules, so renaming a colour cannot silently rename a
 *  property that stylesheets and the pre-paint script both refer to by name. */
const COLOR_VARS: Record<keyof BrandColors, string> = {
  groundFrom: "--brand-ground-from",
  ground: "--brand-ground",
  groundTo: "--brand-ground-to",
  glow: "--brand-glow",
  face: "--brand-face",
  accent: "--brand-accent",
  ink: "--brand-ink",
  ink2: "--brand-ink-2",
  panel: "--brand-panel",
  onPanel: "--brand-on-panel",
  onGround: "--brand-on-ground",
  receipt: "--brand-receipt",
  receiptEdge: "--brand-receipt-edge",
}

export const COLOR_KEYS = Object.keys(COLOR_VARS) as Array<keyof BrandColors>

/** HEX ONLY, and that is a security boundary rather than a style rule.
 *
 *  A colour taken from a query string or a third-party file is interpolated
 *  into a `<style>` element, where a value containing a semicolon or a brace
 *  would end the declaration and let the caller write arbitrary CSS into the
 *  page. Accepting nothing but hex makes that impossible by construction and
 *  costs a brand nothing — every palette in the world is expressible here. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isBrandColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim())
}

/** A font-family stack. Letters, digits, spaces, quotes, commas and hyphens,
 *  which is every legal family name and nothing that can leave the
 *  declaration. */
const FONT_STACK = /^[A-Za-z0-9 ,'"_-]{1,200}$/

/** An http(s) address or a same-origin path. Enough to reject `javascript:`
 *  and `data:` before either reaches an `href` or a `src`. */
function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false
  const v = value.trim()
  if (v.startsWith("/") && !v.startsWith("//")) return true
  try {
    const protocol = new URL(v).protocol
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim().slice(0, max)
  return trimmed || fallback
}

/** Read a brand out of whatever was parsed from a file, a URL or an
 *  environment variable, falling back field by field.
 *
 *  Field by field, not object by object: a brand that sets three colours and
 *  forgets the rest is the normal case, and it should inherit a working
 *  instrument rather than render a half-painted one. Anything invalid is
 *  reported through `onProblem` and then ignored — a bad colour in a brand file
 *  must never be able to take the clock off the screen in front of a room. */
export function parseBrand(
  input: unknown,
  base: Brand = DEFAULT_BRAND,
  onProblem: (message: string) => void = () => {}
): Brand {
  const raw = asRecord(input)
  const rawColors = asRecord(raw.colors)

  const colors = { ...base.colors }
  for (const key of COLOR_KEYS) {
    const value = rawColors[key]
    if (value === undefined) continue
    if (isBrandColor(value)) colors[key] = value.trim()
    else onProblem(`colors.${key} is not a hex colour, ignoring: ${String(value)}`)
  }

  let logo = base.logo
  if ("logo" in raw) {
    if (raw.logo === null) {
      logo = null
    } else {
      const l = asRecord(raw.logo)
      if (isSafeUrl(l.src)) {
        logo = {
          src: String(l.src).trim(),
          alt: text(l.alt, base.logo?.alt ?? ""),
          href: isSafeUrl(l.href) ? String(l.href).trim() : null,
          invert: l.invert === true,
        }
      } else {
        onProblem("logo.src is not an http(s) URL or a local path, ignoring the logo")
      }
    }
  }

  let watermark = base.watermark
  if ("watermark" in raw) {
    if (raw.watermark === null) {
      watermark = null
    } else {
      const w = asRecord(raw.watermark)
      if (isSafeUrl(w.src)) {
        const opacity = typeof w.opacity === "number" ? w.opacity : 0.08
        watermark = {
          src: String(w.src).trim(),
          opacity: Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 0.08)),
        }
      } else {
        onProblem("watermark.src is not an http(s) URL or a local path, ignoring it")
      }
    }
  }

  const rawFonts = asRecord(raw.fonts)
  const fonts: BrandFonts = { ...base.fonts }
  for (const key of ["body", "display", "mono"] as const) {
    const value = rawFonts[key]
    if (value === undefined) continue
    if (typeof value === "string" && FONT_STACK.test(value.trim())) fonts[key] = value.trim()
    else onProblem(`fonts.${key} is not a plain font-family stack, ignoring it`)
  }
  if ("stylesheet" in rawFonts) {
    if (rawFonts.stylesheet === null) fonts.stylesheet = null
    else if (isSafeUrl(rawFonts.stylesheet)) fonts.stylesheet = String(rawFonts.stylesheet).trim()
    else onProblem("fonts.stylesheet is not an http(s) URL, keeping the current one")
  }

  let radius = base.radius
  if ("radius" in raw) {
    const r = raw.radius
    if (typeof r === "number" && Number.isFinite(r) && r >= 0 && r <= 32) radius = r
    else onProblem("radius is not a number of px from 0 to 32, ignoring it")
  }

  return { name: text(raw.name, base.name), colors, logo, watermark, fonts, radius }
}

/** The text colour for the few words set directly on the ground, CHECKED
 *  against the ground rather than taken on trust.
 *
 *  A brand that moves its ground and forgets this one is the obvious mistake,
 *  and it is silent: `onGround` defaults to white, so a light ground leaves
 *  the wordmark and the key legend as white-on-cream — present in the DOM,
 *  invisible on the wall. Found exactly that way, by rendering a light brand
 *  and looking at it.
 *
 *  So below 4.5:1 the declared colour is dropped for whichever of it and `ink`
 *  actually reads. A brand that sets a working colour is never second-guessed;
 *  one that sets an impossible colour gets a legible page instead of a
 *  correct-looking stylesheet. */
function readableOnGround(colors: BrandColors): string {
  const declared = contrastRatio(colors.onGround, colors.ground)
  if (declared >= 4.5) return colors.onGround
  return contrastRatio(colors.ink, colors.ground) > declared ? colors.ink : colors.onGround
}

/** The custom properties a brand sets, ready to put on an element or in a
 *  rule. */
export function brandVars(brand: Brand): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const key of COLOR_KEYS) vars[COLOR_VARS[key]] = brand.colors[key]
  vars[COLOR_VARS.onGround] = readableOnGround(brand.colors)
  vars["--brand-font-body"] = brand.fonts.body
  vars["--brand-font-display"] = brand.fonts.display
  vars["--brand-font-mono"] = brand.fonts.mono
  vars["--brand-radius-control"] = `${brand.radius}px`
  vars["--brand-radius-panel"] = `${brand.radius + PANEL_INSET}px`
  return vars
}

/** The same thing as a stylesheet, for the server render. Every value has been
 *  through `parseBrand`, so nothing here can carry a semicolon. */
export function brandCss(brand: Brand): string {
  const body = Object.entries(brandVars(brand))
    .map(([name, value]) => `${name}:${value}`)
    .join(";")
  return `:root{${body}}`
}

/** Expand a validated hex colour to 0-255 channels. Alpha is dropped: these
 *  values are only ever used for a contrast judgement, and a translucent
 *  colour's real contrast depends on what is behind it. */
function channels(hex: string): [number, number, number] {
  const h = hex.trim().slice(1)
  const full =
    h.length <= 4
      ? h
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Whether the countdown needs a bright plate behind it.
 *
 *  The readout is the accent at display size, and display size is large text,
 *  so it needs 3:1 against whatever is behind it. On a near-black field a
 *  saturated accent clears that comfortably and the plate is just furniture —
 *  the number belongs on the ground. On a saturated field it does not: the
 *  original of this timer ran orange on brand blue at **1.95:1**, which
 *  vibrates and is unreadable from the back of a room, and the plate is what
 *  fixed it.
 *
 *  So the plate is DERIVED, not configured. A brand states its colours and the
 *  instrument works out whether it can do without, which means neither a
 *  white-label deployment nor a loud one has to know the rule exists. */
export function needsPlinth(brand: Brand): boolean {
  return contrastRatio(brand.colors.accent, brand.colors.ground) < 3
}

/** Which query parameter writes which colours.
 *
 *  One table, because two different things read it: the pre-paint script in the
 *  document head, which has to set the custom properties before the first frame
 *  is drawn, and `brandFromParams` below, which produces the brand object the
 *  components render from. Written twice they would eventually disagree, and
 *  the symptom would be one frame in the wrong colour on a projector.
 *
 *  `ground` writes all three gradient stops at once, so the common case — "our
 *  colour is this" — is one parameter and gives a flat field; `groundFrom` and
 *  `groundTo` are there for anyone who wants the gradient back. */
export const INLINE_COLOR_PARAMS: Record<string, Array<keyof BrandColors>> = {
  // `ground` takes the GLOW with it. The orbs are a lift of the ground's own
  // hue, so leaving them behind when the field is replaced puts a blurred
  // patch of the previous brand in the corner of the new one — which is
  // exactly what a one-parameter brand must not do. Setting them to the
  // ground makes them invisible, so `?ground=` alone gives a flat field, and
  // `glow` brings them back for anyone who wants them.
  ground: ["ground", "groundFrom", "groundTo", "glow"],
  groundFrom: ["groundFrom"],
  groundTo: ["groundTo"],
  glow: ["glow"],
  accent: ["accent"],
  face: ["face"],
  ink: ["ink"],
  onGround: ["onGround"],
  panel: ["panel"],
  receipt: ["receipt"],
}

/** The same table as custom-property names, for the pre-paint script. */
export function inlineParamVars(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [param, keys] of Object.entries(INLINE_COLOR_PARAMS)) {
    out[param] = keys.map((key) => COLOR_VARS[key])
  }
  return out
}

/** The short form: a handful of colours straight in the query string, for a
 *  one-off that is not worth hosting a file for.
 *
 *  Returns null when the query string mentions no brand at all, which is how
 *  the caller tells "no override" from "an override that failed validation". */
export function brandFromParams(
  params: URLSearchParams,
  base: Brand = DEFAULT_BRAND,
  onProblem: (message: string) => void = () => {}
): Brand | null {
  const colors: Partial<Record<keyof BrandColors, unknown>> = {}
  let touched = false

  for (const [param, keys] of Object.entries(INLINE_COLOR_PARAMS)) {
    const value = params.get(param)
    if (value === null) continue
    for (const key of keys) colors[key] = value
    touched = true
  }

  const name = params.get("name")
  const logo = params.get("logo")
  if (name !== null || logo !== null) touched = true
  if (!touched) return null

  return parseBrand(
    {
      ...(name !== null ? { name } : {}),
      ...(logo !== null ? { logo: logo === "" ? null : { src: logo, alt: name ?? "" } } : {}),
      colors,
    },
    base,
    onProblem
  )
}
