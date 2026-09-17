import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import { getEnvelopeStatus } from '@/utils/docusign';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '@/database.types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const envelopeId = searchParams.get('envelopeId');
    const forceUpdate = searchParams.get('force') === 'true';

    if (!envelopeId) {
      return NextResponse.json(
        { error: 'Envelope ID is required' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const userResponse = await supabase.auth.getUser();

    if (!userResponse.data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = userResponse.data.user.id;

    const { data, error, nextPollIn, cached, cachedAt } =
      await getEnvelopeStatus(supabase, userId, envelopeId, forceUpdate);

    if (error && !data) {
      if (error.message.includes('Rate limited')) {
        return NextResponse.json(
          {
            error: 'Rate limited',
            message: 'Too soon to poll envelope status',
            nextPollIn,
            rateLimited: true,
          },
          { status: 429 },
        );
      }

      logger.error({ error }, 'Error getting envelope status');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If successful (with fresh or cached data), update the envelope status in our database
    if (data) {
      try {
        const { error: updateError } = await supabase
          .from('contract_docs')
          .update({
            docusign_status: data.status,
            updated_at: new Date().toISOString(),
          })
          .eq('docusign_envelope_id', envelopeId);

        if (updateError) {
          logger.error(
            { error: updateError },
            'Error updating document status',
          );
        }
      } catch (dbError) {
        logger.error({ error: dbError }, 'Database error when updating status');
      }
    }

    // Return data with cache metadata
    return NextResponse.json({
      success: true,
      status: data.status,
      statusDateTime: data.statusDateTime,
      envelope: data,
      nextPollIn,
      cached: cached || false,
      cachedAt: cachedAt ? new Date(cachedAt).toISOString() : null,
      freshDataAvailableAt: nextPollIn
        ? new Date(Date.now() + nextPollIn).toISOString()
        : null,
    });
  } catch (error) {
    logger.error({ error }, 'Error in envelope status endpoint');
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
