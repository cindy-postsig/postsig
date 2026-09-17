import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `isHierarchyEdge` tests `relationship_type == null` and therefore fails OPEN
 * on a row whose SELECT never asked for the column: `undefined == null` is true,
 * so a `'billing'` edge silently reads as a hierarchy edge. Consumers cannot
 * detect this — the column is simply absent from the embed — so the invariant has
 * to be enforced where the query is written.
 *
 * Contract 45 was the failure this guards: the invoices report reaches its data
 * through `fetchContractsByUserRoles`, whose relationship embed omitted the
 * column. Both of the invoice's parent edges read as hierarchy edges, so
 * `billingParentRows` found no billing parents, the second service order's
 * products were never unioned into the expected set, and three of four invoice
 * lines were reported as unexpected products — $1,250 expected against $13,926
 * billed, a +1014% phantom discrepancy.
 *
 * Asserted against the source because the selects are template literals built
 * inside their functions; there is no seam to read the resolved string from
 * without standing up the whole Supabase client and auth chain.
 */
describe('contract_relationships selects', () => {
  const source = readFileSync(
    join(process.cwd(), 'data/superuser/contracts.ts'),
    'utf8',
  );

  /**
   * Slice each embed from the `contract_relationships:` alias to its nested
   * `parent:` embed — the column list that matters. The parent embed always
   * follows, so it is a reliable terminator.
   */
  function relationshipEmbeds(): string[] {
    const embeds: string[] = [];
    const marker = 'contract_relationships:contract_relationships!';
    let from = source.indexOf(marker);
    while (from !== -1) {
      const parentAt = source.indexOf('parent:contracts!', from);
      embeds.push(source.slice(from, parentAt));
      from = source.indexOf(marker, from + marker.length);
    }
    return embeds;
  }

  it('finds every relationship embed in the file', () => {
    // A guard on the guard: if the embeds are refactored away from this shape,
    // the assertion below would vacuously pass over an empty list.
    expect(relationshipEmbeds().length).toBeGreaterThanOrEqual(2);
  });

  it('selects relationship_type in every embed, so isHierarchyEdge cannot fail open', () => {
    for (const embed of relationshipEmbeds()) {
      expect(embed).toContain('relationship_type');
    }
  });
});
