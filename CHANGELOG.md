# Changelog

Every release is tagged (`v1.1.0`), so the difference between two of them is
one `git diff v1.0.0..v1.1.0`. Each entry has two parts:

- **In the room**: what people looking at the screen will notice.
- **For hosts**: what someone who copies this code into another app needs to
  redo. See [`docs/DOWNSTREAM.md`](docs/DOWNSTREAM.md) for why each line is
  there.

## Unreleased

**For hosts**

- Files: added `brands/light-ground.json`, `brands/saturated-ground.json`,
  `brands/accent-only.json`, `scripts/check-brands.mjs`,
  `.github/workflows/check.yml`. Nothing for a host to copy; the fixtures and
  the check stay upstream.
- `npm run check:brands` (Node 24) checks every brand file: text on the ground
  at 4.5:1, the digits at 3:1 on whatever is behind them, the plate exactly
  where the fixture expects it, named fonts kept, and one version in
  `package.json`, `version.ts` and this file. It runs on every pull request.
- Docs: the comment in `brands/example.json` no longer mentions the backlight
  ring, which v1.0.0 removed.

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
