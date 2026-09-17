import { inngest } from '../client';
import { NonRetriableError } from 'inngest';
import {
  getDocuSignActiveConnections,
  getLastDocuSignSyncAt,
  fetchDocuSignEnvelopes,
  fetchDocuSignEnvelopeDocumentList,
  downloadDocuSignDocument,
  getDocuSignDocFileName,
  getDocuSignStoragePath,
  getDocuSignProcessingState,
  uploadDocuSignPdfToBucket,
  insertDocuSignContractDoc,
  upsertDocuSignEnvelopeAsContract,
  logDocuSignSyncResult,
} from '@/lib/v2/integrations/docusign-sync/service';
import { ModelProvider } from '@/constants/types';
import { classifyIntegrationError } from '@/lib/v2/integrations/settings-service';
import logger from '@/utils/pino';

const syncDocuSignEnvelopes = inngest.createFunction(
  {
    id: 'sync-docusign-envelopes',
    concurrency: 1,
    retries: 3,
  },
  [{ event: 'integrations/sync-docusign' }, { cron: '0 * * * *' }],
  async ({ event, step, logger: inngestLogger }) => {
    const startedAt = new Date();
    const integrationConnectionId = (event.data as any)?.integrationConnectionId
      ? String((event.data as any).integrationConnectionId)
      : undefined;

    const connections = await step.run(
      integrationConnectionId
        ? `get-docusign-connection-${integrationConnectionId}`
        : 'get-docusign-connections',
      async () => {
        return getDocuSignActiveConnections({
          integrationConnectionId,
          includeDisabled: Boolean(integrationConnectionId),
        });
      },
    );

    inngestLogger.info(
      { count: connections.length, integrationConnectionId },
      'Syncing DocuSign envelopes for active connections',
    );

    for (const connection of connections) {
      const {
        id: integration_connection_id,
        organization_id,
        user_id,
      } = connection;
      const log = logger.child({
        provider: 'docusign',
        organization_id,
        user_id,
        integration_connection_id,
      });
      let recordsProcessed = 0;

      try {
        const lastSyncAt = await step.run(
          `get-last-sync-docusign-${integration_connection_id}`,
          async () => {
            return getLastDocuSignSyncAt(integration_connection_id);
          },
        );

        const envelopes = await step.run(
          `fetch-envelopes-docusign-${integration_connection_id}`,
          async () => {
            try {
              return await fetchDocuSignEnvelopes(user_id, {
                sinceDate: lastSyncAt ?? undefined,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              if (classifyIntegrationError(message) === 'authentication') {
                throw new NonRetriableError(message);
              }
              throw error;
            }
          },
        );

        log.info(
          { count: envelopes.length },
          'Envelopes fetched from DocuSign',
        );

        for (let i = 0; i < envelopes.length; i++) {
          const envelope = envelopes[i];

          const result = await step.run(
            `upsert-envelope-docusign-${integration_connection_id}-${envelope.envelopeId}`,
            async () => {
              return upsertDocuSignEnvelopeAsContract({
                envelopeId: envelope.envelopeId,
                subject: envelope.emailSubject ?? '',
                status: envelope.status,
                completedDateTime: envelope.completedDateTime ?? null,
                createdDateTime: envelope.createdDateTime,
                organizationId: organization_id,
                userId: user_id,
                integrationConnectionId: integration_connection_id,
              });
            },
          );

          if (!result) continue;
          recordsProcessed++;

          if (!result.isNew) continue;

          // For new contracts, download the first document from the envelope
          const documents = await step.run(
            `fetch-docs-docusign-${integration_connection_id}-${envelope.envelopeId}`,
            async () => {
              return fetchDocuSignEnvelopeDocumentList(
                user_id,
                envelope.envelopeId,
              );
            },
          );

          if (documents.length === 0) continue;

          // Download the first (primary) document
          const doc = documents[0];
          const fileName = getDocuSignDocFileName(
            envelope.envelopeId,
            doc.documentId,
            doc.name,
          );
          const filePath = getDocuSignStoragePath(user_id, fileName);

          const processingState = await step.run(
            `get-processing-state-docusign-${integration_connection_id}-${envelope.envelopeId}`,
            async () => {
              return getDocuSignProcessingState(result.contractId, filePath);
            },
          );

          let hasContractDoc = processingState.hasContractDoc;

          if (!hasContractDoc) {
            // Rate limiting: DocuSign has 1000 req/hour limit, add small delay
            if (i > 0) {
              await step.sleep(
                `docusign-rate-limit-${integration_connection_id}-${envelope.envelopeId}`,
                '2s',
              );
            }

            const uploadResult = await step.run(
              `download-upload-pdf-docusign-${integration_connection_id}-${envelope.envelopeId}`,
              async () => {
                const pdfData = await downloadDocuSignDocument(
                  user_id,
                  envelope.envelopeId,
                  doc.documentId,
                );

                if (!pdfData) return null;

                return uploadDocuSignPdfToBucket(pdfData, user_id, fileName);
              },
            );

            if (!uploadResult) {
              log.error(
                {
                  envelopeId: envelope.envelopeId,
                  contractId: result.contractId,
                },
                'Failed to download DocuSign envelope PDF',
              );
              continue;
            }

            await step.run(
              `insert-contract-doc-docusign-${integration_connection_id}-${envelope.envelopeId}`,
              async () => {
                await insertDocuSignContractDoc(
                  uploadResult.filePath,
                  result.contractId,
                  user_id,
                );
              },
            );

            hasContractDoc = true;
          }

          if (hasContractDoc && processingState.needsExtraction) {
            await step.sendEvent(
              `trigger-extraction-docusign-${integration_connection_id}-${envelope.envelopeId}`,
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

        await step.run(
          `log-sync-docusign-${integration_connection_id}`,
          async () => {
            await logDocuSignSyncResult({
              organizationId: organization_id,
              userId: user_id,
              integrationConnectionId: integration_connection_id,
              syncType: 'inbound',
              status: 'success',
              recordsProcessed,
              startedAt,
            });
          },
        );
      } catch (error) {
        log.error({ error }, 'Error syncing DocuSign envelopes for connection');
        await step.run(
          `log-sync-error-docusign-${integration_connection_id}`,
          async () => {
            await logDocuSignSyncResult({
              organizationId: organization_id,
              userId: user_id,
              integrationConnectionId: integration_connection_id,
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

export default syncDocuSignEnvelopes;
