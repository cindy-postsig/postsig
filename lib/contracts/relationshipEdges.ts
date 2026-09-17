/**
 * The single definition of "is this edge part of the contract tree?".
 *
 * `contract_relationships.relationship_type` is NULL for every hierarchy edge
 * (all pre-existing rows) and 'billing' for an *additional* parent of an
 * invoice. Tree-shaped code — parent maps, topmost-parent walks, strike chains —
 * must see only hierarchy edges, or a billing parent silently becomes a child's
 * structural parent.
 *
 * The predicate tests `!= null` rather than `!== 'billing'` so any future typed
 * edge is tree-invisible by default: a new type added to the DB CHECK cannot
 * leak into traversal by being forgotten here.
 */

export interface TypedRelationship {
  relationship_type?: string | null;
}

export function isHierarchyEdge(rel: TypedRelationship): boolean {
  return rel.relationship_type == null;
}
