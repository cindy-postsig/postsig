import {
  baseContractTypeId,
  contractTypes,
  INVOICE_TYPE_IDS,
  isInvoiceType,
  SERVICE_ORDER_TYPE_IDS,
  typeIdInList,
} from '@/app/lib/constants';
import {
  findLinkedContract,
  findContractsWithMatchingProducts,
  saveContractLineage,
  fetchContract,
  type ContractRelationshipType,
} from '@/data/superuser/contracts';
import { expandVendorLineageIds } from '@/data/superuser/vendors';
import { isHierarchyEdge } from '@/lib/contracts/relationshipEdges';
import { sendContractLineageEmail } from '@/app/lib/emails/contract-lineage';
import _ from 'lodash';
import { createClient } from '@/utils/supabase/service_server';
import { getAllOrgUsers } from '@/data/users';
import { PostgrestError } from '@supabase/supabase-js';
import { logAlert } from '@/utils/logging/alert';
import logger from '@/utils/pino';

/**
 * Types an invoice may hang off. Includes Exchange Agreement Service Orders, so
 * an Exchange Agreement Invoice can find its parent and produce discrepancies.
 */
const INVOICE_PARENT_TYPE_IDS: number[] = [
  contractTypes.MSA,
  ...SERVICE_ORDER_TYPE_IDS,
  contractTypes.Addendum,
  contractTypes.Operational,
  contractTypes.NDA,
];

export interface ContractLineageStrategyParams {
  contract: any;
  data: any;
  /** Historical vendor id the contract was matched to — stamped onto rows. */
  vendorId: number;
  /** `vendorId` plus every sibling id in its merge lineage — used for lookups. */
  vendorIds: number[];
  organizationId: string;
  contractId: number;
  parent_agreement_type?: string;
  parent_agreement_date?: string;
  parentContractTypeId?: number;
}

export type ContractLineageStrategyFunction = (
  params: ContractLineageStrategyParams,
) => Promise<{
  parent_contract_id?: number;
  child_contract_id?: number;
  contract_relationship_id?: number;
} | void>;

/**
 * Invoice lineage strategy
 * Looks for parent contracts with matching products
 */
const invoiceStrategy: ContractLineageStrategyFunction = async (params) => {
  const { contract, data, vendorId, vendorIds, organizationId, contractId } =
    params;
  const contractProducts = contract?.vendor_products_details || [];

  const productsFromContract = contractProducts.map((detail: any) => ({
    product_id: detail.product_id,
    product_name: detail.vendor_products?.name || '',
  }));

  if (!productsFromContract?.length)
    return {
      parent_contract_id: undefined,
      child_contract_id: undefined,
    };

  const potentialParentContracts = _.filter(
    await findContractsWithMatchingProducts(
      vendorIds,
      organizationId,
      productsFromContract,
      contractId,
      INVOICE_PARENT_TYPE_IDS,
    ),
    (contract) => contract.id !== contractId,
  );

  if (potentialParentContracts.length === 0) return;

  // An invoice can bill against several agreements at once, and taking only
  // `[0]` dropped the rest — the discrepancy report then read the invoice's
  // extra lines as unexpected. Every match is linked now: the first is the one
  // hierarchy parent, and each further match becomes a 'billing' edge naming an
  // additional payer. Ordering is `findContractsWithMatchingProducts`'s, so the
  // hierarchy parent is the same contract the single-match path always chose.
  const [hierarchyParent, ...billingParents] = potentialParentContracts;

  data.parent_contract_id = hierarchyParent.id;
  data.linked_metadata = _.omitBy(
    {
      parent_agreement_type: params.parent_agreement_type,
      parent_agreement_date: params.parent_agreement_date,
      vendor_id: vendorId,
      products: productsFromContract,
    },
    _.isNil,
  );

  const relationshipId = await saveAndNotifyLineage(
    hierarchyParent,
    contractId,
    data.linked_metadata,
    organizationId,
  );

  // Billing edges land inactive like every other new edge, so nothing
  // aggregates or traverses one until a human activates it.
  if (canHaveBillingEdge(contract?.type_id)) {
    for (const billingParent of billingParents) {
      await saveAndNotifyLineage(
        billingParent,
        contractId,
        data.linked_metadata,
        organizationId,
        'billing',
      );
    }
  }

  return {
    parent_contract_id: hierarchyParent.id,
    child_contract_id: contractId,
    contract_relationship_id: relationshipId,
  };
};

/**
 * Gets existing contract relationships from the database
 */
async function getContractRelationships(
  contractId: number,
  vendorIds: number[],
  organizationId: string,
  products_list: any[],
) {
  const supabase = createClient();

  // Hierarchy edges only. `parents[0]` gates the parent-lookup branch and
  // populates `linked_metadata` (parent type/date) in defaultStrategy, so a
  // billing parent here would both suppress the real lookup and stamp the
  // wrong agreement onto the child.
  const {
    data: parentRels,
  }: {
    data: Array<{
      parent_contract_id: number | null;
      parent: {
        id: number;
        type_id: number | null;
        contract_types: { name: string | null } | null;
      } | null;
    }> | null;
    error: PostgrestError | null;
  } = await supabase
    .from('contract_relationships')
    .select(
      `
      parent_contract_id,
      parent:contracts!contract_relationships_parent_contract_id_fkey (
        id, type_id, contract_types(name)
      )
    `,
    )
    .eq('child_contract_id', contractId)
    .is('relationship_type', null)
    .not('disabled', 'is', 'true');

  const {
    data: childRels,
  }: {
    data: Array<{
      child_contract_id: number | null;
      child: {
        id: number;
        type_id: number | null;
        contract_types: { name: string | null } | null;
      } | null;
    }> | null;
    error: PostgrestError | null;
  } = await supabase
    .from('contract_relationships')
    .select(
      `
      child_contract_id,
      child:contracts!contract_relationships_child_contract_id_fkey (
        id, type_id, contract_types(name)
      )
    `,
    )
    .eq('parent_contract_id', contractId)
    .not('disabled', 'is', 'true');

  const relatedInvoices = await findContractsWithMatchingProducts(
    vendorIds,
    organizationId,
    products_list,
    contractId,
    INVOICE_TYPE_IDS,
  );

  const orgUserIds = await getAllOrgUsers(organizationId);
  const potentialChildrenQuery = supabase
    .from('contracts')
    .select(
      `
      id,
      type_id,
      contract_types(name),
      metadata
    `,
    )
    .in('vendor_id', vendorIds)
    .eq('status_id', 4)
    .in('user_id', orgUserIds)
    .not('type_id', 'in', typeIdInList(INVOICE_TYPE_IDS))
    .neq('id', contractId);

  if (childRels && childRels.length > 0) {
    const childIds = childRels.map((rel) => rel.child_contract_id);
    potentialChildrenQuery.not('id', 'in', childIds);
  }

  const {
    data: potentialChildren,
    error: potentialChildrenError,
  }: {
    data: Array<{
      id: number;
      type_id: number | null;
      contract_types: { name: string | null } | null;
      metadata: any;
    }> | null;
    error: PostgrestError | null;
  } = await potentialChildrenQuery;

  if (potentialChildrenError) {
    logger.error(
      { error: potentialChildrenError },
      'Error getting potential children',
    );
    return {
      parents: [],
      children: [],
      invoices: [],
      potentialChildren: [],
    };
  }

  let unlinkedChildren: any[] = [];
  if (potentialChildren && potentialChildren.length > 0) {
    const childIds = potentialChildren.map((child) => child.id);

    // Hierarchy edges only: "already parented" means holding a NULL-type edge.
    // These candidates exclude invoice types upstream, so none can legitimately
    // carry a billing edge today — but reading one as parentage would deny an
    // otherwise-unlinked child its hierarchy parent permanently.
    const {
      data: existingParentRels,
      error: existingParentRelsError,
    }: {
      data: Array<{ child_contract_id: number | null }> | null;
      error: PostgrestError | null;
    } = await supabase
      .from('contract_relationships')
      .select('child_contract_id')
      .in('child_contract_id', childIds)
      .is('relationship_type', null)
      .not('disabled', 'is', 'true');

    if (existingParentRelsError) {
      logger.error(
        { error: existingParentRelsError },
        'Error getting existing parent relationships',
      );
      return {
        parents: [],
        children: [],
        invoices: [],
        potentialChildren: [],
      };
    }

    const contractsWithParents = new Set(
      (existingParentRels || []).map((rel) => rel.child_contract_id),
    );

    unlinkedChildren = potentialChildren.filter(
      (child) => !contractsWithParents.has(child.id),
    );
  }

  return {
    parents: parentRels || [],
    children: childRels || [],
    invoices: relatedInvoices || [],
    potentialChildren: unlinkedChildren || [],
  };
}

/**
 * Default lineage strategy for non-Invoice contract types
 * - Checks for parent contracts based on date and type
 * - Checks for existing child contracts
 * - Checks for related invoices and links them if appropriate
 */
const defaultStrategy: ContractLineageStrategyFunction = async (params) => {
  const {
    contract,
    data,
    vendorId,
    vendorIds,
    organizationId,
    contractId,
    parentContractTypeId,
    parent_agreement_date,
  } = params;

  const contractProducts = contract?.vendor_products_details || [];

  const productsFromContract = contractProducts.map((detail: any) => ({
    product_id: detail.product_id,
    product_name: detail.vendor_products?.name || '',
  }));

  const relationships = await getContractRelationships(
    contractId,
    vendorIds,
    organizationId,
    productsFromContract,
  );

  if (parent_agreement_date && relationships.parents.length === 0) {
    const linkedContract = await findLinkedContract(
      vendorIds,
      organizationId,
      parent_agreement_date,
      contractId,
      parentContractTypeId,
    );

    if (linkedContract) {
      data.parent_contract_id = linkedContract.id;
      data.linked_metadata = {
        type_id: linkedContract.type_id,
        start_date: parent_agreement_date,
        vendor_id: vendorId,
        lineage_phrases: data.lineage_phrases,
      };

      const relationshipId = await saveAndNotifyLineage(
        linkedContract,
        contractId,
        data.linked_metadata,
        organizationId,
      );
      return {
        parent_contract_id: linkedContract.id,
        child_contract_id: contractId,
        contract_relationship_id: relationshipId,
      };
    }
  } else if (relationships.parents.length > 0) {
    const parentRelationship = relationships.parents[0];
    if (parentRelationship && parentRelationship.parent) {
      const parentContract = parentRelationship.parent;
      data.parent_contract_id = parentContract.id;
      data.linked_metadata = {
        type_id: parentContract.type_id,
        vendor_id: vendorId,
        lineage_phrases: data.lineage_phrases,
      };
    }
  }

  if (relationships.invoices.length > 0) {
    const supabase = createClient();

    for (const invoice of relationships.invoices) {
      // `.limit(1).maybeSingle()`, not `.single()`: a child with more than one
      // relationship row (legal at the DB level — the only uniqueness is on the
      // pair — and routine once billing edges exist) made `.single()` return
      // PGRST116 with `data: null`. The error was discarded, so an
      // already-parented invoice read as unparented and got another edge
      // written. Presence, not row count, is the gate here.
      //
      // `relationship_type IS NULL` scopes the gate to hierarchy edges: a
      // billing edge names an *additional* parent, so an invoice carrying only
      // one still needs the hierarchy parent this branch writes. Without the
      // predicate a billing edge would read as parentage and deny it forever.
      const {
        data: existingRelationship,
        error: existingRelationshipError,
      }: {
        data: { id: number } | null;
        error: PostgrestError | null;
      } = await supabase
        .from('contract_relationships')
        .select('id')
        .eq('child_contract_id', invoice.id)
        .is('relationship_type', null)
        .not('disabled', 'is', 'true')
        .limit(1)
        .maybeSingle();

      // Fail closed: a lookup that errored proves nothing about existing
      // parentage, and writing on that assumption is what creates duplicates.
      // Skipping leaves the invoice unlinked, which is the same silent lineage
      // loss the saveContractLineage guardrails alert on — so it alerts too.
      if (existingRelationshipError) {
        logAlert(
          'contract-relationship-invalid',
          existingRelationshipError,
          { invoiceId: invoice.id, parentContractId: contract.id },
          'Skipped invoice lineage: parentage lookup failed',
        );
        continue;
      }

      if (!existingRelationship) {
        const metadata = {
          vendor_id: vendorId,
          type_id: contract.type_id,
          products: productsFromContract,
          lineage_phrases: data.lineage_phrases,
        };

        const relationshipId = await saveAndNotifyLineage(
          contract,
          invoice.id,
          metadata,
          organizationId,
        );
        return {
          parent_contract_id: contract.id,
          child_contract_id: invoice.id,
          contract_relationship_id: relationshipId,
        };
      }
    }
  }

  if (relationships.potentialChildren.length > 0) {
    const childrenWithMatchingData = relationships.potentialChildren.filter(
      (child) => {
        const parentTermStartDateArray = _.get(contract, 'term_start_date');
        const parentStartDate = _.get(parentTermStartDateArray, [
          parentTermStartDateArray?.length - 1,
          'date',
        ]);
        const childParentAgreementDate = _.get(child, [
          'metadata',
          'lineage',
          'parent_agreement_date',
        ]);
        return (
          parentStartDate &&
          childParentAgreementDate &&
          parentStartDate === childParentAgreementDate
        );
      },
    );

    if (childrenWithMatchingData.length > 0) {
      for (const childToLink of childrenWithMatchingData) {
        const childParentAgreementDate = _.get(childToLink, [
          'metadata',
          'lineage',
          'parent_agreement_date',
        ]);
        const metadata = {
          vendor_id: vendorId,
          type_id: contract.type_id,
          start_date: childParentAgreementDate,
          products: productsFromContract,
          lineage_phrases: data.lineage_phrases,
        };
        const relationshipId = await saveAndNotifyLineage(
          contract,
          childToLink.id,
          metadata,
          organizationId,
        );
        return {
          parent_contract_id: contract.id,
          child_contract_id: childToLink.id,
          contract_relationship_id: relationshipId,
        };
      }
    }
  }
};

async function saveAndNotifyLineage(
  parentContract: any,
  childContractId: number,
  metadata: any,
  organizationId: string,
  relationshipType: ContractRelationshipType = null,
): Promise<number | undefined> {
  const relationship = await saveContractLineage(
    parentContract.id,
    childContractId,
    metadata,
    relationshipType,
  );

  if (!relationship) {
    return undefined;
  }

  await sendContractLineageEmail({
    relationshipId: relationship.id,
    parentContract,
    childContractId,
    metadata,
    organizationId,
  });
  return relationship?.id;
}

/**
 * Validates if a parent contract type can have a child contract type
 * Based on contract hierarchy: MSA → SO/Operational/NDA → Amendment/Addendum → Invoice
 */
export function canParentContractType(
  parentTypeId: number,
  childTypeId: number,
): boolean {
  const parentType = baseContractTypeId(parentTypeId);
  const childType = baseContractTypeId(childTypeId);

  if (childType === contractTypes.Invoice) {
    return [
      contractTypes.MSA,
      contractTypes.SO,
      contractTypes.Addendum,
      contractTypes.Operational,
      contractTypes.NDA,
    ].includes(parentType);
  }

  if (childType === contractTypes.Addendum || childType === contractTypes.SO) {
    return [contractTypes.MSA, contractTypes.SO].includes(parentType);
  }

  if (childType === contractTypes.Operational) {
    return parentType === contractTypes.MSA;
  }

  return false;
}

/**
 * Only an invoice may carry a `'billing'` edge — an *additional* parent for
 * billing purposes, on top of the one hierarchy parent every child has.
 *
 * This is the app-side half of the invariant: the DB's CHECK constrains the
 * value to `'billing'`, but nothing there stops a second NULL-type parent or a
 * billing edge on an SO. Non-invoice types have no billing semantics anywhere
 * downstream, so a typed edge on one would be excluded from every tree walk and
 * simply become an invisible row.
 */
export function canHaveBillingEdge(childTypeId: number | null): boolean {
  return childTypeId != null && isInvoiceType(childTypeId);
}

/**
 * Checks if two product lists have any matching products
 */
export function hasMatchingProducts(
  products1: Array<{ product_id: number }>,
  products2: Array<{ product_id: number }>,
): boolean {
  if (!products1?.length || !products2?.length) return false;

  const productIds1 = new Set(products1.map((p) => p.product_id));
  return products2.some((p) => productIds1.has(p.product_id));
}

// TODO: No reparenting for now
/**
 * Handles invoice reparenting when an amendment is added to the hierarchy
 * Searches for invoices linked to the amendment's parent and reparents them
 */
async function handleAmendmentInvoiceReparenting(
  contractId: number,
  contractTypeId: number,
  vendorId: number,
  organizationId: string,
  currentContract: any,
  currentContractProducts: Array<{ product_id: number; product_name: string }>,
): Promise<void> {
  const supabase = createClient();

  const { data: invoicesLinkedToParent } = await supabase
    .from('contract_relationships')
    .select(
      `
      child_contract_id,
      parent_contract_id,
      child:contracts!contract_relationships_child_contract_id_fkey (
        id,
        type_id,
        vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
          id, product_id,
          vendor_products (
            id, name
          )
        )
      )
    `,
    )
    .eq('parent_contract_id', currentContract.id)
    .not('disabled', 'is', 'true');

  if (!invoicesLinkedToParent || invoicesLinkedToParent.length === 0) {
    return;
  }

  const parentContractId = invoicesLinkedToParent[0].parent_contract_id;
  if (!parentContractId) {
    return;
  }

  const { data: parentSiblingInvoices } = await supabase
    .from('contract_relationships')
    .select(
      `
      child_contract_id,
      child:contracts!contract_relationships_child_contract_id_fkey (
        id,
        type_id,
        vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
          id, product_id,
          vendor_products (
            id, name
          )
        )
      )
    `,
    )
    .eq('parent_contract_id', parentContractId)
    .not('disabled', 'is', 'true');

  if (!parentSiblingInvoices || parentSiblingInvoices.length === 0) {
    return;
  }

  for (const rel of parentSiblingInvoices) {
    if (!rel.child || !isInvoiceType(rel.child.type_id)) {
      continue;
    }

    const invoiceProducts = (rel.child.vendor_products_details || []).map(
      (detail: any) => ({
        product_id: detail.vendor_products?.id || detail.product_id,
        product_name: detail.vendor_products?.name || '',
      }),
    );

    if (hasMatchingProducts(currentContractProducts, invoiceProducts)) {
      await supabase
        .from('contract_relationships')
        .update({
          parent_contract_id: contractId,
          metadata: {
            vendor_id: vendorId,
            type_id: contractTypeId,
            retroactive_reparent: true,
            products: currentContractProducts,
            previous_parent: parentContractId,
          } as any,
        })
        .eq('child_contract_id', rel.child.id)
        .eq('parent_contract_id', parentContractId);

      await sendContractLineageEmail({
        relationshipId: rel.child.id,
        parentContract: currentContract,
        childContractId: rel.child.id,
        metadata: {
          vendor_id: vendorId,
          type_id: contractTypeId,
          products: currentContractProducts,
        },
        organizationId,
      });
    }
  }
}

/**
 * Detects and establishes retroactive parent-child relationships
 * Called after a contract is successfully processed to check if it should parent existing contracts
 */
export async function detectRetroactiveChildren(params: {
  contractId: number;
  vendorId: number;
  organizationId: string;
  contractTypeId: number | null;
  startDate: string | null;
  products: Array<{ product_id: number; product_name: string }>;
}): Promise<void> {
  const {
    contractId,
    vendorId,
    organizationId,
    contractTypeId: contractTypeIdParam,
    startDate,
    products,
  } = params;

  if (!contractTypeIdParam) {
    return;
  }

  const contractTypeId: number = contractTypeIdParam;

  const supabase = createClient();
  const orgUserIds = await getAllOrgUsers(organizationId);

  const potentialChildTypeIds: number[] = [];
  const baseTypeId = baseContractTypeId(contractTypeId);
  if (baseTypeId === contractTypes.MSA) {
    potentialChildTypeIds.push(
      ...SERVICE_ORDER_TYPE_IDS,
      contractTypes.Addendum,
      contractTypes.Operational,
      ...INVOICE_TYPE_IDS,
    );
  } else if (baseTypeId === contractTypes.SO) {
    potentialChildTypeIds.push(contractTypes.Addendum, ...INVOICE_TYPE_IDS);
  } else if (baseTypeId === contractTypes.Addendum) {
    potentialChildTypeIds.push(...INVOICE_TYPE_IDS);
  }

  if (potentialChildTypeIds.length === 0) {
    return;
  }

  // Separate entry point from `processContractLineage`, so this is the single
  // expansion for this path — candidates may sit under a merged sibling id.
  // Both entry points run in the same Inngest handler and expand the same
  // vendor, so this duplicates two view queries per contract. Deliberate: they
  // live in independent `step.run` blocks that Inngest memoizes and retries
  // separately, so a shared value would have to cross a step boundary for a
  // saving that is negligible at current volume.
  const vendorIds = await expandVendorLineageIds(vendorId);

  const { data: potentialChildren } = await supabase
    .from('contracts')
    .select(
      `
      id,
      type_id,
      term_start_date,
      metadata,
      contract_types(name),
      vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
        id, product_id,
        vendor_products (
          id, name
        )
      )
    `,
    )
    .in('vendor_id', vendorIds)
    .eq('status_id', 4)
    .in('user_id', orgUserIds)
    .in('type_id', potentialChildTypeIds)
    .neq('id', contractId);

  if (!potentialChildren || potentialChildren.length === 0) {
    return;
  }

  // Disabled edges included deliberately. The UNIQUE (parent, child) row still
  // occupies the pair, so a write for it is swallowed by `ignoreDuplicates` and
  // then trips saveContractLineage's typed-edge guard, which throws. Parentage
  // below is decided on ACTIVE edges only, so a disabled hierarchy edge still
  // leaves the child needing its structural parent.
  const { data: existingChildRels, error: existingChildRelsError } =
    await supabase
      .from('contract_relationships')
      .select(
        'child_contract_id, parent_contract_id, relationship_type, disabled',
      )
      .in(
        'child_contract_id',
        potentialChildren.map((c) => c.id),
      );

  // Fail closed: with this lookup errored both dedupe sets read empty, every
  // candidate looks unlinked, and re-writing an already-linked billing pair
  // throws at saveContractLineage's typed-edge guard.
  if (existingChildRelsError) {
    logAlert(
      'contract-relationship-invalid',
      existingChildRelsError,
      { contractId, vendorId, organizationId },
      'Skipped retroactive linking: existing-relationship lookup failed',
    );
    return;
  }

  const childrenWithParents = new Set(
    (existingChildRels || [])
      .filter((rel) => rel.disabled !== true && isHierarchyEdge(rel))
      .map((rel) => rel.child_contract_id),
  );

  // Pairs already holding a row in either direction, so a re-run neither
  // re-notifies for an existing billing edge nor trips the duplicate guard.
  const linkedPairs = new Set(
    (existingChildRels || []).map(
      (rel) => `${rel.parent_contract_id}:${rel.child_contract_id}`,
    ),
  );

  // An invoice already holding a hierarchy parent stays a candidate: the link
  // this pass would add is a 'billing' edge naming an additional payer, not a
  // competing structural parent. Every other type keeps the original skip —
  // one parent is all they may have.
  //
  // A pair this parent already has a row for is out either way: the write would
  // be a swallowed no-op at best, and a throw for a billing edge.
  const unlinkedChildren = potentialChildren.filter(
    (child) =>
      !linkedPairs.has(`${contractId}:${child.id}`) &&
      (!childrenWithParents.has(child.id) || canHaveBillingEdge(child.type_id)),
  );

  const currentContract = await fetchContract({ id: contractId });
  if (!currentContract) return;

  const currentContractProducts = (
    currentContract?.vendor_products_details || []
  ).map((detail: any) => ({
    product_id: detail.product_id,
    product_name: detail.vendor_products?.name || '',
  }));

  for (const child of unlinkedChildren) {
    let shouldLink = false;
    const childProducts = (child.vendor_products_details || []).map(
      (detail: any) => ({
        product_id: detail.vendor_products?.id || detail.product_id,
        product_name: detail.vendor_products?.name || '',
      }),
    );

    if (isInvoiceType(child.type_id)) {
      shouldLink = hasMatchingProducts(currentContractProducts, childProducts);
    } else {
      const childParentAgreementDate = _.get(child, [
        'metadata',
        'lineage',
        'parent_agreement_date',
      ]);
      const currentTermStartDateArray = _.get(
        currentContract,
        'term_start_date',
      );
      const currentStartDate =
        Array.isArray(currentTermStartDateArray) &&
        currentTermStartDateArray.length > 0
          ? _.get(currentTermStartDateArray, [
              currentTermStartDateArray.length - 1,
              'date',
            ])
          : null;

      if (
        childParentAgreementDate &&
        currentStartDate &&
        childParentAgreementDate === currentStartDate
      ) {
        shouldLink = true;
      } else if (
        child.type_id === contractTypes.Addendum &&
        hasMatchingProducts(currentContractProducts, childProducts)
      ) {
        shouldLink = true;
      }
    }

    if (
      shouldLink &&
      child.type_id &&
      canParentContractType(contractTypeId, child.type_id)
    ) {
      const metadata = {
        vendor_id: vendorId,
        type_id: contractTypeId,
        retroactive: true,
        products: currentContractProducts,
        start_date: startDate,
      };

      // The child kept its hierarchy parent, so this pass is adding the
      // additional payer, not the structural one.
      const relationshipType: ContractRelationshipType =
        childrenWithParents.has(child.id) ? 'billing' : null;

      await saveAndNotifyLineage(
        currentContract,
        child.id,
        metadata,
        organizationId,
        relationshipType,
      );
    }
  }

  // TODO: No reparenting for now
  // if (contractTypeId === contractTypes.Addendum && products.length > 0) {
  //   await handleAmendmentInvoiceReparenting(
  //     contractId,
  //     contractTypeId,
  //     vendorId,
  //     organizationId,
  //     currentContract,
  //     currentContractProducts,
  //   );
  // }
}

export const contractLineageStrategies: Record<
  string,
  ContractLineageStrategyFunction
> = {
  [contractTypes.Invoice]: invoiceStrategy,
  [contractTypes.EAINV]: invoiceStrategy,
  default: defaultStrategy,
};
