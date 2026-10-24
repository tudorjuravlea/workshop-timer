// Which release this is, as the running app states it: both pages put it on
// their root element as `data-timer-version`.
//
// A literal rather than an import of `package.json`, and that is the point. An
// app that copies these files into its own tree has its OWN package.json, and
// an import would quietly report that app's version instead of this one. The
// literal travels with the copy. Bump it with package.json, in the same commit
// as the release's CHANGELOG entry; `npm run check:brands` fails if the three
// disagree.
export const TIMER_VERSION = "2.1.0"
