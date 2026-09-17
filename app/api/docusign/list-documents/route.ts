import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import {
  canPollEnvelope,
  getCachedEnvelopeStatus,
  cacheEnvelopeStatus,
  callDocuSignApi,
  fetchCompletedEnvelopes,
  fetchEnvelopeDocuments,
  fetchEnvelopeStatus,
} from '@/utils/docusign';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userResponse = await supabase.auth.getUser();
    const userId = userResponse.data.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const includeEnvelopeStatus =
      searchParams.get('includeEnvelopeStatus') === 'true';

    try {
      const envelopes: Array<{
        envelopeId: string;
        status: string;
        emailSubject?: string;
        createdDateTime: string;
        completedDateTime?: string;
      }> = await callDocuSignApi(supabase, userId, (params) =>
        fetchCompletedEnvelopes({ ...params, includeEnvelopeStatus }),
      );

      const documents = [];
      for (const envelope of envelopes) {
        let envelopeDocs: any[] = [];
        let statusData: any = null;
        let pollable = true;

        try {
          envelopeDocs = await callDocuSignApi(supabase, userId, (params) =>
            fetchEnvelopeDocuments({
              ...params,
              envelopeId: envelope.envelopeId,
            }),
          );

          if (includeEnvelopeStatus) {
            pollable = canPollEnvelope(envelope.envelopeId);
            if (!pollable) {
              const cachedStatus = getCachedEnvelopeStatus(envelope.envelopeId);
              if (cachedStatus) {
                logger.info(
                  `Using cached status for envelope ${envelope.envelopeId}`,
                );
                statusData = cachedStatus.data;
              } else {
                logger.info(
                  `Rate limited for envelope ${envelope.envelopeId}, no cache available.`,
                );
              }
            } else {
              statusData = await callDocuSignApi(supabase, userId, (params) =>
                fetchEnvelopeStatus({
                  ...params,
                  envelopeId: envelope.envelopeId,
                }),
              );
              cacheEnvelopeStatus(envelope.envelopeId, statusData);
            }
          }

          for (const doc of envelopeDocs) {
            if (doc.documentId === 'certificate') continue;

            const status = statusData?.status || envelope.status;
            const completedDateTime =
              statusData?.completedDateTime || envelope.completedDateTime;

            documents.push({
              documentId: doc.documentId,
              name: doc.name,
              envelopeId: envelope.envelopeId,
              subject: envelope.emailSubject || doc.name,
              status,
              createdDateTime: envelope.createdDateTime,
              completedDateTime,
              statusFromCache:
                includeEnvelopeStatus && !pollable && !!statusData,
            });
          }
        } catch (error: any) {
          logger.error(
            {
              error: error.message,
              envelopeId: envelope.envelopeId,
              userId,
            },
            `Error processing envelope ${envelope.envelopeId} within loop`,
          );
        }
      }

      return NextResponse.json({
        success: true,
        documents: documents,
        rateLimiting: {
          applied: includeEnvelopeStatus,
          message:
            'DocuSign envelope status polling is limited to once every 20 minutes per envelope',
          usesCache: true,
        },
      });
    } catch (error: any) {
      logger.error(
        { error },
        'Error fetching or processing DocuSign documents',
      );
      return NextResponse.json(
        {
          error: `Failed to fetch or process DocuSign documents: ${error.message}`,
        },
        { status: 500 },
      );
    }
  } catch (error: any) {
    logger.error({ error }, 'Error in DocuSign list documents handler');
    return NextResponse.json(
      { error: `An unexpected setup error occurred: ${error.message}` },
      { status: 500 },
    );
  }
}
