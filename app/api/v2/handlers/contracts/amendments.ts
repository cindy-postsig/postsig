import { Context } from 'hono';
import { getAmendmentChain } from '@/lib/v2/contracts/amendments';
import { filterHierarchyForInvoicesAccess } from '@/lib/contracts/lineageNodes';
import { isInvoiceType } from '@/app/lib/constants';
import logger from '@/utils/pino';

export async function getAmendmentChainHandler(c: Context) {
  try {
    const userMetadata = c.get('userMetadata');
    const contractId = parseInt(c.req.param('id') ?? '', 10);

    if (isNaN(contractId)) {
      return c.json({ error: 'Invalid contract ID' }, 400);
    }

    const result = await getAmendmentChain(contractId);

    // Invoices that are structural hierarchy children don't belong in this
    // chain at all once the org's Invoices module is off — same gate as the
    // contract detail page's lineage tab and sidebar.
    const invoicesEnabled = userMetadata.cpmInvoicesEnabled === true;
    const {
      hierarchy: completeHierarchy,
      allContracts: allContractsInHierarchy,
    } = filterHierarchyForInvoicesAccess(
      result.completeHierarchy,
      result.allContractsInHierarchy,
      invoicesEnabled,
      contractId,
    );
    const childContracts = invoicesEnabled
      ? result.childContracts
      : result.childContracts.filter(
          (c) => !isInvoiceType(c.type_id as number | null | undefined),
        );
    const filteredResult = {
      ...result,
      completeHierarchy,
      allContractsInHierarchy,
      childContracts,
    };

    logger.info(
      {
        userId: userMetadata.userId,
        contractId,
        hierarchyCount: filteredResult.allContractsInHierarchy.length,
      },
      'Amendment chain fetched',
    );

    return c.json(filteredResult);
  } catch (error) {
    logger.error({ error }, 'Failed to get amendment chain');
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
}
