import 'server-only';

import { createClient } from '@/utils/supabase/service_server';
import { Database } from '@/database.types';
import { DatabaseError } from '@/lib/errors';
import logger from '@/utils/pino';

type CreditInsert =
  Database['public']['Tables']['contract_product_credits']['Insert'];

export type ContractProductCreditInput = {
  productId: number;
  year: number;
  amount: number;
};

/**
 * Replaces a contract's credit rows with the set just extracted.
 *
 * Delete-then-insert rather than a diff: an invoice may credit the same product
 * on several lines, so a repeat of (product, year) is a distinct row and there
 * is no key to match an old row to a new one. The caller must have established
 * that at least one row will be written -- the delete commits before the insert
 * and nothing here runs in a transaction, so an empty set would clear the
 * contract's credits and put nothing back.
 *
 * The service client bypasses RLS, so both statements filter on
 * organization_id explicitly.
 */
export async function replaceContractProductCredits({
  contractId,
  organizationId,
  userId,
  credits,
}: {
  contractId: number;
  organizationId: string;
  userId: string | null;
  credits: ContractProductCreditInput[];
}) {
  if (credits.length === 0) {
    throw new DatabaseError(
      'replaceContractProductCredits called with no credits to write',
    );
  }

  const supabase = createClient();

  const { error: deleteError } = await supabase
    .from('contract_product_credits')
    .delete()
    .eq('contract_id', contractId)
    .eq('organization_id', organizationId);
  if (deleteError) {
    logger.error(
      { contractId, organizationId, error: deleteError },
      'Failed to clear contract product credits',
    );
    throw new DatabaseError('Failed to clear contract product credits');
  }

  const payload: CreditInsert[] = credits.map((credit, index) => ({
    contract_id: contractId,
    organization_id: organizationId,
    product_id: credit.productId,
    year: credit.year,
    amount: credit.amount,
    sort_order: index,
    created_by: userId,
  }));

  const { data, error } = await supabase
    .from('contract_product_credits')
    .insert(payload)
    .select();
  if (error) {
    logger.error(
      { contractId, organizationId, error },
      'Failed to insert contract product credits',
    );
    throw new DatabaseError('Failed to insert contract product credits');
  }
  return data;
}
