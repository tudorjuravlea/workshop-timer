# Changelog

Every release is tagged (`v1.1.0`), so the difference between two of them is
one `git diff v1.0.0..v1.1.0`. Each entry has two parts:

- **In the room**: what people looking at the screen will notice.
- **For hosts**: what someone who copies this code into another app needs to
  redo. See [`docs/DOWNSTREAM.md`](docs/DOWNSTREAM.md) for why each line is
  there.

## v2.2.0 (2026-10-24)

**In the room**

- Nothing changes on screen.

**For hosts**

- New export: `checkBrand(input, base?)` in `src/lib/brand.ts` returns the
  problems a brand has, as a list of strings; empty means it keeps every
  promise. Run it on your own brand in your own tests. `npm run check:brands`
  is now a thin script over it, so there is one set of rules.
- Files, props, CSS, dependencies: no change. Nothing moved or renamed.

## v2.1.0 (2026-10-24)

**Hosts: import the new `src/app/timer.css`** after Tailwind. It holds every
style the components need, so your own `globals.css` stays yours.

**In the room**

- Nothing changes on screen. Every element on both pages has the same computed
  font, corners, colours, transitions and animations as in v2.0.0.

**For hosts**

- Files: added `src/app/timer.css`. `src/app/globals.css` now imports it and
  keeps only this app's own `html` and `body` rules, none of them required.
- The timer no longer reads Tailwind theme keys a host also owns:
  - corners: `rounded-[var(--brand-radius-control,12px)]` and
    `--brand-radius-panel` (20px) instead of `rounded-lg` and `rounded-2xl`;
  - faces: new utilities `timer-font-body`, `timer-font-display`,
    `timer-font-mono` instead of `font-sans`, `font-display`, `font-mono`,
    and both root elements carry `timer-font-body`;
  - motion: every transition states its duration and easing.
- Removed from the theme: `--font-sans`, `--font-display`, `--font-mono`,
  `--radius-lg`, `--radius-2xl`, `--radius-3xl`, `--ease-out-pm`,
  `--default-transition-*`, `--tracking-caps`.
- Brands gain `radius` (px, 0 to 32, default 12). The panel's corner is derived
  from it, plus the 8px it insets its controls by, so the two stay concentric.
  New custom properties: `--brand-radius-control`, `--brand-radius-panel`.
- Checked by building the app with a host theme that redefines all of those
  keys: no element on either page changed. The same theme changed 172 of 175
  elements in v2.0.0.
- Dependencies, props, paths: no change.

## v2.0.0 (2026-10-24)

**Renamed: the three global CSS names now start with `timer-`.** A host that
copied the CSS has to rename them too; nothing else in this release.

**In the room**

- Nothing changes on screen.

**For hosts**

- CSS renamed, in `src/app/globals.css` and every component that uses them:
  - utility `label` is now `timer-label`;
  - class and keyframes `receipt-feed` are now `timer-receipt-feed`;
  - class and keyframes `dial-shake` are now `timer-dial-shake`.
- Why: unprefixed, they sat in a host's global stylesheet, and `label` is a
  name most design systems already use.
- Files, props, dependencies: no change.

## v1.2.0 (2026-10-24)

**In the room**

- Nothing changes on screen.

**For hosts**

- The timer no longer assumes it owns the page or the URL, so most hand edits
  after copying are gone.
- Props, all optional, all defaulting to today's behaviour:
  - `TimerScreen`: `remotePath`, `relayPath`, `id`, `className`, `logo`,
    `watermark`.
  - `TimerRemote`: `relayPath`, `id` (default `"main"`), `className`,
    `watermark`.
  - `TimerChrome`: new required `remotePath`, which `TimerScreen` supplies.
  - `logo` and `watermark` replace the brand's own when given; `null` means
    none.
- The pairing receipt no longer prints a fixed `/remote`. It prints this page's
  own path plus `/remote` (`/tools/timer` gives `/tools/timer/remote`), or
  `remotePath` when given.
- `src/lib/timer-relay-client.ts`: `openRoom`, `readRoom` and `writeRoom` take
  an optional last argument, the relay path; `DEFAULT_RELAY_PATH` is exported.
- Files: added `brands/light-ground.json`, `brands/saturated-ground.json`,
  `brands/accent-only.json`, `scripts/check-brands.mjs`,
  `.github/workflows/check.yml`. None of them is for a host to copy.
- `npm run check:brands` (Node 24) checks every brand file: text on the ground
  at 4.5:1, the digits at 3:1 on whatever is behind them, the plate exactly
  where the fixture expects it, named fonts kept, and one version in
  `package.json`, `version.ts` and this file. It runs on every pull request.
  (#10)
- Docs: the comment in `brands/example.json` no longer mentions the backlight
  ring, which v1.0.0 removed. (#10)
- Dependencies: none. Nothing moved or renamed.

## v1.1.0 (2026-10-24)

**In the room**

- The control panel, its buttons and the plate behind the digits have rounded
  corners. (#7)
- Pairing a phone no longer moves the control bar on any screen with room for
  the receipt below it; narrow and short screens keep the old behaviour so the
  address is never cut off. (#8)

**For hosts**

- Files: added `CHANGELOG.md`, `docs/DOWNSTREAM.md`, `src/lib/version.ts`.
  Nothing moved or renamed.
- Props: none changed.
- CSS: `--radius-lg`, `--radius-2xl` and `--radius-3xl` in the `@theme` block
  (#7). These are Tailwind theme keys a host may also define; a later release
  replaces them with `--brand-*` properties.
- Dependencies: none.
- Load-bearing: the underscores in the
  `[@media(min-width:480px)_and_(min-height:480px)]` classes in
  `timer-chrome.tsx` (#8); `TIMER_VERSION` in `src/lib/version.ts` must match
  `package.json`.
- Root elements now carry `data-timer-version`, so a running copy can say which
  release it is.

## v1.0.0 (2026-10-23)

The first release: a countdown for the front of a room, with a phone remote and
a brand you can swap with a JSON file. Every length fills the dial, the last
minute shows hundredths and shakes the face, and zero brings a gong, *Time's
up!* and confetti.
