import type { NextConfig } from "next";

// Decisions (docs/11-TOOLCHAIN.md): Cache Components and Partial Prefetching, which
// create-next-app 16.4 enables by default, are left OFF for the hackathon. The single page
// polls live chain state from the client and the x402 route handler must be dynamic on every
// request; the classic dynamic-rendering model has fewer rules to get wrong in six hours.
// Tailwind CSS 4 is wired through the Turbopack loader (no PostCSS config).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
