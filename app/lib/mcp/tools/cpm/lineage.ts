import { z } from 'zod';
import {
  getAmendmentChain,
  type AmendmentContract,
  type ContractHierarchy,
} from '@/lib/v2';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { requireMcpContext } from '@/app/lib/mcp/context';
import {
  contractsToChainContracts,
  type ContractRowInput,
} from '@/lib/contracts/productLineageResolution';
import { resolveRemovedProductsForContracts } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { filterHierarchyForInvoicesAccess } from '@/lib/contracts/lineageNodes';
import { hasInvoicesAccess } from '@/lib/v2/invoices/access';
import { isInvoiceType } from '@/app/lib/constants';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

interface NarratedContract {
  id: number;
  localId: string;
  name: string | null;
  contract_type: string | null;
  vendor: {
    id: number | null;
    name: string | null;
    domain: string | null;
  } | null;
  term_start_date: string | null;
  term_end_date: string | null;
  /** Full product list for this contract, ordered by sort_order. */
  products: string[];
  /**
   * Products above that a confirmed later-chain declaration cancelled
   * (PSK-1830). Still present in `products` — mentioned, never omitted.
   */
  cancelledProducts: string[];
}

interface SimpleTreeNode {
  id: number;
  localId?: string;
  children: SimpleTreeNode[];
}

function narrate(
  c: AmendmentContract,
  removedProductIds?: Set<number>,
): NarratedContract {
  const ct = c.contract_types as { name?: string } | undefined | null;
  const v = c.vendors as
    | { id?: number | null; name?: string | null; domain?: string | null }
    | undefined
    | null;
  const termStart = c.term_start_date as
    | Array<{ date?: string }>
    | undefined
    | null;
  const termEnd = c.term_end_date as
    | Array<{ date?: string }>
    | undefined
    | null;
  const productDetails = c.vendor_products_details as
    | Array<{
        product_id?: number | null;
        vendor_products?: { id?: number; name?: string } | null;
        sort_order?: number | null;
      }>
    | undefined
    | null;
  const sortedDetails = [...(productDetails ?? [])].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
  const productNames = sortedDetails
    .map((d) => d.vendor_products?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
  const uniqueProducts = Array.from(new Set(productNames));
  // Resolve ids -> cancelled flags BEFORE the name dedupe above collapses
  // duplicate names, so one cancelled instance cannot hide behind a
  // same-named survivor.
  const cancelledNames = sortedDetails
    .filter((d) => {
      const id = d.vendor_products?.id ?? d.product_id;
      return typeof id === 'number' && removedProductIds?.has(id) === true;
    })
    .map((d) => d.vendor_products?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
  const uniqueCancelled = Array.from(new Set(cancelledNames));

  return {
    id: c.id,
    localId: c.localId,
    name: (c.contract_name as string | null | undefined) ?? null,
    contract_type: ct?.name ?? null,
    vendor: v
      ? { id: v.id ?? null, name: v.name ?? null, domain: v.domain ?? null }
      : null,
    term_start_date: termStart?.[0]?.date ?? null,
    term_end_date: termEnd?.[0]?.date ?? null,
    products: uniqueProducts,
    cancelledProducts: uniqueCancelled,
  };
}

function simplifyTree(
  node: ContractHierarchy | null,
  localIds: Map<number, string>,
): SimpleTreeNode | null {
  if (!node) return null;
  return {
    id: node.id,
    localId: localIds.get(node.id),
    children: (node.children ?? [])
      .map((child) => simplifyTree(child, localIds))
      .filter((n): n is SimpleTreeNode => n !== null),
  };
}

/**
 * Build a plain-text ASCII fallback tree for clients that can't render the
 * structured `tree`/`flat` data. Rich clients (Claude Desktop on a paid plan)
 * should prefer the structured fields. Plain ASCII only — no emoji or markdown
 * — so it survives any client that does end up quoting it verbatim.
 */
function renderAsciiTree(
  node: ContractHierarchy | null,
  byId: Map<number, NarratedContract>,
  prefix = '',
  isLast = true,
  isRoot = true,
): string {
  if (!node) return '';
  const meta = byId.get(node.id);
  let label: string;
  if (!meta) {
    label = `#${node.id}`;
  } else {
    const head = meta.localId || `#${meta.id}`;
    const title = meta.name ?? meta.contract_type ?? null;
    let productPart: string | null = null;
    if (meta.products.length === 1) {
      productPart = meta.products[0];
    } else if (meta.products.length > 1) {
      const remaining = meta.products.length - 1;
      productPart = `${meta.products[0]} +${remaining} ${remaining === 1 ? 'product' : 'products'}`;
    }
    if (productPart && meta.cancelledProducts.length > 0) {
      productPart += ` (${meta.cancelledProducts.length} cancelled)`;
    }
    const body = [title, productPart].filter(Boolean).join(' · ') || 'unnamed';
    const dates =
      meta.term_start_date || meta.term_end_date
        ? ` (${meta.term_start_date ?? '?'} → ${meta.term_end_date ?? '?'})`
        : '';
    label = `${head} — ${body}${dates}`;
  }

  const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
  let out = `${prefix}${connector}${label}\n`;

  const children = node.children ?? [];
  const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
  children.forEach((child, i) => {
    out += renderAsciiTree(
      child,
      byId,
      childPrefix,
      i === children.length - 1,
      false,
    );
  });
  return out;
}

const input = z.object({
  id: z
    .number()
    .int()
    .describe('Contract id to fetch the amendment chain for.'),
});

async function getContractLineage(payload: z.infer<typeof input>) {
  const [chain, invoicesEnabled] = await Promise.all([
    getAmendmentChain(payload.id),
    hasInvoicesAccess(),
  ]);
  if (!chain.currentContract) {
    return { found: false as const };
  }

  // Defense in depth: every node in the chain must belong to the user's org.
  assertSameOrg(
    chain.allContractsInHierarchy,
    'get_contract_lineage',
    (c) =>
      (c as { organization_id?: string | null | undefined }).organization_id,
  );

  // Invoices that are structural hierarchy children don't belong in this
  // chain at all once the org's Invoices module is off — same gate as the
  // contract detail page's lineage tab and sidebar.
  const {
    hierarchy: completeHierarchy,
    allContracts: allContractsInHierarchy,
  } = filterHierarchyForInvoicesAccess(
    chain.completeHierarchy,
    chain.allContractsInHierarchy,
    invoicesEnabled,
    payload.id,
  );
  const childContracts = invoicesEnabled
    ? chain.childContracts
    : chain.childContracts.filter(
        (c) => !isInvoiceType(c.type_id as number | null | undefined),
      );

  // Confirmed cancellation declarations across this chain (PSK-1830).
  // getAmendmentChain returns one hierarchy, so the single-chain resolver is
  // correct here. Degrades to an empty map on failure — the chain still
  // narrates, just without cancellation mentions.
  const { userMetadata } = requireMcpContext();
  const removedByContract = await resolveRemovedProductsForContracts({
    organizationId: userMetadata.organizationId,
    chainContracts: contractsToChainContracts(
      allContractsInHierarchy as unknown as ContractRowInput[],
    ),
  });

  const localIds = new Map<number, string>();
  const narratedById = new Map<number, NarratedContract>();
  for (const c of allContractsInHierarchy) {
    if (c.localId) localIds.set(c.id, c.localId);
    narratedById.set(c.id, narrate(c, removedByContract.get(c.id)));
  }

  const treeAscii = completeHierarchy
    ? renderAsciiTree(completeHierarchy, narratedById)
    : '';

  const withRemovals = (c: AmendmentContract) =>
    narrate(c, removedByContract.get(c.id));

  return {
    found: true as const,
    current: withRemovals(chain.currentContract),
    parent: chain.parentContract ? withRemovals(chain.parentContract) : null,
    children: childContracts.map(withRemovals),
    tree: simplifyTree(completeHierarchy, localIds),
    flat: allContractsInHierarchy.map(withRemovals),
    // Plain-text fallback for text-only clients. Rich clients should render
    // from `tree` / `flat` instead.
    treeAscii,
  };
}

export const lineageTools: McpToolDef[] = [
  {
    name: 'get_contract_lineage',
    description:
      "Tell the story of a contract's amendment chain. " +
      'Returns the parent contract (if any), the contract itself, its direct child amendments, and the full hierarchy tree — every node tagged with a human-readable local id like "MSA-1" or "ADD-2" so analysts can talk about "the second addendum" instead of bare contract ids. ' +
      'Output formats: `tree` (nested) and `flat` (array) hold the structured data — prefer these so the client can render hierarchy cards, tables, or diagrams natively. `treeAscii` is a pre-rendered plain-text fallback for text-only clients; only quote it (in a code fence) if structured rendering is unavailable. ' +
      "Use this when the user asks about a contract's history, its addenda, or where it sits in a chain. " +
      'Products cancelled by a later addendum in the chain remain listed in `products` and are ALSO named in `cancelledProducts` — treat those as no longer licensed, not as active inventory. ' +
      'For per-product supersession details (which fees got amended away), call get_contract on individual nodes.',
    inputSchema: input,
    annotations: {
      title: 'Contract lineage',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getContractLineage as McpToolDef['handler'],
  },
];
