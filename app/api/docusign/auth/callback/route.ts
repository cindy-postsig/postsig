import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '@/database.types';
import { isValidInternalPath } from '@/lib/utils';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { inngest } from '@/utils/inngest/client';

export async function GET(request: NextRequest) {
  const clientId = process.env.DOCUSIGN_CLIENT_ID;
  const clientSecret = process.env.DOCUSIGN_CLIENT_SECRET;
  const redirectUri = process.env.DOCUSIGN_REDIRECT_URI;
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');
    const baseRedirectUrl = '/settings/integrations';
    let redirectUrl = new URL(baseRedirectUrl, request.url);
    const tokenUrl = `${process.env.DOCUSIGN_OAUTH_BASE_URL}/oauth/token`;
    const userInfoUrl = `${process.env.DOCUSIGN_USER_INFO_URL}/oauth/userinfo`;

    let returnUrl = baseRedirectUrl;
    if (state && state.includes('.')) {
      try {
        const [, encodedReturnUrl] = state.split('.');
        const decodedUrl = Buffer.from(encodedReturnUrl, 'base64').toString();
        if (isValidInternalPath(decodedUrl)) {
          returnUrl = decodedUrl;
          redirectUrl = new URL(returnUrl, request.url);
          logger.info({ returnUrl }, 'Extracted valid return URL from state');
        } else {
          logger.warn(
            { decodedUrl },
            'Invalid redirect URL in state parameter, using default',
          );
        }
      } catch (e) {
        logger.error({ error: e }, 'Error extracting return URL from state');
      }
    }

    if (error) {
      logger.error({ error }, 'DocuSign authorization error');
      redirectUrl.searchParams.set('error', 'auth_failed');
      return NextResponse.redirect(redirectUrl);
    }

    if (!code) {
      logger.error('No authorization code received from DocuSign');
      redirectUrl.searchParams.set('error', 'no_code');
      return NextResponse.redirect(redirectUrl);
    }

    if (!clientId || !clientSecret || !redirectUri) {
      logger.error('DocuSign integration not fully configured');
      redirectUrl.searchParams.set('error', 'config_error');
      return NextResponse.redirect(redirectUrl);
    }

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error(
        { error: errorData },
        'Error exchanging auth code for tokens',
      );
      redirectUrl.searchParams.set('error', 'token_error');
      return NextResponse.redirect(redirectUrl);
    }

    const tokenData = await tokenResponse.json();

    const userInfoResponse = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      logger.error('Error getting DocuSign user info');
      redirectUrl.searchParams.set('error', 'userinfo_error');
      return NextResponse.redirect(redirectUrl);
    }

    const userInfo = await userInfoResponse.json();

    const defaultAccount = userInfo.accounts.find(
      (account: any) => account.is_default === true,
    );
    if (!defaultAccount) {
      logger.error('No default DocuSign account found');
      redirectUrl.searchParams.set('error', 'no_account');
      return NextResponse.redirect(redirectUrl);
    }

    const baseUri = defaultAccount.base_uri.replace(/\/restapi$/, '');

    const supabase = await createClient();
    const userResponse = await supabase.auth.getUser();

    if (!userResponse.data.user) {
      logger.error('User not authenticated');
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const updateData: Database['public']['Tables']['users']['Update'] = {
      docusign_connected: true,
      docusign_access_token: tokenData.access_token,
      docusign_refresh_token: tokenData.refresh_token,
      docusign_account_id: defaultAccount.account_id,
      docusign_base_uri: baseUri,
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
        'Error updating user with DocuSign data',
      );
      redirectUrl.searchParams.set('error', 'db_error');
      return NextResponse.redirect(redirectUrl);
    }

    // Populate integration_connections for the manage page (non-blocking).
    // Failures here must never prevent the success redirect.
    try {
      const serviceSupabase = createServiceClient();
      const { data: userRow } = await serviceSupabase
        .from('users')
        .select('organization_id')
        .eq('id', userResponse.data.user.id)
        .single();

      if (userRow?.organization_id) {
        const { data: savedConnection, error: connectionError } =
          await (serviceSupabase
            .from('integration_connections' as any)
            .upsert(
              {
                organization_id: userRow.organization_id,
                user_id: userResponse.data.user.id,
                provider: 'docusign',
                nango_connection_id: null,
                auth_provider: 'native_oauth',
                provider_account_id: defaultAccount.account_id,
                account_name: defaultAccount.account_name ?? null,
                status: 'connected',
                health_status: 'healthy',
                health_reason: null,
                health_detected_at: null,
                connected_at: new Date().toISOString(),
                disconnected_at: null,
                sync_enabled: true,
                sync_interval_minutes: 60,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,provider' },
            )
            .select('id')
            .single() as any);

        if (connectionError) {
          logger.warn(
            { error: connectionError },
            'Failed to upsert unified DocuSign connection',
          );
        }

        // Trigger immediate sync so envelopes appear without waiting for cron
        if (savedConnection?.id) {
          await inngest.send({
            name: 'integrations/sync-docusign',
            data: { integrationConnectionId: savedConnection.id },
          });
        }
      }
    } catch (err) {
      logger.warn(
        { err, userId: userResponse.data.user.id },
        'Non-blocking: failed to populate integration_connections or trigger sync',
      );
    }

    redirectUrl.searchParams.set('success', 'docusign_connected');
    redirectUrl.searchParams.set('openDocuSign', 'true');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    logger.error({ error }, 'Error in DocuSign callback');
    return NextResponse.redirect(
      new URL('/settings/integrations?error=unexpected', request.url),
    );
  }
}
