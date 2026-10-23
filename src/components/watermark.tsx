"use client"

import { useBrand } from "@/components/brand-provider"
import { cn } from "@/lib/utils"

// The brand's wordmark, washed into the ground behind the clock. Optional:
// a brand with no `watermark` renders nothing, which is the white-label
// default.
//
// Two rules carried over from the design system this was extracted from, both
// about the same failure. A watermark that READS as a word is a stamp sitting
// on the page; what is wanted is a texture, so the letterforms have to bleed
// off every edge and the opacity has to stay a whisper. Hence the sizing
// choice below, which is the part that is easy to get wrong: on a wide screen
// the width carries it, but on a phone — a tall narrow band — a width that
// bleeds off the sides leaves the word floating in the middle. Sizing by
// HEIGHT bleeds top and bottom at any aspect ratio, and a script wider than it
// is tall then runs off the sides for free.
export function Watermark({ className }: { className?: string }) {
  const { watermark } = useBrand()
  if (!watermark) return null
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={watermark.src}
      alt=""
      aria-hidden
      style={{ opacity: watermark.opacity }}
      className={cn(
        "pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none",
        className
      )}
    />
  )
}
