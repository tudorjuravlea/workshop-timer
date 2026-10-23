import path from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const here = path.dirname(fileURLToPath(import.meta.url))

// Browser protections sent with every response. Short, because this app holds
// no accounts, no forms and no data — a timer and a five-character code that
// is worth a countdown for four hours.
//
// Two of them are deliberate OMISSIONS rather than oversights:
//
// - Framing is allowed from ANY site. A countdown is exactly the kind of thing
//   a facilitator drops into Notion, Miro or a Google Site, and there is
//   nothing here for a hostile framer to trick anybody into clicking. Hence
//   `frame-ancestors *` and no `X-Frame-Options`, which has no way to say
//   "anyone".
// - `Permissions-Policy` does not mention `fullscreen` or `screen-wake-lock`,
//   because the timer needs both: F projects it, and the wake lock is what
//   stops a laptop blanking the clock halfway through a workshop. Whether a
//   host page grants fullscreen to an embed is that page's business.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors *" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pinned, or Turbopack takes the workspace root from the nearest lockfile
  // ABOVE this folder and ends up watching a whole home directory.
  turbopack: {
    root: path.join(here),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
