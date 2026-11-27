"use client";

import Link, { useLinkStatus } from "next/link";
import { useState, type ComponentProps } from "react";

// Thin bar at the top of the window while a click waits for the next page, so
// the current page stays on screen instead of being swapped for a spinner.
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-blue-600 transition-opacity duration-150 ${
        pending ? "opacity-100 animate-pulse" : "opacity-0"
      }`}
    />
  );
}

/**
 * Link that loads the whole next page in the background as soon as the user
 * shows intent (hover, touch or keyboard focus), so the click itself usually
 * needs no server trip. Pass `prefetch` to override, e.g. `prefetch` (true)
 * for menu links that should load as soon as they are on screen.
 */
export default function FastLink({
  prefetch,
  children,
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={prefetch ?? (intent ? true : false)}
      onMouseEnter={(e) => { setIntent(true); onMouseEnter?.(e); }}
      onTouchStart={(e) => { setIntent(true); onTouchStart?.(e); }}
      onFocus={(e) => { setIntent(true); onFocus?.(e); }}
    >
      {children}
      <PendingBar />
    </Link>
  );
}
