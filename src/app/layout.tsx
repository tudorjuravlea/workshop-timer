import type { Metadata, Viewport } from "next"

import { BrandProvider } from "@/components/brand-provider"
import { brandCss, inlineParamVars } from "@/lib/brand"
import { loadBrand, urlBrandingAllowed } from "@/lib/brand-server"

import "./globals.css"

// The deployment's brand is resolved on the server and written into the
// document, so the first frame the projector shows is already the right
// colours. The URL override that may follow is `components/brand-provider.tsx`.

// Rendered per request, and this is the line that makes `TIMER_BRAND` mean
// what everybody assumes it means.
//
// Without it both pages are prerendered, which runs `loadBrand()` at BUILD
// time and bakes that brand into the HTML: setting the variable on the running
// server then does nothing at all, silently, and the deployment serves the
// default brand while its configuration says otherwise. (Found exactly that
// way — by booting with the variable set and reading the served HTML, which
// came back with the built-in colours.)
//
// The cost is a render per request with no data fetching behind it: the brand
// is resolved once per process and cached. The countdown itself stays entirely
// client-side, and the duration still travels in the URL fragment rather than
// a search parameter, so nothing here reads the request either.
//
// FOR AN APP THAT COPIES THESE FILES: this line exists only because the brand
// is read from `TIMER_BRAND` at runtime. A host that compiles one brand in has
// no reason to keep it, and keeping it costs that host static rendering of the
// timer pages without any error to say so. A host that DOES read the brand per
// deployment must keep it, or the variable silently does nothing.
export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadBrand()
  return {
    title: brand.name,
    description: "A countdown for the front of a room, with a phone remote.",
  }
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await loadBrand()
  return {
    width: "device-width",
    initialScale: 1,
    // Required for `env(safe-area-inset-*)` to resolve to anything: without
    // it the phone remote's bottom row sits under the home indicator.
    viewportFit: "cover",
    themeColor: brand.colors.ground,
  }
}

/** Set the inline colour parameters BEFORE the first paint.
 *
 *  Everything else about a URL brand happens in React, which means it happens
 *  after hydration — one frame of the deployment's own colours, which on a
 *  projector in a quiet room is a visible flash. The cheap half of the feature
 *  does not have to wait for React: a handful of hex values out of the query
 *  string can be on the root element before the body is parsed.
 *
 *  The parameter-to-property table comes from `lib/brand.ts` rather than being
 *  written out again here, because the one failure this must not have is the
 *  frame before hydration disagreeing with every frame after it. The hex test
 *  is repeated, and that is on purpose: this script is the only place a value
 *  from the query string reaches CSS without `parseBrand` having seen it. */
function prePaintScript(): string {
  const table = JSON.stringify(inlineParamVars())
  return `(function(){try{var t=${table},p=new URLSearchParams(location.search),s=document.documentElement.style,h=/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;for(var k in t){var v=p.get(k);if(v&&h.test(v))t[k].forEach(function(n){s.setProperty(n,v)})}}catch(e){}})()`
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const brand = await loadBrand()
  const allowUrl = urlBrandingAllowed()

  return (
    // `suppressHydrationWarning` covers ONE element's own attributes, and this
    // is the element whose attributes are deliberately different: the
    // pre-paint script below writes the URL's colours onto `<html>` as an
    // inline style, which the server had no way to render. Without it React
    // reports a mismatch on every branded link, and keeps the client's
    // values anyway. Nothing inside the document is suppressed by it.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Both of these are the first things in the body so they take effect
            before anything below them is painted. The stylesheet carries the
            brand's custom properties; the script, when the query string is
            allowed to override them, carries the overrides. Values in both
            have been through `parseBrand`, which accepts hex colours and plain
            font stacks and nothing else, so neither can leave its
            declaration. */}
        <style>{brandCss(brand)}</style>
        {allowUrl && <script dangerouslySetInnerHTML={{ __html: prePaintScript() }} />}
        {brand.fonts.stylesheet && (
          <link rel="stylesheet" href={brand.fonts.stylesheet} data-brand-font="" />
        )}
        <BrandProvider brand={brand} allowUrl={allowUrl}>
          {children}
        </BrandProvider>
      </body>
    </html>
  )
}
