import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import logger from '@/utils/pino';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '@/database.types';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';

export async function POST() {
  try {
    const supabase = await createClient();
    const userResponse = await supabase.auth.getUser();

    if (!userResponse.data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updateData: Database['public']['Tables']['users']['Update'] = {
      docusign_connected: false,
      docusign_access_token: null,
      docusign_refresh_token: null,
      docusign_account_id: null,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError }: { error: PostgrestError | null } =
      await supabase
        .from('users')
        .update(updateData)
        .eq('id', userResponse.data.user.id);

    if (updateError) {
      logger.error(
        { error: updateError },
        'Error disconnecting user from DocuSign',
      );
      return NextResponse.json(
        { error: 'Failed to disconnect from DocuSign' },
        { status: 500 },
      );
    }

    const serviceSupabase = createServiceClient();
    const disconnectedAt = new Date().toISOString();
    const { error: connectionError } = await (serviceSupabase
      .from('integration_connections' as any)
      .update({
        status: 'disconnected',
        health_status: 'disconnected',
        health_reason: 'Disconnected',
        health_detected_at: disconnectedAt,
        disconnected_at: disconnectedAt,
        updated_at: disconnectedAt,
      })
      .eq('user_id', userResponse.data.user.id)
      .eq('provider', 'docusign') as any);

    if (connectionError) {
      logger.warn(
        { error: connectionError },
        'Failed to update unified DocuSign connection',
      );
    }

    return NextResponse.json(
      { success: true, message: 'Successfully disconnected from DocuSign' },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ error }, 'Error in DocuSign disconnect');
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
