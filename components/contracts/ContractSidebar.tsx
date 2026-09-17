'use client';

import React from 'react';
import Link from 'next/link';
import ContractLabel from '@/components/contracts/ContractLabel';
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from '@radix-ui/react-icons';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { normaliseExternalUrl } from '@/app/lib/utils';
import { isInvoiceType } from '@/app/lib/constants';
import {
  collectHiddenArchivedIds,
  collectPathIds,
  orderArchivedLast,
} from '@/lib/contracts/lineageNodes';
import type {
  BillingParent,
  BillingChildInvoice,
} from '@/data/superuser/contracts';
import { contractOwners, ownerSponsorNames } from '@/lib/v2/owners/embed';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';

interface ContractType {
  id?: string | number;
  name: string | undefined;
}

interface VendorProduct {
  id?: number;
  name: string;
}

interface Contract {
  id: string | number;
  contract_types?: ContractType;
  vendor_products_details?: Array<{
    product_id?: number | null;
    vendor_products: VendorProduct;
  }>;
  children?: Contract[];
  contract_owners?: RawContractOwnerRow[] | null;
  tos_urls?: string[];
  // Used for TOS leaf nodes
  externalUrl?: string;
  isTos?: boolean;
  labelOverride?: string;
}

interface ContractItemProps {
  contract: Contract;
  depth: number;
  currentContract: Contract | null;
  isLast?: boolean;
  localAmendmentId?: string;
  isArchived?: boolean;
  removedProductIds?: number[];
}

interface ContractSidebarProps {
  completeHierarchy: Contract | null;
  currentContract: Contract | null;
  allContractsWithLocalIds?: Array<{
    id: string | number;
    localId: string;
    isArchived?: boolean;
  }>;
  /**
   * contractId -> product ids struck by a confirmed cancellation.
   * A plain record, not a Map — this crosses the RSC boundary.
   */
  removedProductsByContract?: Record<string | number, number[]>;
  /**
   * Additional payers of this invoice ('billing' edges). Rendered as
   * a flat section below the tree — a billing parent lives in a different
   * chain and is NOT representable inside `completeHierarchy`.
   */
  billingParents?: BillingParent[];
  /**
   * billing parent id -> invoices it pays for ('billing' edges), rendered as
   * leaf rows under that parent. Synthetic rows, deliberately NOT part of
   * `completeHierarchy` or `allContractsWithLocalIds` — joining either would
   * renumber localIds and feed foreign invoices into the strike chain. A plain
   * record, not a Map — this crosses the RSC boundary.
   */
  billingChildrenByParent?: Record<string | number, BillingChildInvoice[]>;
}

// Spacing constants for consistent alignment
const LINK_PADDING = 16; // px-2 = 0.5rem = 8px
const ICON_CONNECTOR_WIDTH = 16; // w-4 = 1rem = 16px
const ROW_MIN_PX = 46; // from min-h-[2.5rem]
const LAST_ROW_TRIM = ROW_MIN_PX / 2 + 1;

const ChildrenRail: React.FC<{
  leftPx: number;
  topTrimPx?: number;
  bottomTrimPx?: number;
}> = ({ leftPx, topTrimPx = 0, bottomTrimPx = 0 }) => (
  <div
    className="pointer-events-none absolute"
    style={{
      left: leftPx,
      top: topTrimPx,
      bottom: bottomTrimPx,
    }}
  >
    <div className="h-full w-px bg-muted-foreground/40" />
  </div>
);

const ElbowIcon: React.FC = () => (
  <div className="relative flex h-[43px] w-4 items-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="absolute left-0 h-full w-full text-muted-foreground/40"
      fill="none"
      viewBox="0 0 16 100"
      stroke="currentColor"
      strokeWidth={1}
      shapeRendering="crispEdges"
      preserveAspectRatio="none"
    >
      <>
        {/* Horizontal line to item */}
        <path d="M2 50 L12 50" vectorEffect="non-scaling-stroke" />
      </>
    </svg>
  </div>
);

const ChildrenContainer: React.FC<{
  leftPx: number;
  children: React.ReactNode;
}> = ({ leftPx, children }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [bottomTrim, setBottomTrim] = React.useState(LAST_ROW_TRIM);

  React.useLayoutEffect(() => {
    const calculateTrim = () => {
      if (containerRef.current) {
        const container = containerRef.current;

        // Filter to only direct contract items (have data-contract-depth)
        // Exclude: ChildrenRail and nested ChildrenContainers (no data attribute)
        const childElements = Array.from(container.children).filter((el) =>
          el.hasAttribute('data-contract-depth'),
        ) as HTMLElement[];

        if (childElements.length === 0) return;

        // Get the depth of the first child - this is the depth of direct siblings
        const firstChildDepth = parseInt(
          childElements[0].getAttribute('data-contract-depth') || '0',
        );

        // Find the last child at this same depth (ignore deeper nested descendants)
        let lastSiblingIndex = -1;
        for (let i = childElements.length - 1; i >= 0; i--) {
          const depth = parseInt(
            childElements[i].getAttribute('data-contract-depth') || '0',
          );
          if (depth === firstChildDepth) {
            lastSiblingIndex = i;
            break;
          }
        }

        if (lastSiblingIndex === -1) return;

        const lastSibling = childElements[lastSiblingIndex];

        // Get height of ONLY the last sibling's first row (not its descendants)
        const firstRow = lastSibling.firstElementChild as HTMLElement;
        const lastSiblingRowHeight = firstRow?.offsetHeight ?? ROW_MIN_PX;

        // Calculate height to subtract: all elements after the last sibling
        let heightToSubtract = 0;
        for (let i = lastSiblingIndex + 1; i < childElements.length; i++) {
          heightToSubtract += childElements[i].offsetHeight;
        }

        // Also add any nested ChildrenContainers after the last sibling
        const allChildren = Array.from(container.children) as HTMLElement[];
        const lastSiblingDomIndex = allChildren.indexOf(lastSibling);
        for (let i = lastSiblingDomIndex + 1; i < allChildren.length; i++) {
          const child = allChildren[i];
          if (
            !child.hasAttribute('data-contract-depth') &&
            !child.classList.contains('pointer-events-none')
          ) {
            heightToSubtract += child.offsetHeight;
          }
        }

        // Use the old bottom-trim logic which worked perfectly
        // Adjust trim based on actual last sibling row height + height to subtract
        const heightDiff = lastSiblingRowHeight - ROW_MIN_PX;
        const adjustedTrim = LAST_ROW_TRIM + heightDiff + heightToSubtract;

        setBottomTrim(adjustedTrim);
      }
    };

    calculateTrim();

    // Set up ResizeObserver to recalculate on size changes
    const resizeObserver = new ResizeObserver(calculateTrim);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div ref={containerRef} className="relative">
      <ChildrenRail leftPx={leftPx} bottomTrimPx={bottomTrim} />
      {children}
    </div>
  );
};

const getProductInfo = (contract: Contract, removedIds?: number[]) => {
  const products = contract.vendor_products_details || [];
  if (products.length === 0) return null;
  const firstProduct = products[0].vendor_products.name;
  const firstProductId =
    products[0].vendor_products.id ?? products[0].product_id;
  // Mark cancelled, never omit — mirrors the products table on the same page.
  // Invoice rows are exempt: an invoice is never itself cancelled, only the
  // agreement commanding it is, so billing that already happened stays valid.
  // A cancelled service order in the same hierarchy still renders struck.
  const typeId = Number(contract.contract_types?.id);
  const isInvoiceRow = Number.isFinite(typeId) && isInvoiceType(typeId);
  const isCancelled =
    !isInvoiceRow &&
    typeof firstProductId === 'number' &&
    (removedIds?.includes(firstProductId) ?? false);
  const nameClass = isCancelled ? 'line-through opacity-60' : '';
  if (products.length === 1)
    return <span className={`leading-tight ${nameClass}`}>{firstProduct}</span>;
  return (
    <div className="leading-tight">
      <span className={nameClass}>{firstProduct}</span>
      <span className="ml-1 inline-block text-xs text-muted-foreground">
        +{products.length - 1}
      </span>
    </div>
  );
};

const ROW_CONTENT_CLASSES =
  'my-[3px] flex flex-grow items-center gap-1.5 rounded-sm px-2 py-2 font-label text-sm leading-5 text-muted-foreground';

/**
 * Shared row frame: the elbow connector plus the fixed-height track every row
 * sits in. `data-contract-depth` is what ChildrenContainer measures to trim the
 * vertical rail, so every row rendered inside a container must use this.
 */
const RowShell: React.FC<{ depth: number; children: React.ReactNode }> = ({
  depth,
  children,
}) => {
  // Calculate the offset for nested icons to align with parent badges
  // For depth 1: icon should align with root badge (at 8px), so icon needs 8px offset
  // For depth 2+: icon should align with immediate parent's badge
  // Parent's badge is at: (parent's icon width 16px) + (parent's link padding 8px) = 24px from parent start
  const iconOffset =
    depth > 0
      ? (depth - 1) * (ICON_CONNECTOR_WIDTH + LINK_PADDING) + LINK_PADDING
      : 0;

  return (
    <div className="flex flex-col" data-contract-depth={depth}>
      <div className="flex min-h-[2.5rem] items-stretch">
        {depth > 0 && (
          <div
            className="flex items-stretch"
            style={{ paddingLeft: `${iconOffset + 1}px` }}
          >
            <ElbowIcon />
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

const ContractItem: React.FC<ContractItemProps> = ({
  contract,
  depth = 0,
  currentContract,
  localAmendmentId,
  isArchived = false,
  removedProductIds,
}) => {
  const isActive =
    parseInt(contract.id.toString(), 10) ===
    parseInt(currentContract?.id?.toString() || '0', 10);

  const externalUrl = contract.externalUrl
    ? normaliseExternalUrl(contract.externalUrl)
    : null;

  const href = externalUrl ?? `/contracts/${contract.id}`;
  const isExternal = !!externalUrl;

  return (
    <RowShell depth={depth}>
      <Link
        href={href}
        {...(isExternal
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
        className={`${ROW_CONTENT_CLASSES} ${
          isActive ? 'bg-primary/7' : 'hover:bg-hover'
        } ${isArchived && !isActive ? 'opacity-60' : ''}`}
      >
        <div className="flex h-full flex-shrink-0 items-start">
          {contract.isTos ? (
            <Badge
              variant="outline"
              className="flex-shrink-0 px-2 text-[0.7rem] leading-tight"
            >
              {contract.labelOverride ?? 'TOS'}
            </Badge>
          ) : localAmendmentId ? (
            <Badge
              variant={isActive ? 'default' : 'outline'}
              className="flex-shrink-0 px-2 text-[0.7rem] leading-tight"
            >
              {localAmendmentId}
            </Badge>
          ) : (
            <ContractLabel
              name={contract.contract_types?.name}
              shorten={true}
            />
          )}
        </div>
        <div className="line-clamp-2 flex-grow leading-tight hover:line-clamp-none">
          {contract.isTos ? (
            <span className="inline-flex items-center gap-1">
              Terms of Service
              <ExternalLinkIcon className="inline h-3 w-3" />
            </span>
          ) : (
            getProductInfo(contract, removedProductIds) ||
            contract.contract_types?.name ||
            'N/A'
          )}
        </div>
        {isArchived && (
          <Badge
            variant="destructive"
            size="xs"
            className="mt-px flex-shrink-0 self-start"
          >
            Archived
          </Badge>
        )}
      </Link>
    </RowShell>
  );
};

/**
 * A contract's TOS links collapse into one row — a contract can carry a handful
 * of identical-looking "Terms of Service" links, and repeated across every
 * invoice in a chain they drowned out the contracts themselves.
 */
const TosGroup: React.FC<{
  contractId: string | number;
  urls: string[];
  depth: number;
}> = ({ contractId, urls, depth }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const childRailLeft =
    depth * (ICON_CONNECTOR_WIDTH + LINK_PADDING) + LINK_PADDING + 2;

  return (
    <>
      <RowShell depth={depth}>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className={`${ROW_CONTENT_CLASSES} text-left hover:bg-hover`}
        >
          <div className="flex h-full flex-shrink-0 items-start">
            <Badge
              variant="outline"
              className="flex-shrink-0 px-2 text-[0.7rem] leading-tight"
            >
              TOS
            </Badge>
          </div>
          <div className="flex-grow leading-tight">
            Terms of Service ({urls.length})
          </div>
          {isOpen ? (
            <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
          )}
        </button>
      </RowShell>
      {isOpen && (
        <ChildrenContainer leftPx={childRailLeft}>
          {urls.map((url, index) => (
            <ContractItem
              key={`tos-${contractId}-${index}`}
              contract={{
                id: `tos-${contractId}-${index}`,
                externalUrl: url,
                isTos: true,
                labelOverride: `TOS-${index + 1}`,
              }}
              depth={depth + 1}
              currentContract={null}
            />
          ))}
        </ChildrenContainer>
      )}
    </>
  );
};

/**
 * A billing-linked invoice as a leaf row under its billing parent. Renders
 * through ContractItem like any child (plain node by design) — with no
 * localAmendmentId it falls back to the bare type badge, so it never joins
 * the tree's localId numbering.
 */
const BillingChildItem: React.FC<{
  invoice: BillingChildInvoice;
  depth: number;
  currentContract: Contract | null;
}> = ({ invoice, depth, currentContract }) => (
  <ContractItem
    contract={{
      id: invoice.id,
      contract_types: { name: invoice.typeName ?? undefined },
      vendor_products_details: invoice.productNames.map((name) => ({
        vendor_products: { name },
      })),
    }}
    depth={depth}
    currentContract={currentContract}
    isArchived={invoice.isArchived}
  />
);

const BillingParentRow: React.FC<{ parent: BillingParent }> = ({ parent }) => {
  const text = parent.productNames[0] ?? parent.typeName ?? 'N/A';
  const extraCount = parent.productNames.length - 1;
  const dimmed = parent.isArchived ? 'opacity-60' : '';

  return (
    <Link
      href={`/contracts/${parent.id}`}
      className={`${ROW_CONTENT_CLASSES} hover:bg-hover ${dimmed}`}
    >
      <div className="flex h-full flex-shrink-0 items-start">
        <ContractLabel name={parent.typeName ?? undefined} shorten={true} />
      </div>
      <div className="line-clamp-2 flex-grow leading-tight hover:line-clamp-none">
        {text}
        {extraCount > 0 && (
          <span className="ml-1 inline-block text-xs text-muted-foreground">
            +{extraCount}
          </span>
        )}
      </div>
    </Link>
  );
};

/**
 * The invoice's additional payers, flat by design: billing parents are
 * independent agreements from other chains, so rows carry no rail, no elbow
 * and — load-bearing — no `data-contract-depth`, which would draft them into
 * ChildrenContainer's rail-trim measurement.
 */
const BillingParentsSection: React.FC<{ parents: BillingParent[] }> = ({
  parents,
}) => (
  <div data-testid="billing-parents" className="mt-4">
    <div className="my-2 flex items-center pl-2">
      <span className="font-bold truncate font-label text-xs uppercase tracking-wide text-foreground/50">
        Also billed under
      </span>
    </div>
    {parents.map((parent) => (
      <BillingParentRow key={parent.id} parent={parent} />
    ))}
  </div>
);

const ContractSidebar: React.FC<ContractSidebarProps> = ({
  completeHierarchy,
  currentContract,
  allContractsWithLocalIds = [],
  removedProductsByContract,
  billingParents = [],
  billingChildrenByParent,
}) => {
  const [showArchived, setShowArchived] = React.useState(false);

  const sponsorNames = currentContract
    ? ownerSponsorNames(contractOwners(currentContract))
    : [];

  const metaById = React.useMemo(() => {
    const map = new Map<string, { localId: string; isArchived: boolean }>();
    allContractsWithLocalIds.forEach((c) =>
      map.set(c.id.toString(), {
        localId: c.localId,
        isArchived: Boolean(c.isArchived),
      }),
    );
    return map;
  }, [allContractsWithLocalIds]);

  const isArchived = React.useCallback(
    (nodeId: string) => metaById.get(nodeId)?.isArchived ?? false,
    [metaById],
  );

  // Archived subtrees are folded away by default, except along the path to the
  // contract being viewed — that row must never disappear from its own page.
  const hiddenIds = React.useMemo(
    () =>
      collectHiddenArchivedIds(
        completeHierarchy,
        isArchived,
        collectPathIds(completeHierarchy, currentContract?.id),
      ),
    [completeHierarchy, currentContract?.id, isArchived],
  );

  const renderHierarchy = (
    contract: Contract | null,
    depth = 0,
  ): React.ReactNode => {
    if (!contract) return null;

    const nodeId = contract.id.toString();
    if (!showArchived && hiddenIds.has(nodeId)) return null;

    const meta = metaById.get(nodeId);
    const tosUrls = contract.tos_urls ?? [];
    const billingChildren = billingChildrenByParent?.[contract.id] ?? [];

    const renderedChildren = orderArchivedLast(
      contract.children ?? [],
      isArchived,
    )
      .map((child) => renderHierarchy(child, depth + 1))
      .filter(Boolean);

    const childRailLeft =
      depth * (ICON_CONNECTOR_WIDTH + LINK_PADDING) + LINK_PADDING + 2;
    const hasContainer =
      renderedChildren.length > 0 ||
      billingChildren.length > 0 ||
      tosUrls.length > 0;

    return (
      <React.Fragment key={contract.id}>
        <ContractItem
          contract={contract}
          depth={depth}
          currentContract={currentContract}
          localAmendmentId={meta?.localId}
          isArchived={meta?.isArchived}
          removedProductIds={removedProductsByContract?.[contract.id]}
        />
        {hasContainer && (
          <ChildrenContainer leftPx={childRailLeft}>
            {renderedChildren}
            {billingChildren.map((invoice) => (
              <BillingChildItem
                key={`billing-${contract.id}-${invoice.id}`}
                invoice={invoice}
                depth={depth + 1}
                currentContract={currentContract}
              />
            ))}
            {tosUrls.length > 0 && (
              <TosGroup
                contractId={contract.id}
                urls={tosUrls}
                depth={depth + 1}
              />
            )}
          </ChildrenContainer>
        )}
      </React.Fragment>
    );
  };

  const hasRelatedContracts = Boolean(
    (completeHierarchy?.tos_urls?.length ?? 0) > 0 ||
    (completeHierarchy?.children?.length ?? 0) > 0 ||
    Object.keys(billingChildrenByParent ?? {}).length > 0 ||
    billingParents.length > 0,
  );

  return (
    <div
      id="contractSidebar"
      className="flex h-full w-full flex-col justify-between bg-background"
    >
      <div className="flex min-w-60 flex-col overflow-y-auto p-2">
        <div className="my-2 flex items-center justify-between gap-2 pl-2">
          <span className="font-bold truncate font-label text-xs uppercase tracking-wide text-foreground/50">
            Related Contracts
          </span>
          {hiddenIds.size > 0 && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setShowArchived((shown) => !shown)}
              aria-expanded={showArchived}
              aria-label={`${
                showArchived ? 'Hide' : 'Show'
              } archived contracts`}
              className="flex-shrink-0 gap-1 px-1.5 font-label text-foreground/70"
            >
              <ArchiveIcon />
              {showArchived ? 'Hide archived' : 'Show archived'}
              <Badge variant="secondary" size="xs">
                {hiddenIds.size}
              </Badge>
            </Button>
          )}
        </div>
        {!hasRelatedContracts ? (
          <span className="px-2 font-label text-sm text-foreground/30">
            No related contracts
          </span>
        ) : (
          renderHierarchy(completeHierarchy)
        )}
        {billingParents.length > 0 && (
          <BillingParentsSection parents={billingParents} />
        )}
      </div>

      <div className="flex flex-shrink-0 p-2 pt-0">
        {sponsorNames.length > 0 && (
          <div className="w-full rounded-sm border-t p-2 pt-4 font-label">
            <div className="font-bold font-label text-xs uppercase tracking-wide text-foreground/50">
              Contract Owner{sponsorNames.length > 1 ? 's' : ''}
            </div>
            <div className="text-md mt-1 font-serif leading-tight">
              {sponsorNames.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractSidebar;
