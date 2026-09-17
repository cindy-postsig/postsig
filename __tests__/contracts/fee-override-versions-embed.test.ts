import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `hasFeeOverrides` now treats a version row with no `changed_data` as proof of
 * a fee edit, because the contract-set selects stopped shipping the JSONB and
 * pushed the `changed_data ? 'fees'` test into the query. That only holds while
 * the narrow embed and its embedded filter ship together: an embed without the
 * filter returns every version row — a products-renamed edit included — and
 * every one of them would read as a fee override, silently suppressing
 * annual_increase compounding across the whole set.
 *
 * Asserted against the source because the selects are template literals built
 * inside their functions, the same reason report-relationship-select.test.ts
 * reads the file (there is no seam short of the whole Supabase and auth chain).
 */
describe('fee-override version embed', () => {
  const source = readFileSync(
    join(process.cwd(), 'data/superuser/contracts.ts'),
    'utf8',
  );

  const embedUses = source.match(/\$\{FEE_OVERRIDE_VERSIONS_EMBED\}/g) ?? [];
  const filterUses = source.match(/FEE_OVERRIDE_VERSIONS_FILTER,/g) ?? [];

  it('ships full changed_data only through the parent-side constant', () => {
    const fullEmbed = source.match(
      /vendor_products_details_versions \(changed_data\)/g,
    );
    // Exactly the PARENT_FEE_OVERRIDE_VERSIONS_EMBED definition: the child-set
    // embeds stay narrow+filtered, while an embedded parent must carry the
    // JSONB so hasFeeOverrides' full-shape branch can suppress compounding.
    expect(fullEmbed).toHaveLength(1);
    expect(source).toContain('PARENT_FEE_OVERRIDE_VERSIONS_EMBED');
    expect(
      source.match(/\$\{PARENT_FEE_OVERRIDE_VERSIONS_EMBED\}/g),
    ).toHaveLength(2);
  });

  it('applies the embedded filter once per narrow embed', () => {
    expect(embedUses.length).toBeGreaterThanOrEqual(3);
    expect(filterUses.length).toBe(embedUses.length);
  });

  it('keeps the filter on the jsonb -> operator, so a recorded null fee still counts', () => {
    expect(source).toContain(
      "'vendor_products_details.vendor_products_details_versions.changed_data->fees'",
    );
  });
});
