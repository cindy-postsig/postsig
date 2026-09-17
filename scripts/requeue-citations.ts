/**
 * Requeue contracts with null ocr_blocks for citation generation.
 *
 * Usage:
 *   npx tsx scripts/requeue-citations.ts [--dry-run]
 *
 * Requires INNGEST_EVENT_KEY or INNGEST_SIGNING_KEY env vars.
 * Reads from Supabase using service role key.
 */
import { inngest } from '@/utils/inngest/client';
import { createClient } from '@/utils/supabase/service_server';

const CONTRACT_IDS = [1861, 1862, 1863];

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const supabase = createClient();

  // Fetch contract details with their documents
  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select('id, user_id, organization_id, contract_docs(file_path)')
    .in('id', CONTRACT_IDS);

  if (contractsError) {
    console.error('Failed to fetch contracts:', contractsError);
    process.exit(1);
  }

  if (!contracts || contracts.length === 0) {
    console.error('No contracts found');
    process.exit(1);
  }

  console.log(
    `Found ${contracts.length} contracts out of ${CONTRACT_IDS.length} requested`,
  );

  const skipped: number[] = [];
  const events: Array<{
    name: string;
    data: { fileName: string; contractId: number };
    user: { id: string; organizationId: string };
  }> = [];

  for (const contract of contracts) {
    const docs = contract.contract_docs as Array<{
      file_path: string | null;
    }> | null;
    const filePath = docs?.[0]?.file_path;

    if (!filePath || !contract.user_id || !contract.organization_id) {
      skipped.push(contract.id);
      console.warn(
        `Skipping contract ${contract.id}: missing file_path=${filePath}, user_id=${contract.user_id}, org_id=${contract.organization_id}`,
      );
      continue;
    }

    // file_path is "{userId}/{fileName}" — extract just the fileName
    const parts = filePath.split('/');
    const fileName = parts.slice(1).join('/');

    if (!fileName) {
      skipped.push(contract.id);
      console.warn(
        `Skipping contract ${contract.id}: could not extract fileName from ${filePath}`,
      );
      continue;
    }

    events.push({
      name: 'contracts/generatecitations',
      data: {
        fileName,
        contractId: contract.id,
      },
      user: {
        id: contract.user_id,
        organizationId: contract.organization_id,
      },
    });
  }

  console.log(`\nReady to queue: ${events.length} contracts`);
  console.log(
    `Skipped: ${skipped.length} contracts (${skipped.join(', ') || 'none'})`,
  );

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would send the following events:');
    for (const event of events) {
      console.log(
        `  Contract ${event.data.contractId}: fileName=${event.data.fileName}, userId=${event.user.id}`,
      );
    }
    return;
  }

  // Send events in batches of 10 to avoid overwhelming the queue
  const BATCH_SIZE = 10;
  let sent = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    await inngest.send(batch);
    sent += batch.length;
    console.log(
      `Sent batch ${Math.floor(i / BATCH_SIZE) + 1}: ${sent}/${events.length} events`,
    );
  }

  console.log(`\nDone! Queued ${sent} contracts for citation generation.`);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
