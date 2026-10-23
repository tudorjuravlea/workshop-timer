import { readFile } from "node:fs/promises"
import path from "node:path"

import { DEFAULT_BRAND, type Brand, parseBrand } from "@/lib/brand"

// Which brand this DEPLOYMENT wears, resolved once on the server.
//
// This is the "design system" half of the two ways to brand this timer: a file
// that ships with the deployment, applied before the first byte reaches the
// browser, so a self-hosted copy has its own colours with no query string and
// no flash of anything else. The other half is the URL, which is a per-visit
// override and lives in `components/brand-provider.tsx`.
//
// `TIMER_BRAND` takes two forms:
//   a bare name  ->  brands/<name>.json, next to package.json
//   a URL        ->  fetched once, the first time a page is rendered
// Anything unreadable logs a line and leaves the built-in brand in place. A
// deployment with a typo in this variable should still show a working clock.
//
// A name rather than an arbitrary path on purpose, twice over: it is the only
// form the bundler can see is confined to one folder (given a path it cannot
// predict, Turbopack traces the ENTIRE project into the server output), and it
// removes any question of this variable reading a file it should not.

const NAME = /^[a-z0-9][a-z0-9_-]{0,60}$/i

/** Resolved at most once per process. A brand cannot change while the server
 *  is up, so re-reading it per request would be a file system call on the path
 *  that renders a countdown. */
let cached: Promise<Brand> | null = null

async function readSource(source: string): Promise<unknown> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { cache: "no-store" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
  if (!NAME.test(source)) {
    throw new Error(
      "expected a brand name (a file in brands/) or an http(s) URL"
    )
  }
  const file = path.join(process.cwd(), "brands", `${source}.json`)
  return JSON.parse(await readFile(file, "utf8"))
}

async function resolve(): Promise<Brand> {
  const source = process.env.TIMER_BRAND?.trim()
  if (!source) return DEFAULT_BRAND
  try {
    return parseBrand(await readSource(source), DEFAULT_BRAND, (problem) =>
      console.warn(`[brand] ${source}: ${problem}`)
    )
  } catch (error) {
    console.warn(`[brand] could not load ${source}, using the default brand:`, error)
    return DEFAULT_BRAND
  }
}

export function loadBrand(): Promise<Brand> {
  cached ??= resolve()
  return cached
}

/** Whether a visitor may re-brand their own page through the query string.
 *  On by default, because that is the feature; `TIMER_BRAND_FROM_URL=off` is
 *  for a deployment that must only ever appear in one set of colours. */
export function urlBrandingAllowed(): boolean {
  return process.env.TIMER_BRAND_FROM_URL?.trim().toLowerCase() !== "off"
}
