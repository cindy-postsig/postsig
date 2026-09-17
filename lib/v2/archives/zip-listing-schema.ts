import { z } from 'zod';

// Persisted entry: matches the compact shape written by
// `lib/archive/zip-listing-client.ts` and read by the hextraction viewer.
// Recursive (`c` field) so nested zip contents come through verbatim.
export interface PersistedZipEntry {
  n: string;
  s?: number;
  d?: boolean;
  z?: boolean;
  c?: PersistedZipEntry[];
}

const PersistedZipEntrySchema: z.ZodType<PersistedZipEntry> = z.lazy(() =>
  z.object({
    n: z.string(),
    s: z.number().int().nonnegative().optional(),
    d: z.boolean().optional(),
    z: z.boolean().optional(),
    c: z.array(PersistedZipEntrySchema).optional(),
  }),
);

export const ZipListingSchema = z.object({
  zip64: z.boolean(),
  totalEntries: z.number().int().nonnegative(),
  entries: z.array(PersistedZipEntrySchema),
  truncated: z.boolean().optional(),
});

export type ZipListing = z.infer<typeof ZipListingSchema>;

export const MAX_PERSISTED_ENTRIES = 50_000;

// Count entries across the whole tree (incl. nested zips' children) so we
// can compare against the cap end-to-end, not just at the top level.
export function countListingEntries(entries: PersistedZipEntry[]): number {
  let total = 0;
  const walk = (arr: PersistedZipEntry[]) => {
    for (const e of arr) {
      total += 1;
      if (e.c) walk(e.c);
    }
  };
  walk(entries);
  return total;
}
