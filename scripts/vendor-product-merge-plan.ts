/**
 * Pure planning logic for merging duplicate vendor_products rows that were
 * forked across a corporate-action vendor family (see
 * scripts/backfill-forked-vendor-products.ts for the CLI shell).
 *
 * Families are connected components over two edge kinds: merge lineage
 * (current_vendors view rows) and corporate-action pairs. Components make
 * chained corp actions transitive, which is slightly broader than the
 * pairwise relatedness the runtime enforces — acceptable here because the
 * dry-run report shows the full family composition before anything is
 * applied.
 */
import { toFoldKey } from '../lib/name-matching';

export interface CurrentVendorRow {
  original_vendor_id: number | null;
  current_vendor_id: number | null;
}

export interface CorpActionRow {
  primary_vendor_id: number | null;
  secondary_vendor_id: number | null;
}

export interface ProductRow {
  id: number;
  vendor_id: number;
  name: string;
  created_at: string;
}

export interface VendorFamilies {
  /** Vendor id → family root id, for members of multi-vendor families only. */
  familyOf: Map<number, number>;
  /** Family root id → sorted member vendor ids (always 2+). */
  families: Map<number, number[]>;
}

export interface MergeGroup {
  familyRoot: number;
  foldKey: string;
  /** Display name, taken from the canonical row. */
  name: string;
  canonical: ProductRow;
  duplicates: ProductRow[];
}

class UnionFind {
  private parent = new Map<number, number>();

  find(id: number): number {
    const parent = this.parent.get(id);
    if (parent === undefined || parent === id) {
      this.parent.set(id, id);
      return id;
    }
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }

  members(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const group = groups.get(root);
      if (group) group.push(id);
      else groups.set(root, [id]);
    }
    return groups;
  }
}

export function buildVendorFamilies(
  viewRows: CurrentVendorRow[],
  corpRows: CorpActionRow[],
): VendorFamilies {
  const unionFind = new UnionFind();
  for (const row of viewRows) {
    if (row.original_vendor_id != null && row.current_vendor_id != null) {
      unionFind.union(row.original_vendor_id, row.current_vendor_id);
    }
  }
  for (const row of corpRows) {
    if (row.primary_vendor_id != null && row.secondary_vendor_id != null) {
      unionFind.union(row.primary_vendor_id, row.secondary_vendor_id);
    }
  }

  const familyOf = new Map<number, number>();
  const families = new Map<number, number[]>();
  for (const [root, members] of unionFind.members()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => a - b);
    families.set(root, sorted);
    for (const member of sorted) familyOf.set(member, root);
  }
  return { familyOf, families };
}

/** Oldest row wins; equal timestamps fall back to the lowest id. */
function pickCanonical(rows: ProductRow[]): ProductRow {
  return [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
  )[0];
}

/**
 * Groups products by (family, folded name) and plans a merge for every group
 * that spans more than one vendor — a same-name product forked across family
 * members. Same-vendor-only duplicates are left alone: they predate the fork
 * bug and merging them is out of scope.
 */
export function planProductMerges(
  products: ProductRow[],
  { familyOf }: VendorFamilies,
): MergeGroup[] {
  const groups = new Map<string, ProductRow[]>();
  for (const product of products) {
    const root = familyOf.get(product.vendor_id);
    if (root === undefined) continue;
    const foldKey = toFoldKey(product.name);
    if (!foldKey) continue;
    const key = `${root}|${foldKey}`;
    const group = groups.get(key);
    if (group) group.push(product);
    else groups.set(key, [product]);
  }

  const plan: MergeGroup[] = [];
  for (const [key, rows] of groups) {
    const vendorIds = new Set(rows.map((row) => row.vendor_id));
    if (rows.length < 2 || vendorIds.size < 2) continue;
    const canonical = pickCanonical(rows);
    plan.push({
      familyRoot: Number(key.split('|')[0]),
      foldKey: key.slice(key.indexOf('|') + 1),
      name: canonical.name,
      canonical,
      duplicates: rows
        .filter((row) => row.id !== canonical.id)
        .sort((a, b) => a.id - b.id),
    });
  }
  return plan.sort(
    (a, b) => a.familyRoot - b.familyRoot || a.canonical.id - b.canonical.id,
  );
}
