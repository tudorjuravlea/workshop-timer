# Copying this timer into another app

Some apps carry this timer as a copy of its source rather than as a separate
deployment: they already run Next.js, they want the clock on their own domain,
and they change it rarely. This page is for them. It says what to copy, what
each release tells you, and what this project promises to keep stable so that
an update stays an overwrite and never becomes a merge.

If you only want to run the timer, you do not need any of this. See the README.

## The copy is path for path

Copy these files to the **same paths** in your app. Keeping the paths is what
makes the next update a plain overwrite: every import between them resolves
unchanged.

| Path | What it is |
| --- | --- |
| `src/components/*` | the screen, the phone, the dial, the controls, the brand context |
| `src/lib/brand.ts`, `timer-*.ts`, `utils.ts`, `version.ts` | brand parsing, the clock, the relay, the sound |
| `src/app/api/timer/room/**` | the pairing relay (two route files) |
| `src/app/timer.css` | every style the components need (see below) |
| `src/lib/brand-server.ts` | only if your brand is chosen per deployment by `TIMER_BRAND` |

The two pages are one line each: render `<TimerScreen />` and `<TimerRemote />`
wherever your app wants them. Put the phone page at the screen's path plus
`/remote` (`/tools/timer` and `/tools/timer/remote`) and the pairing receipt
prints the right address with no configuration.

`src/app/layout.tsx` shows the three things the document needs before the
first paint: the brand's custom properties on `:root` (`brandCss`), the
optional pre-paint script for URL colours, and the brand's font stylesheet.
Your own layout does those, or the subset you use.

## A component on its own

The pages put the brand on `:root`. A component rendered somewhere else, a
`TimerDial` in a preview image or on a page of your own, needs the brand on an
element around it instead. `brandVars(brand)` returns exactly that set of
custom properties:

```tsx
import { TimerDial } from "@/components/timer-dial"
import { brandVars } from "@/lib/brand"

<div style={brandVars(brand) as React.CSSProperties}>
  <TimerDial fraction={0.5} durationSeconds={600} />
</div>
```

Load the brand's `fonts.stylesheet` on that page too. Without either, the
component is not broken but wrong: it draws from the fallbacks in `timer.css`,
the built-in colours and `system-ui`, and nothing reports it. In development,
`BrandProvider` warns in the console when a page reaches it with no brand set.

## Styles

Import `timer.css` from your own global stylesheet, after Tailwind:

```css
@import "tailwindcss";
@import "./timer.css";
```

It styles nothing the timer does not own. Every name in it is namespaced
(`--color-brand-*`, `timer-*`), so it cannot collide with your design system,
and your design system cannot change the timer: corners come from
`--brand-radius-*`, faces from `--brand-font-*`, and every transition states its
own duration and easing, rather than resolving `rounded-lg`, `font-sans` or the
default transition against your theme. Keep your own `globals.css`; nothing in
this project's version of it is required.

Dependencies: `canvas-confetti`, `clsx`, `lucide-react`, `tailwind-merge`, plus
Next.js, React and Tailwind CSS v4.

## Fitting it into your page

Both components take optional props, so the common adjustments are props and
not edits:

| Prop | On | What it is for |
| --- | --- | --- |
| `id`, `className` | both | on the root `<main>`, merged last, so a skip link can target it and your own rules for `main` can be undone |
| `remotePath` | `TimerScreen` | the phone page's path, when it is not the screen's path plus `/remote` |
| `relayPath` | both | where the two relay routes are served, when not at `/api/timer/room` |
| `logo` | `TimerScreen` | your own mark in place of the brand's; `null` for none |
| `watermark` | both | your own watermark in place of the brand's; `null` for none |

## Naming your own faces

A brand's `fonts` may name a custom property instead of a family, bare:
`"display": "var(--font-display), Georgia, serif"`. That is for font tooling
that only exposes a face under a generated property name. One rule: the
property must be defined on `:root` (the `<html>` element), where the brand's
own properties are. Defined lower, on `body` for example, the browser discards
the brand's entire stack, fallbacks included, and the timer shows `system-ui`.
So put the class or style that defines it on `<html>`.

## Checking your own brand

The rules this project holds its own brands to are one function,
`checkBrand` in `src/lib/brand.ts`. It takes a brand as written (the parsed
JSON of a brand file, or the object you build) and returns the problems it
finds, so an empty list means the brand keeps every promise: text on the
ground and the digits readable, every property set, every named face kept.
Run it in your own tests:

```ts
import { checkBrand } from "@/lib/brand"

expect(checkBrand(myBrand)).toEqual([])
```

## Which version you have

Each release is a git tag (`v1.1.0`) and an entry in `CHANGELOG.md`. Record the
tag you copied. "What changed since we last copied" is then
`git diff v1.1.0..v1.2.0`.

The running app states its version too: both pages put `data-timer-version`
on their root element, from `src/lib/version.ts`. That is the way to check
which release is actually deployed, rather than inferring it from a commit.

## What each release tells you

Every CHANGELOG entry has a **For hosts** part. It names:

- every file added, removed, renamed or moved;
- every change to an exported component's props;
- every new or renamed CSS custom property, utility class or keyframe;
- every new dependency, with its version;
- anything that became load-bearing;
- anything a host's own documentation would now be wrong about.

A release that moves or renames a file says so in its first line. That is the
one kind of change that turns an overwrite into work.

## What this project keeps stable

- **Paths are the interface.** Adding a file is free. Moving or renaming one is
  rare, and when it happens it is the headline of its own release.
- **Narrow diffs.** No reformatting, re-wrapping or re-ordering of a file in a
  change that touches three lines of it, so the diff you read is the change.
- **One concern per release** where it can be helped, so a rename, a
  dependency and a behaviour change are three decisions, not one.
- **No environment variable is required for a working instrument.** Without
  `TIMER_BRAND` you get the built-in brand, complete.
- **Brands fall back field by field.** A brand that sets three colours and
  nothing else still renders a whole instrument.
- **Derived, not configured.** The plate behind the digits and the colour of
  text on the ground are worked out from the brand's colours. New features
  follow that rule rather than adding settings every host has to keep in step.

## Load-bearing lines

These are marked in the files that hold them. Read the comment before you
change or drop one.

- `export const dynamic = "force-dynamic"` in `src/app/layout.tsx`: required
  only when the brand is read from `TIMER_BRAND` at runtime. A host with one
  compiled-in brand should drop it, or the timer pages lose static rendering
  without any error.
- The underscores in the `[@media(min-width:480px)_and_(min-height:480px)]`
  classes in `timer-chrome.tsx`: without them the CSS is invalid and the page
  fails at runtime, while lint, typecheck and build all pass.

## Runtime shape

A Node server, exactly one instance, with live pairings held in memory. The
relay carries state (how much time is left), never commands or absolute
timestamps. A change to any of that is announced as the headline of its
release, because it is the one kind of change your deployment may not be able
to absorb.
