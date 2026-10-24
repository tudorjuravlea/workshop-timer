// The promises a brand relies on, checked against every file in `brands/`.
// The rules themselves are `checkBrand` in `src/lib/brand.ts`; this script adds
// what only makes sense for the fixtures (which branch of the plate rule each
// one proves) and checks that the version agrees in three places.
//
//   npm run check:brands
//
// "It adapts to any brand" used to be tested by rebranding it and looking. This
// turns that look into a gate: each fixture in `brands/` is parsed exactly as a
// deployment would parse it, and the derived rules have to hold for all of
// them. The fixtures are chosen to push each rule down both of its branches: a
// pale ground (text on the ground must swap to ink), a saturated ground (the
// plate behind the digits must appear), and a brand that sets one colour (the
// rest must be inherited).
//
// It also checks that the three places a version is written agree.
//
// Imports the TypeScript sources directly, which Node 24 runs as they are.

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  COLOR_KEYS,
  brandVars,
  checkBrand,
  contrastRatio,
  needsPlinth,
  parseBrand,
} from "../src/lib/brand.ts"
import { TIMER_VERSION } from "../src/lib/version.ts"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

/** What each fixture is there to prove about the plate. A fixture missing
 *  from this table fails, so a new one has to say which branch it covers. */
const PLATE = {
  "example.json": false,
  "light-ground.json": false,
  "saturated-ground.json": true,
  "accent-only.json": false,
  "pale-accent-on-plate.json": true,
  "bright-accent-on-dark.json": false,
}

/** Which fixtures need a deeper shade of their accent on the face (true), and
 *  which must keep the accent exactly as declared (false): the rule may never
 *  touch a brand that already reads. */
const SHADED = {
  "example.json": false,
  "light-ground.json": false,
  "saturated-ground.json": false,
  "accent-only.json": false,
  "pale-accent-on-plate.json": true,
  "bright-accent-on-dark.json": true,
}

const failures = []
const fail = (where, message) => failures.push(`${where}: ${message}`)

const files = readdirSync(path.join(root, "brands")).filter((f) => f.endsWith(".json"))
if (files.length < 4) fail("brands/", `expected at least 4 fixtures, found ${files.length}`)

for (const file of files) {
  const where = `brands/${file}`
  const raw = JSON.parse(readFileSync(path.join(root, "brands", file), "utf8"))
  for (const problem of checkBrand(raw)) fail(where, problem)

  // Every property the components read is emitted, and namespaced.
  const brand = parseBrand(raw)
  const vars = brandVars(brand)
  const expected = COLOR_KEYS.length + 6 // the colours, the accent's face shade, three font stacks, two radii
  if (Object.keys(vars).length !== expected) {
    fail(where, `${Object.keys(vars).length} custom properties, expected ${expected}`)
  }
  for (const name of Object.keys(vars)) {
    if (!name.startsWith("--brand-")) fail(where, `${name} is not namespaced --brand-*`)
  }

  // Which branch of the plate rule this fixture is here to prove.
  const plate = needsPlinth(brand)
  if (!(file in PLATE)) fail(where, "not in the PLATE table: say whether it should get a plate")
  else if (PLATE[file] !== plate) fail(where, `plate ${plate}, expected ${PLATE[file]}`)

  const shaded = vars["--brand-accent-face"] !== brand.colors.accent
  if (!(file in SHADED)) fail(where, "not in the SHADED table: say whether its accent should be shaded")
  else if (SHADED[file] !== shaded) fail(where, `accent shaded ${shaded}, expected ${SHADED[file]}`)

  const c = brand.colors
  const text = contrastRatio(vars["--brand-on-ground"], c.ground)
  const digits = plate
    ? contrastRatio(vars["--brand-accent-face"], c.face)
    : contrastRatio(c.accent, c.ground)
  console.log(
    `${where.padEnd(34)} text ${text.toFixed(2)}:1  digits ${digits.toFixed(2)}:1 on the ${plate ? "plate" : "ground"}  wedge ${contrastRatio(vars["--brand-accent-face"], c.face).toFixed(2)}:1${shaded ? " (shaded)" : ""}`
  )
}

// A font stack may name a custom property, bare, and nothing more: anything
// that could carry a second argument, a nested call or punctuation out of the
// declaration stays rejected.
const STACKS = {
  "var(--font-sans)": true,
  "var(--font-geist-sans), system-ui, sans-serif": true,
  "'Inter', var(--x_1)": true,
  "var(--x, red)": false,
  "var(--x);color:red": false,
  "var(--x)}body{": false,
  "var(var(--x))": false,
  "url(evil)": false,
  "var(--)": false,
}
for (const [stack, ok] of Object.entries(STACKS)) {
  const accepted = parseBrand({ fonts: { body: stack } }).fonts.body === stack
  if (accepted !== ok) fail("fonts", `${JSON.stringify(stack)} ${accepted ? "accepted" : "rejected"}, expected the opposite`)
}
console.log(`${Object.keys(STACKS).length} font stacks accepted or rejected as expected`)

// One version, written three times.
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8").match(/^## v(\S+)/m)?.[1]
if (pkg !== TIMER_VERSION) fail("version", `package.json ${pkg}, src/lib/version.ts ${TIMER_VERSION}`)
if (pkg !== changelog) fail("version", `package.json ${pkg}, newest CHANGELOG entry ${changelog}`)
console.log(`version ${pkg} in package.json, version.ts and CHANGELOG.md`)

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n  ${failures.join("\n  ")}`)
  process.exit(1)
}
console.log("\nall brand guarantees hold")
