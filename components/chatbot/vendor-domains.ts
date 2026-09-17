import type { UIMessage } from '@ai-sdk/react';

type ToolPart = UIMessage['parts'][number];

/**
 * Walk every completed tool output in the assistant message and pull out any
 * `{ name, domain }` shape we recognize as a vendor. Used to enrich vendor
 * cells in markdown tables with the proper icon — the model only writes the
 * vendor name in the cell, the domain comes from the tool output already in
 * context. Robust to schema variation (list_contracts.contracts[].vendor,
 * list_vendors.vendors[], get_vendor.vendor, etc.).
 */
export function buildVendorDomainMap(
  toolParts: ToolPart[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of toolParts) {
    const p = part as { state?: string; output?: unknown };
    if (p.state !== 'output-available' || !p.output) continue;
    collectVendorDomains(p.output, map);
  }
  return map;
}

function collectVendorDomains(
  value: unknown,
  into: Map<string, string>,
  depth = 0,
): void {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) collectVendorDomains(item, into, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.name === 'string' &&
    typeof obj.domain === 'string' &&
    obj.domain.length > 0
  ) {
    const key = obj.name.trim().toLowerCase();
    if (key && !into.has(key)) into.set(key, obj.domain);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') collectVendorDomains(v, into, depth + 1);
  }
}
