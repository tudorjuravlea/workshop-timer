"use client"

import * as React from "react"

import {
  DEFAULT_BRAND,
  type Brand,
  brandFromParams,
  brandVars,
  parseBrand,
} from "@/lib/brand"

// The URL half of branding. The deployment's own brand arrives already applied
// from the server (`lib/brand-server.ts`); this is what lets one deployment
// wear somebody else's colours for one session:
//
//   ?brand=https://acme.com/timer-brand.json     a whole brand file
//   ?accent=%23e8622a&ground=%23101010           a few colours, no hosting
//
// Both at once is allowed, and the parameters win: a file is a brand, a
// parameter typed into the address bar is a correction to it.
//
// The file is fetched BY THE BROWSER, not proxied through this server, which
// is a deliberate trade. It means the brand's host has to send
// `Access-Control-Allow-Origin` (every CDN and GitHub raw already does), and
// in exchange this app will never fetch an arbitrary address on anyone's
// behalf — a proxy here would be an open door into whatever network the
// deployment happens to sit in.
//
// Nothing fetched is trusted: `parseBrand` accepts hex colours, plain font
// stacks and http(s) URLs, and silently drops everything else. A brand file is
// data from a third party, so the worst a hostile one can do is choose ugly
// colours.

const BrandContext = React.createContext<Brand>(DEFAULT_BRAND)

/** The brand the page is currently wearing. Components read the logo, the
 *  watermark and the name from here; the colours they get from CSS. */
export function useBrand(): Brand {
  return React.useContext(BrandContext)
}

// The query string, readable DURING RENDER rather than in an effect.
//
// That is what keeps the whole override a derived value: an effect that called
// setState here would be a cascading render on every page load, and React says
// so. Empty through the server render and the hydration render, then the real
// search string — React re-renders once on its own when the two snapshots
// disagree, which is the documented way to render something the server cannot
// know without a hydration mismatch.
//
// Nothing to subscribe to: the search string only changes by navigating, and
// that remounts the tree.
const subscribeNothing = () => () => {}

function useSearch(): string {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => window.location.search,
    () => ""
  )
}

/** Put a brand's colours straight onto the root element.
 *
 *  An inline declaration on `<html>`, not a stylesheet, because it has to beat
 *  the `:root` rule the server already wrote without either side having to
 *  care which one the browser parsed last. */
function applyVars(brand: Brand): void {
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(brandVars(brand))) {
    style.setProperty(name, value)
  }
}

function warn(problem: string): void {
  console.warn(`[brand] from the URL: ${problem}`)
}

export function BrandProvider({
  brand,
  allowUrl,
  children,
}: {
  /** What the server resolved. Also the base every override falls back to, so
   *  a parameter that only sets an accent keeps the deployment's own ground. */
  brand: Brand
  /** False when the deployment has pinned its brand (`TIMER_BRAND_FROM_URL=off`). */
  allowUrl: boolean
  children: React.ReactNode
}) {
  const search = useSearch()
  const params = React.useMemo(
    () => (allowUrl ? new URLSearchParams(search) : new URLSearchParams()),
    [allowUrl, search]
  )

  /** A brand file named by `?brand=`. The one thing here that genuinely has to
   *  be state: it arrives over the network, long after the first render. */
  const [file, setFile] = React.useState<unknown>(null)

  const src = params.get("brand")
  React.useEffect(() => {
    if (!src) return
    let live = true
    void fetch(src, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: unknown) => {
        if (live) setFile(json)
      })
      .catch((error: unknown) => {
        console.warn(`[brand] could not load ${src}:`, error)
      })
    return () => {
      live = false
    }
  }, [src])

  // Server brand, then the file it was pointed at, then the loose parameters
  // on top. Derived in one place so there is no order for the three of them to
  // fall out of.
  const resolved = React.useMemo(() => {
    const base = file === null ? brand : parseBrand(file, brand, warn)
    return brandFromParams(params, base, warn) ?? base
  }, [brand, file, params])

  // The only side effect: tell the document. `applyVars` writes the custom
  // properties the whole app reads its colours from, and the pre-paint script
  // in `app/layout.tsx` has already set the ones that came from parameters —
  // this is what carries them into the logo and the name as well.
  React.useEffect(() => {
    applyVars(resolved)
  }, [resolved])

  // The brand's webfonts. Appended rather than rendered, because the document
  // already has the server brand's stylesheet in its head and the two have to
  // coexist: the fallback stack in every font declaration is what covers the
  // gap while a late one loads.
  const stylesheet = resolved.fonts.stylesheet
  React.useEffect(() => {
    if (!stylesheet) return
    const already = [...document.querySelectorAll<HTMLLinkElement>("link[data-brand-font]")]
    if (already.some((link) => link.getAttribute("href") === stylesheet)) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = stylesheet
    link.dataset.brandFont = ""
    document.head.append(link)
  }, [stylesheet])

  // The tab's title follows the brand, including an override that only arrives
  // after the page has loaded. Set here rather than through `metadata`, which
  // the server writes before it can know about a URL override.
  React.useEffect(() => {
    document.title = resolved.name
  }, [resolved.name])

  return <BrandContext.Provider value={resolved}>{children}</BrandContext.Provider>
}
