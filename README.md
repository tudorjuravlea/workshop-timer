# Workshop Timer

A countdown for the front of a room — workshops, jams, demo rounds — with a
phone remote so the facilitator can stand with the room instead of beside the
laptop. White label: the colours, the faces and the marks come from a brand
file, and no component knows which brand it is wearing.

The fade-away chrome and the phone remote are modelled on
[html-deck-kit](https://github.com/adyrugina/html-deck-kit), which does the same
two things for a slide deck. The relay is where this one deliberately diverges —
see **The phone remote** below.

```bash
npm install
npm run dev          # http://localhost:3000
```

---

## The clock

- **The dial measures an hour, not a percentage.** It is a kitchen timer or
  Time Timer–style dial: the face is always ONE HOUR and the wedge is the
  slice of that hour still to come, so fifteen minutes reads as a quarter turn
  without anyone reading a number. A duration over an hour is therefore
  not a bug — the wedge sits full until the clock drops under sixty minutes,
  exactly as the physical object behaves.
- **It is deliberately not a clock.** Sixty marks rather than twelve, and the
  edge that moves runs anticlockwise. Both are on purpose; see the comments in
  `src/components/timer-dial.tsx` before changing either.
- **The controls fade.** They appear when you move and leave 2.6 seconds after
  you stop, taking the mouse pointer with them — a parked arrow on a projection
  is as loud as a button. Under `prefers-reduced-motion` they never hide.
- **The last minute** switches the readout to hundredths, lights the rim in the
  accent, shakes the face, ticks each second and strikes a gong at zero. All of
  it off under reduced motion; the gong and the ticks are synthesised, so the
  app ships no audio file.
- **Keys:** `Space` start/pause, `F` full screen, `R` phone remote.
- **The duration is in the URL fragment:** `/#25`, `/#7:30`, `/#1:05:00`. The
  field takes the same grammar, and a bare number means minutes.

## The phone remote

Press `R` on the screen. A receipt feeds out from under the controls with an
address and a five-character code; open that address on a phone and type the
code. From then on either device drives the clock and both follow.

The relay **carries state, not commands**: a reply says how much time is left,
and each side rebuilds its own deadline from that against its own clock. No
absolute timestamp ever crosses the wire, so a phone whose clock is a minute
out cannot retime the room. A missed poll costs nothing and both devices keep
counting correctly while the relay is unreachable.

Two consequences, accepted rather than overlooked: the relay is **server
memory**, so a deploy drops any live pairing (press `R` again — the countdown
on screen never stops), and it would not be shared if the service ever ran
**more than one instance**. If you need it to survive either, keep the view
shape in `src/lib/timer-room.ts` and change only where the Map lives.

---

## Branding

One schema, two ways to apply it.

### 1. A brand that ships with the deployment

Put a JSON file in `brands/` and name it:

```bash
TIMER_BRAND=acme          # reads brands/acme.json
TIMER_BRAND=https://acme.com/brand.json
```

Applied on the server, before the first byte — no query string, no flash.
`brands/example.json` is there to copy.

### 2. A brand in the URL

```
/?brand=https://acme.com/brand.json
/?accent=%23ff3b00&ground=%23101010&name=Acme
```

The file is fetched **by the browser**, so its host must send
`Access-Control-Allow-Origin` (every CDN and GitHub raw already does). Nothing
is proxied through this server, deliberately: a proxy here would fetch
arbitrary addresses from inside whatever network the deployment sits in.

The loose parameters are `ground`, `groundFrom`, `groundTo`, `glow`, `accent`,
`face`, `ink`, `panel`, `receipt`, plus `name` and `logo`. They are applied
before the first paint, so a branded link does not flash. `ground` on its own
sets all three gradient stops and the glow, which gives a flat field.

Both at once is allowed and the parameters win. `TIMER_BRAND_FROM_URL=off`
refuses the lot, for a deployment that must only ever appear one way.

### The brand file

Every field is optional and falls back to the built-in brand, so a file that
sets three colours inherits a working instrument for the rest.

```jsonc
{
  "name": "Acme",
  "colors": {
    "groundFrom": "#26262a",   // the 135° gradient behind everything
    "ground":     "#141416",
    "groundTo":   "#08080a",
    "glow":       "#3a2b26",   // the orbs; set it to the ground to kill them
    "face":       "#fbfbf9",   // the dial, and the plinth under the readout
    "accent":     "#ff3b00",   // TIME: the wedge and the digits. One accent.
    "ink":        "#15181d",   // text and tick marks on `face`
    "ink2":       "#454c57",
    "panel":      "#0d0d0f",   // the floating control plate
    "onPanel":    "#ffffff",
    "onGround":   "#ffffff",   // the few words set on the ground
    "receipt":    "#eef0f6",   // the pairing receipt's paper
    "receiptEdge":"#c7ccdb"    // its bottom edge: a darker tone of the paper
  },
  "logo": { "src": "/logo.svg", "alt": "Acme", "href": "https://acme.com", "invert": false },
  "watermark": { "src": "/mark.svg", "opacity": 0.08 },
  "fonts": {
    "body": "'Overused Grotesk', Helvetica, Arial, sans-serif",
    "display": "'Overused Grotesk', Helvetica, Arial, sans-serif",
    "mono": "'Overused Grotesk', Helvetica, Arial, sans-serif",
    "stylesheet": "https://cdn.jsdelivr.net/npm/@sarap422/font-overused-grotesk@1.1.5/font-face.css"
  }
}
```

`logo: null` and `watermark: null` switch those off; with no logo the brand's
`name` is set quietly in the corner instead, so a white-label deployment still
says whose room it is without shipping an asset.

**Three constraints worth knowing before you choose colours.**

1. **`face` must be clearly brighter than `ground`.** The dial is read from the
   back of a room, and the rim light is light escaping from behind the face. A
   pale ground under a white face gives you neither.
2. **`accent` carries the only information on the page.** It is the wedge and
   the digits and nothing else. Put a second colour in the field and the two
   argue; the default ground is near-black for exactly that reason.
   You do not have to protect the readout yourself: the timer measures
   `accent` against `ground` and, below 3:1, puts a bright plate behind the
   digits. On a dark field the number sits straight on the page; on a
   saturated one the plate appears. The version this was extracted from ran
   orange on a saturated blue at 1.95:1, which is where that rule comes from.
3. **Colours are hex, and only hex.** Anything else is dropped with a warning.
   These values are interpolated into a `<style>` element and may arrive from a
   query string, so a value that could contain a semicolon could write
   arbitrary CSS into the page. Hex removes the question. Font stacks are
   restricted to plain family names for the same reason, and every URL must be
   http(s) or a local path.

A brand file is third-party data. The worst a hostile one can do is choose
ugly colours.

### Fonts

The default brand pulls Overused Grotesk from jsDelivr. For a deployment that
must work with no outbound network, put the files in `public/`, write your own
`@font-face` stylesheet beside them and point `fonts.stylesheet` at that path.
Every stack ends in a system fallback, so a stylesheet that fails to load
degrades rather than breaks.

The countdown relies on **tabular figures** (`font-variant-numeric`) so the
digits do not jitter as they change. Check that any face you choose has them.

---

## Layout

```
src/app/            /  the clock · /remote  the phone · /api/timer/room/*  the relay
src/components/     the screen, the phone, the dial, the fading chrome, the brand provider
src/lib/            brand schema + resolver, clock arithmetic, the relay, the synthesised audio
brands/             brand files, named by TIMER_BRAND
```

`npm run lint` is the only formatting authority here; there is no Prettier
config and the code has no semicolons.

## Deploying

Any host that runs Node — the relay needs a server, and there must be exactly
one instance of it (see above). Set `TIMER_BRAND` and nothing else.

Framing is allowed from any site (`frame-ancestors *` in `next.config.ts`), so
the clock can go in Notion, Miro or a Google Site. `Permissions-Policy`
deliberately leaves `fullscreen` and `screen-wake-lock` alone, because the
timer needs both.

---

## Credits

The fade-away chrome — controls that appear on movement and take the mouse
pointer with them when they go — and the idea of driving a projected screen
from a phone both come from
**[html-deck-kit](https://github.com/adyrugina/html-deck-kit)**, which does
them for slide decks.

The relay is the deliberate departure. A deck has no clock, so it relays taps
and discards stale ones; a countdown has one, so this relays **state** and
nothing it sends can go stale.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, rebrand it, sell it; just keep
the notice.

`package.json` carries `"private": true`, which only stops an accidental
`npm publish`. It has nothing to do with the licence: this is an application,
not a package.
