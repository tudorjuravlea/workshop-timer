import type { Metadata } from "next"

import { TimerRemote } from "@/components/timer-remote"

// The phone that drives the clock from across the room.
//
// `noindex`, because this page is useless to anyone who is not standing in
// front of a paired screen — and never a robots.txt rule instead, which would
// stop a crawler ever seeing the noindex it is being told about.
export const metadata: Metadata = {
  title: "Timer remote",
  description: "Drive the timer from your phone.",
  robots: { index: false, follow: false },
}

export default function RemotePage() {
  return <TimerRemote />
}
