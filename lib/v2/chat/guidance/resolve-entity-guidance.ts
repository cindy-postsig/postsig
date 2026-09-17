export function buildResolveEntityToolDescription(): string {
  return 'Resolves an ambiguous name to its entity type (vendor, product, tag, business group, or sponsor). Returns matching entities with contract counts.';
}

export function buildResolveEntityCapability(): string {
  return `
**Entity Resolution** (resolve_entity):
Disambiguate a name across vendors, products, tags, business groups, and sponsors.
Use when a user mentions a name and the entity type is unclear.
Returns matches with entity type and contract count so you can pick the correct filter for follow-up queries.
`;
}
