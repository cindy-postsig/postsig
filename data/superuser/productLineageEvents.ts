import 'server-only';

import { createClient } from '@/utils/supabase/service_server';
import { Database, Json } from '@/database.types';
import logger from '@/utils/pino';

export type ProductLineageEvent =
  Database['public']['Tables']['vendor_product_lineage_events']['Row'];

/**
 * The columns the lineage view actually resolves against. Selecting only these
 * keeps `evidence` — which holds verbatim contract quotes — out of the payload
 * serialized into the client component.
 */
export type ConfirmedProductLineageEvent = Pick<
  ProductLineageEvent,
  'contract_id' | 'product_id' | 'action' | 'status'
>;

export type ProductLineageAction = 'replace_all_prior' | 'cancel_product';

const DUPLICATE_KEY = '23505';

/**
 * Record a contract's declaration that earlier chain products are cancelled.
 *
 * Always writes status 'pending': nothing affects the lineage view until a
 * human confirms it. Extraction runs under Inngest, which retries steps, so
 * this must be safe to call repeatedly for the same declaration.
 *
 * Idempotency leans on the `vendor_product_lineage_events_dedupe` partial unique
 * index. Supabase's `upsert({ onConflict })` cannot target a *partial* index,
 * so this inserts and treats 23505 as success — the same catch-and-continue
 * idiom used for contract/folder access grants elsewhere in this directory.
 * Rejected rows sit outside the index, so ops rejecting an AI event still
 * leaves a re-extraction free to raise a fresh one.
 */
export async function createPendingProductLineageEvent({
  contractId,
  organizationId,
  action,
  productId = null,
  evidence = null,
  createdBy = null,
  source = 'ai',
}: {
  contractId: number;
  organizationId: string;
  action: ProductLineageAction;
  productId?: number | null;
  evidence?: Json | null;
  createdBy?: string | null;
  source?: 'ai' | 'human';
}): Promise<{ created: boolean }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('vendor_product_lineage_events')
    .insert({
      contract_id: contractId,
      organization_id: organizationId,
      action,
      // The DB check constraint pins these together: blanket replacements name no
      // product, per-product cancellations must.
      product_id: action === 'replace_all_prior' ? null : productId,
      source,
      status: 'pending',
      evidence,
      created_by: createdBy,
    });

  if (error) {
    if (error.code === DUPLICATE_KEY) {
      logger.info(
        { contractId, action, productId },
        'Product lineage event already exists',
      );
      return { created: false };
    }
    throw error;
  }

  return { created: true };
}

/**
 * Confirmed events for a set of contracts, used to resolve which products the
 * lineage view should strike. Pending and rejected events are deliberately
 * excluded: an unconfirmed AI declaration must not change what a user sees.
 */
export async function fetchConfirmedEventsForContracts({
  contractIds,
  organizationId,
}: {
  contractIds: number[];
  organizationId: string;
}): Promise<ConfirmedProductLineageEvent[]> {
  if (contractIds.length === 0) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from('vendor_product_lineage_events')
    .select('contract_id, product_id, action, status')
    .in('contract_id', contractIds)
    .eq('organization_id', organizationId)
    .eq('status', 'confirmed');

  if (error) throw error;

  return data ?? [];
}
