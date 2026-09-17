import { inngest } from '../client';
import {
  getActiveConnections,
  getLastSuccessfulSyncAt,
  fetchXeroInvoices,
  fetchXeroInvoiceById,
  fetchRampInvoices,
  fetchRampInvoiceById,
  downloadXeroInvoicePdf,
  downloadRampInvoicePdf,
  getXeroInvoicePdfFileName,
  getRampInvoicePdfFileName,
  getInvoiceStoragePath,
  getInvoiceProcessingState,
  getInvoiceContractsNeedingRepair,
  uploadInvoicePdfToBucket,
  insertInvoiceContractDoc,
  upsertInvoiceAsContract,
  getImportedInvoiceStatusCandidates,
  updateImportedInvoiceExternalStatus,
  linkInvoiceToParentContract,
  findParentContractByVendor,
  resolveVendorId,
  logSyncResult,
} from '@/lib/v2/integrations/invoice-sync/service';
import {
  mapXeroInvoiceToContract,
  mapRampInvoiceToContract,
  getRampExternalInvoiceStatus,
} from '@/lib/v2/integrations/invoice-sync/transforms';
import { ModelProvider } from '@/constants/types';
import logger from '@/utils/pino';
import type {
  NangoProvider,
  XeroInvoice,
  RampInvoice,
} from '@/lib/v2/integrations/invoice-sync/types';

const syncExternalInvoices = inngest.createFunction(
  {
    id: 'sync-external-invoices',
    concurrency: 1,
    retries: 3,
  },
  [{ event: 'integrations/sync-invoices' }, { cron: '0 */2 * * *' }],
  async ({ event, step, logger: inngestLogger }) => {
    const startedAt = new Date();
    const integrationConnectionId = (event.data as any)?.integrationConnectionId
      ? String((event.data as any).integrationConnectionId)
      : undefined;

    const connections = await step.run(
      integrationConnectionId
        ? `get-active-connection-${integrationConnectionId}`
        : 'get-active-connections',
      async () => {
        return getActiveConnections({
          integrationConnectionId,
          includeDisabled: Boolean(integrationConnectionId),
        });
      },
    );

    inngestLogger.info(
      { count: connections.length, integrationConnectionId },
      'Syncing invoices for active connections',
    );

    for (const connection of connections) {
      const {
        id: integration_connection_id,
        organization_id,
        user_id,
        provider,
        nango_connection_id,
        import_new_invoices,
        track_unpaid_invoices,
      } = connection;
      const log = logger.child({
        provider,
        organization_id,
        user_id,
        integration_connection_id,
      });
      let recordsProcessed = 0;

      try {
        if (import_new_invoices === false) {
          log.info('Skipping sync — import_new_invoices disabled');
          continue;
        }

        const lastSyncAt = await step.run(
          `get-last-sync-${provider}-${integration_connection_id}`,
          async () => {
            return getLastSuccessfulSyncAt(integration_connection_id);
          },
        );

        const invoices = await step.run(
          `fetch-invoices-${provider}-${integration_connection_id}`,
          async () => {
            if (provider === 'xero') {
              return fetchXeroInvoices(
                nango_connection_id,
                lastSyncAt ?? undefined,
              );
            }
            return fetchRampInvoices(
              nango_connection_id,
              lastSyncAt ?? undefined,
            );
          },
        );

        log.info({ count: invoices.length }, 'Invoices fetched from provider');

        const processedExternalIds = new Set<string>();

        for (let i = 0; i < invoices.length; i++) {
          const invoice = invoices[i];
          const externalId =
            provider === 'xero'
              ? (invoice as XeroInvoice).InvoiceID
              : (invoice as RampInvoice).id;
          const invoiceNumber =
            provider === 'xero'
              ? (invoice as XeroInvoice).InvoiceNumber
              : (invoice as RampInvoice).invoice_number;
          const fileName =
            provider === 'xero'
              ? getXeroInvoicePdfFileName(externalId)
              : getRampInvoicePdfFileName(externalId, invoiceNumber);
          const filePath = getInvoiceStoragePath(user_id, fileName);
          processedExternalIds.add(externalId);

          const mapped =
            provider === 'xero'
              ? mapXeroInvoiceToContract(invoice as XeroInvoice)
              : mapRampInvoiceToContract(invoice as RampInvoice);

          const result = await step.run(
            `upsert-invoice-${provider}-${integration_connection_id}-${externalId}`,
            async () => {
              return upsertInvoiceAsContract(
                mapped,
                organization_id,
                user_id,
                integration_connection_id,
              );
            },
          );

          if (!result) continue;
          recordsProcessed++;

          const processingState = await step.run(
            `get-processing-state-${provider}-${integration_connection_id}-${externalId}`,
            async () => {
              return getInvoiceProcessingState(result.contractId, filePath);
            },
          );

          let hasContractDoc = processingState.hasContractDoc;

          if (!hasContractDoc) {
            // Rate limiting: add 1s pause between Xero PDF downloads (60 req/min limit)
            if (provider === 'xero' && i > 0) {
              await step.sleep(
                `xero-rate-limit-${integration_connection_id}-${externalId}`,
                '1s',
              );
            }

            // Download PDF and upload to bucket in a single step to avoid Buffer serialization
            const uploadResult = await step.run(
              `download-upload-pdf-${provider}-${integration_connection_id}-${externalId}`,
              async () => {
                const pdfResult =
                  provider === 'xero'
                    ? await downloadXeroInvoicePdf(
                        nango_connection_id,
                        externalId,
                      )
                    : await downloadRampInvoicePdf(
                        nango_connection_id,
                        externalId,
                        invoiceNumber,
                      );

                if (!pdfResult) return null;

                return uploadInvoicePdfToBucket(
                  pdfResult.data,
                  user_id,
                  pdfResult.fileName,
                );
              },
            );

            if (!uploadResult) {
              log.error(
                { externalId, provider, contractId: result.contractId },
                'Failed to download invoice PDF — invoice contract will be repaired on a future sync',
              );
              continue;
            }

            await step.run(
              `insert-contract-doc-${provider}-${integration_connection_id}-${externalId}`,
              async () => {
                await insertInvoiceContractDoc(
                  uploadResult.filePath,
                  result.contractId,
                  user_id,
                );
              },
            );

            hasContractDoc = true;
          }

          if (result.isNew) {
            await step.run(
              `link-parent-${provider}-${integration_connection_id}-${externalId}`,
              async () => {
                const vendorId = await resolveVendorId(
                  mapped.vendor_name,
                  organization_id,
                );
                if (!vendorId) return;

                const parentId = await findParentContractByVendor(
                  vendorId,
                  organization_id,
                );
                if (!parentId) return;

                await linkInvoiceToParentContract(
                  result.contractId,
                  parentId,
                  organization_id,
                );
              },
            );
          }

          if (
            hasContractDoc &&
            (result.isNew || processingState.needsExtraction)
          ) {
            await step.sendEvent(
              `trigger-extraction-${provider}-${integration_connection_id}-${externalId}`,
              {
                name: 'integrations/process-invoice-document',
                data: {
                  fileName,
                  modelProvider: ModelProvider.google,
                  contractId: result.contractId,
                },
                user: {
                  id: user_id,
                  organizationId: organization_id,
                },
              },
            );
          }
        }

        const repairCandidates = await step.run(
          `get-repair-candidates-${provider}-${integration_connection_id}`,
          async () => {
            return getInvoiceContractsNeedingRepair(
              integration_connection_id,
              provider as NangoProvider,
            );
          },
        );

        const unprocessedRepairCandidates = repairCandidates.filter(
          (candidate) => !processedExternalIds.has(candidate.externalInvoiceId),
        );

        for (let i = 0; i < unprocessedRepairCandidates.length; i++) {
          const candidate = unprocessedRepairCandidates[i];
          const externalId = candidate.externalInvoiceId;
          let fileName =
            candidate.filePath?.split('/').pop() ??
            (provider === 'xero'
              ? getXeroInvoicePdfFileName(externalId)
              : getRampInvoicePdfFileName(externalId));

          let hasContractDoc = candidate.hasContractDoc;

          if (!hasContractDoc) {
            if (provider === 'xero' && i > 0) {
              await step.sleep(
                `xero-repair-rate-limit-${integration_connection_id}-${externalId}`,
                '1s',
              );
            }

            const uploadResult = await step.run(
              `repair-download-upload-pdf-${provider}-${integration_connection_id}-${externalId}`,
              async () => {
                const pdfResult =
                  provider === 'xero'
                    ? await downloadXeroInvoicePdf(
                        nango_connection_id,
                        externalId,
                      )
                    : await downloadRampInvoicePdf(
                        nango_connection_id,
                        externalId,
                      );

                if (!pdfResult) return null;

                return uploadInvoicePdfToBucket(
                  pdfResult.data,
                  user_id,
                  pdfResult.fileName,
                );
              },
            );

            if (!uploadResult) {
              log.error(
                {
                  externalId,
                  provider,
                  contractId: candidate.contractId,
                },
                'Failed to repair missing invoice PDF',
              );
              continue;
            }

            await step.run(
              `repair-insert-contract-doc-${provider}-${integration_connection_id}-${externalId}`,
              async () => {
                await insertInvoiceContractDoc(
                  uploadResult.filePath,
                  candidate.contractId,
                  user_id,
                );
              },
            );

            hasContractDoc = true;
            fileName = uploadResult.fileName;
          }

          if (hasContractDoc && candidate.needsExtraction) {
            await step.sendEvent(
              `repair-extraction-${provider}-${integration_connection_id}-${externalId}`,
              {
                name: 'integrations/process-invoice-document',
                data: {
                  fileName,
                  modelProvider: ModelProvider.google,
                  contractId: candidate.contractId,
                },
                user: {
                  id: user_id,
                  organizationId: organization_id,
                },
              },
            );
          }
        }

        let statusChangesProcessed = 0;

        if (track_unpaid_invoices !== false) {
          const statusCandidates = await step.run(
            `get-status-candidates-${provider}-${integration_connection_id}`,
            async () => {
              return getImportedInvoiceStatusCandidates(
                integration_connection_id,
                provider as NangoProvider,
              );
            },
          );

          // Deduplicate: skip invoices already processed in the upsert phase
          const deduplicatedStatusCandidates = statusCandidates.filter(
            (candidate) =>
              !processedExternalIds.has(candidate.externalInvoiceId),
          );

          for (let i = 0; i < deduplicatedStatusCandidates.length; i++) {
            const candidate = deduplicatedStatusCandidates[i];

            if (provider === 'xero' && i > 0) {
              await step.sleep(
                `xero-status-rate-limit-${integration_connection_id}-${candidate.externalInvoiceId}`,
                '1s',
              );
            }

            const externalStatusNew = await step.run(
              `fetch-status-${provider}-${integration_connection_id}-${candidate.externalInvoiceId}`,
              async () => {
                if (provider === 'xero') {
                  const invoice = await fetchXeroInvoiceById(
                    nango_connection_id,
                    candidate.externalInvoiceId,
                  );
                  return invoice?.Status ?? null;
                }

                const invoice = await fetchRampInvoiceById(
                  nango_connection_id,
                  candidate.externalInvoiceId,
                );
                return invoice
                  ? (getRampExternalInvoiceStatus(invoice) ?? null)
                  : null;
              },
            );

            if (!externalStatusNew) continue;

            const didUpdate = await step.run(
              `update-status-${provider}-${integration_connection_id}-${candidate.externalInvoiceId}`,
              async () => {
                return updateImportedInvoiceExternalStatus({
                  contractId: candidate.contractId,
                  externalInvoiceId: candidate.externalInvoiceId,
                  externalStatusOld: candidate.externalInvoiceStatus,
                  externalStatusNew,
                  invoiceStatusOld: candidate.invoiceStatus,
                  organizationId: organization_id,
                  userId: user_id,
                  integrationConnectionId: integration_connection_id,
                  provider: provider as NangoProvider,
                  startedAt,
                });
              },
            );

            if (didUpdate) {
              statusChangesProcessed++;
            }
          }

          if (statusChangesProcessed > 0) {
            log.info(
              { count: statusChangesProcessed },
              'Imported invoice external statuses reconciled',
            );
          }
        } // end track_unpaid_invoices guard

        await step.run(
          `log-sync-${provider}-${integration_connection_id}`,
          async () => {
            await logSyncResult({
              organizationId: organization_id,
              userId: user_id,
              integrationConnectionId: integration_connection_id,
              provider: provider as NangoProvider,
              syncType: 'inbound',
              status: 'success',
              recordsProcessed,
              startedAt,
            });
          },
        );
      } catch (error) {
        log.error({ error }, 'Error syncing invoices for connection');
        await step.run(
          `log-sync-error-${provider}-${integration_connection_id}`,
          async () => {
            await logSyncResult({
              organizationId: organization_id,
              userId: user_id,
              integrationConnectionId: integration_connection_id,
              provider: provider as NangoProvider,
              syncType: 'inbound',
              status: 'failed',
              recordsProcessed,
              errorDetails:
                error instanceof Error ? error.message : String(error),
              startedAt,
            });
          },
        );
      }
    }

    return { connectionsProcessed: connections.length };
  },
);

export default syncExternalInvoices;
