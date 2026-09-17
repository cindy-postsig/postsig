'use client';

import dynamic from 'next/dynamic';

// Recharts assigns SVG clipPath ids from a module-level counter, which drifts
// between the server render pass and the client hydration pass — rendering
// only on the client sidesteps the resulting hydration mismatch. Wrapped here
// once so every consumer gets it automatically instead of repeating the
// dynamic() import at each call site.
export const Sparkline = dynamic(
  () => import('./SparklineImpl').then((m) => m.Sparkline),
  { ssr: false },
);
