import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import {
  callDocuSignApi,
  downloadDocument,
  fetchEnvelopeMetadata,
} from '@/utils/docusign';
import { getUserMetadata } from '@/data/users';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userMetadata = await getUserMetadata();

    if (!userMetadata) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = userMetadata.userId;

    const { documentId, envelopeId, name } = await request.json();

    if (!documentId || !envelopeId) {
      return NextResponse.json(
        { error: 'Missing documentId or envelopeId' },
        { status: 400 },
      );
    }

    try {
      const documentContent: Blob = await callDocuSignApi(
        supabase,
        userId,
        (params) => downloadDocument({ ...params, envelopeId, documentId }),
      );

      let metadata: { emailSubject?: string } | null = null;
      try {
        metadata = (await callDocuSignApi(supabase, userId, (params) =>
          fetchEnvelopeMetadata({ ...params, envelopeId, userId }),
        )) as { emailSubject?: string } | null;
      } catch (error) {
        logger.error(
          {
            userId,
            envelopeId,
            error,
          },
          'Error fetching metadata even after potential retry',
        );
      }

      if (!documentContent) {
        logger.error(
          { userId, envelopeId },
          'Document content is unexpectedly null after download attempts',
        );
        return NextResponse.json(
          { error: 'Failed to retrieve document content despite attempts.' },
          { status: 500 },
        );
      }

      let originalFilename = name || `document_${documentId}.pdf`;
      if (metadata && metadata.emailSubject) {
        originalFilename = `${metadata.emailSubject.replace(/[^a-z0-9\s_-]/gi, '_').replace(/\s+/g, '_')}.pdf`;
      }

      return new NextResponse(documentContent, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${originalFilename}"`,
        },
      });
    } catch (error: any) {
      logger.error(
        {
          userId,
          envelopeId,
          documentId,
          error: error.message,
        },
        'Error processing DocuSign document download request',
      );
      return NextResponse.json(
        { error: `Failed to process document download: ${error.message}` },
        { status: 500 },
      );
    }
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
      },
      'Error in DocuSign download document handler',
    );
    return NextResponse.json(
      { error: 'An unexpected error occurred processing the request.' },
      { status: 500 },
    );
  }
}
