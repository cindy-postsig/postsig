import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import { callDocuSignApi, sendEnvelope } from '@/utils/docusign';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '@/database.types';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userResponse = await supabase.auth.getUser();
    const userId = userResponse.data.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestData = await request.json();
    const { documentId, recipients, emailSubject, emailMessage } = requestData;

    if (
      !documentId ||
      !recipients ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return NextResponse.json(
        { error: 'Missing required fields: documentId and recipients' },
        { status: 400 },
      );
    }

    let safePath: string;
    try {
      safePath = buildSafePath([documentId]);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        logger.warn({ documentId }, 'Path traversal attempt detected');
        return NextResponse.json(
          { error: 'Invalid document ID' },
          { status: 400 },
        );
      }
      throw error;
    }

    const { data: documentData, error: documentError } = await supabase.storage
      .from('documents')
      .download(safePath);

    if (documentError || !documentData) {
      logger.error(
        {
          documentId,
          error: documentError,
        },
        'Error fetching document from storage',
      );
      return NextResponse.json(
        { error: 'Failed to retrieve document from storage' },
        { status: 500 },
      );
    }

    const docBase64 = await documentData
      .arrayBuffer()
      .then((buffer) => Buffer.from(buffer).toString('base64'));

    // Define envelope structure
    const envelopeDefinition = {
      emailSubject: emailSubject || 'Please sign this document',
      emailBlurb: emailMessage || 'Please sign this document sent via PostSig',
      documents: [
        {
          documentBase64: docBase64,
          name: `Document-${documentId}`,
          fileExtension: 'pdf',
          documentId: '1',
        },
      ],
      recipients: {
        signers: recipients.map((recipient: any, index: number) => ({
          email: recipient.email,
          name: recipient.name,
          recipientId: (index + 1).toString(),
          routingOrder: (index + 1).toString(),
          tabs: recipient.tabs || { signHereTabs: [] },
        })),
      },
      status: 'sent',
    };

    try {
      // Use the wrapper to send the envelope
      const result: { envelopeId?: string; status?: string } =
        await callDocuSignApi(supabase, userId, (params) =>
          sendEnvelope({ ...params, envelopeDefinition }),
        );

      if (!result || !result.envelopeId) {
        logger.error(
          {
            userId,
            documentId,
            result,
          },
          'Send envelope result is missing envelopeId',
        );
        return NextResponse.json(
          { error: 'Failed to send envelope or retrieve envelope ID.' },
          { status: 500 },
        );
      }

      const updateData: Database['public']['Tables']['contract_docs']['Update'] =
        {
          docusign_envelope_id: result.envelopeId,
          docusign_sent_at: new Date().toISOString(),
          docusign_status: 'sent',
        };
      const { error: updateError }: { error: PostgrestError | null } =
        await supabase
          .from('contract_docs')
          .update(updateData)
          .eq('id', documentId);

      if (updateError) {
        logger.error(
          {
            documentId,
            envelopeId: result.envelopeId,
            error: updateError,
          },
          'Error updating contract_docs with envelope ID',
        );
      }

      return NextResponse.json({
        success: true,
        envelopeId: result.envelopeId,
        status: result.status,
      });
    } catch (error: any) {
      logger.error(
        {
          userId,
          documentId,
          error: error.message,
        },
        'Error processing DocuSign send request',
      );
      return NextResponse.json(
        { error: `Failed to process envelope send: ${error.message}` },
        { status: 500 }, // Use 500 for processing errors
      );
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error in DocuSign send handler');
    return NextResponse.json(
      { error: 'An unexpected error occurred processing the request.' },
      { status: 500 },
    );
  }
}
