"use client"

import * as React from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener("change", callback)
  return () => mq.removeEventListener("change", callback)
}

/** Whether this visitor has asked their system for less movement.
 *
 *  Backed by a store rather than an effect so it is readable during render,
 *  and false through the server render — which is correct here: the one place
 *  it changes behaviour is the control bar, and a bar that starts visible is
 *  the safe state either way. */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
