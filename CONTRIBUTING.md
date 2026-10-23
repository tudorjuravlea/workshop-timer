# Contributing

Thanks for taking a look. This is a small project with a clear shape, so most
changes are quick.

## The short version

1. Fork the repo and create a branch off `main`.
2. Make the change.
3. Run the three checks below.
4. Open a pull request.

`main` is protected: it takes pull requests only, and it cannot be force-pushed
or deleted. You do not need anyone's approval to merge your own PR once it is
reviewed and green, but the PR has to exist.

## Running it

```bash
npm install
npm run dev       # http://localhost:3000
```

Node 20.9 or newer. No database, no accounts, no API keys. The phone remote
needs the dev server to be reachable from your phone, so use your machine's LAN
address rather than `localhost` when you test pairing on a real device.

## Before you open a PR

```bash
npm run lint
npm run typecheck
npm run build
```

All three must pass. `npm run lint` is the only formatting authority here:
there is no Prettier config, and the code has no semicolons. Please match the
surrounding style by hand rather than running a formatter the project does not
depend on, which will rewrite whole files around your three lines.

## Things worth knowing before you change them

**The dial is always the whole countdown.** Its marks and numbers come from
`dialScale` in `src/components/timer-dial.tsx`, for any length. Change the rule
there rather than special-casing a length.

**The clock is deadline driven, never a counter.** Every tick recomputes from a
wall clock rather than subtracting from a total, because browsers throttle
timers in background tabs and a subtracting clock loses minutes silently.

**The relay carries state, not commands.** It reports how much time is left and
each device rebuilds its own deadline from that. No absolute timestamp crosses
the wire, which is what stops a phone with a wrong clock from retiming the
room. Please do not simplify it into sending taps.

**Nothing in `src/components/` knows which brand it is wearing.** Colours come
from CSS custom properties fed by a brand file. If you find yourself writing a
literal colour in a component, the value probably belongs in `src/lib/brand.ts`
as a new role instead.

**Colours in brand files are hex and only hex.** These values are interpolated
into a `<style>` element and can arrive from a query string, so a value able to
carry a semicolon could write arbitrary CSS into the page. Keep the validation
strict.

**Round any SVG coordinate you compute.** `Math.sin` and `Math.cos` are not
bit identical between Node and the browser, so an unrounded tick mark
serialises differently on each side and React discards the whole tree with a
hydration mismatch that names an attribute rather than the cause.

## Reporting something

Issues are welcome, especially with the browser and the device. If it is about
the phone remote, say whether the screen and the phone were on the same network
and whether the receipt showed the phone as connected.
