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
| `src/lib/brand-server.ts` | only if your brand is chosen per deployment by `TIMER_BRAND` |

The two pages are one line each: render `<TimerScreen />` and `<TimerRemote />`
wherever your app wants them. `src/app/layout.tsx` shows the three things the
document needs before the first paint: the brand's custom properties on
`:root` (`brandCss`), the optional pre-paint script for URL colours, and the
brand's font stylesheet. Your own layout does those, or the subset you use.

Dependencies: `canvas-confetti`, `clsx`, `lucide-react`, `tailwind-merge`, plus
Next.js, React and Tailwind CSS v4.

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

## Known gaps

These still need a hand edit after copying. Each is on the list to remove.

- The pairing receipt prints `/remote` after the host name
  (`timer-chrome.tsx`), and the relay client calls `/api/timer/room`. Mounted
  anywhere else, both need editing.
- The global class names `label`, `receipt-feed` and `dial-shake`, and their
  keyframes, are unprefixed.
- `src/app/globals.css` is written for this app's own document. The colour,
  font, radius and easing tokens components rely on live in its `@theme`
  block, and corners and fonts resolve against whatever your own theme defines
  for `rounded-lg`, `font-sans` and the like.
