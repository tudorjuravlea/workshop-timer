import { TimerScreen } from "@/components/timer-screen"

// The clock itself, at the root: this app is one tool, so there is no reason
// to make anybody type a path.
//
// The duration lives in the URL FRAGMENT (`/#25`, `/#7:30`, and the `/#/25`
// the tool this was modelled on used), not in a query string, and that is
// structural rather than cosmetic: reading search parameters opts a route out
// of static rendering, and this page has no reason to be rendered per request.
// A fragment never reaches the server, so the page stays static and the link
// stays shareable. The brand, which DOES arrive in the query string, is
// applied in the browser for the same reason.
export default function Page() {
  return <TimerScreen />
}
