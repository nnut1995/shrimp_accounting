import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep pages the browser has already loaded (or preloaded on hover) for a
    // short while, so going back to them is instant. Saving anything in the app
    // clears this cache, so your own edits always show straight away; changes
    // made elsewhere (API, Discord bot) can take up to a minute to appear.
    staleTimes: { dynamic: 30, static: 60 },
  },
};

export default nextConfig;
