// The promises a brand relies on, checked against every file in `brands/`.
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
  DEFAULT_BRAND,
  brandVars,
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
}

const failures = []
const fail = (where, message) => failures.push(`${where}: ${message}`)

const files = readdirSync(path.join(root, "brands")).filter((f) => f.endsWith(".json"))
if (files.length < 4) fail("brands/", `expected at least 4 fixtures, found ${files.length}`)

for (const file of files) {
  const where = `brands/${file}`
  const raw = JSON.parse(readFileSync(path.join(root, "brands", file), "utf8"))
  const brand = parseBrand(raw, DEFAULT_BRAND, (problem) => fail(where, `rejected: ${problem}`))
  const vars = brandVars(brand)
  const c = brand.colors

  // Every property the components read is set, whatever the file left out.
  const expected = COLOR_KEYS.length + 5 // the colours, three font stacks, two radii
  if (Object.keys(vars).length !== expected) {
    fail(where, `${Object.keys(vars).length} custom properties, expected ${expected}`)
  }
  for (const [name, value] of Object.entries(vars)) {
    if (!name.startsWith("--brand-")) fail(where, `${name} is not namespaced --brand-*`)
    if (!value) fail(where, `${name} is empty`)
  }

  // Text set on the ground reads, whatever `onGround` the file declared.
  const onGround = vars["--brand-on-ground"]
  const text = contrastRatio(onGround, c.ground)
  if (text < 4.5) fail(where, `text on the ground is ${text.toFixed(2)}:1, needs 4.5:1`)

  // The digits read: on the ground when there is no plate, on the face when
  // there is one. Large text, so 3:1.
  const plate = needsPlinth(brand)
  const behind = plate ? c.face : c.ground
  const digits = contrastRatio(c.accent, behind)
  if (digits < 3) {
    fail(where, `the digits are ${digits.toFixed(2)}:1 on the ${plate ? "plate" : "ground"}, need 3:1`)
  }
  if (!(file in PLATE)) fail(where, "not in the PLATE table: say whether it should get a plate")
  else if (PLATE[file] !== plate) fail(where, `plate ${plate}, expected ${PLATE[file]}`)

  // A face the file names is the face that ships: never dropped back to a
  // default by validation.
  const fonts = raw.fonts ?? {}
  for (const key of ["body", "display", "mono"]) {
    if (typeof fonts[key] === "string" && vars[`--brand-font-${key}`] !== fonts[key].trim()) {
      fail(where, `fonts.${key} was named but did not survive parsing`)
    }
  }

  // The panel's corner stays concentric with its controls' (see `radius`).
  const control = parseFloat(vars["--brand-radius-control"])
  const panel = parseFloat(vars["--brand-radius-panel"])
  if (panel - control !== 8) fail(where, `panel radius ${panel}px is not control ${control}px + 8px`)

  console.log(
    `${where.padEnd(30)} text ${text.toFixed(2)}:1  digits ${digits.toFixed(2)}:1 on the ${plate ? "plate" : "ground"}`
  )
}

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
