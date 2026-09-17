/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { Resend } from 'npm:resend@^3.2.0';
import Mustache from 'npm:mustache@^4.2.0';
import {
  createClient,
  SupabaseClientOptions,
} from 'https://esm.sh/@supabase/supabase-js';
import { NewUploadsDTO } from './types.d.ts';
import {
  transformNewContracts,
  removeInternalContracts,
} from './transforms.ts';
import { errorResponse, successResponse } from '../lib/constants.ts';
import newUploadsSummaryTemplate from './new-uploads-summary-template.ts';

Deno.serve(async () => {
  try {
    // Step 0: Init supabase
    const sbURL = Deno.env.get('SUPABASE_URL');
    const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sbURL || !sbServiceKey) {
      throw new Error('DB initialisation failed');
    }
    const opts: SupabaseClientOptions<'public'> = {
      global: {
        headers: { Authorization: `Bearer ${sbServiceKey}` },
      },
    };
    const supabase = createClient(sbURL, sbServiceKey, opts);

    // Step 1: Get contracts uploaded in the last hour
    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const startOfLastHour = new Date(
      lastHour.setMinutes(0, 0, 0),
    ).toISOString();
    const endOfLastHour = new Date(
      lastHour.setMinutes(59, 59, 999),
    ).toISOString();

    const { data, error } = await supabase
      .from('contracts')
      .select(
        'id, status_id, ai_extraction, ai_extraction_status, contract_docs (file_path), users!contracts_user_id_fkey (id, email, name, organizations!users_organization_id_fkey (id, name))',
      )
      .gte('created_at', startOfLastHour)
      .lt('created_at', endOfLastHour);
    if (error) throw error;

    // Step 2: Transform data
    const emailData = transformNewContracts(
      removeInternalContracts(data as unknown as NewUploadsDTO[]),
    );

    if (!emailData.summary.length) {
      console.info('No new uploads found. Shutting down process');
      return successResponse;
    }

    // Step 3: Send email
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const client = new Resend(resendApiKey);
    const env = Deno.env.get('POSTSIG_ENV');
    const systemEnv = env ? `(${env} env)` : '';

    const subject = '[Hourly Summary] Summary of Activities in the past hour';
    const html = Mustache.render(newUploadsSummaryTemplate, {
      systemEnv,
      ...emailData,
    });
    const targets = Deno.env.get('HOURLY_SUMMARY_EMAIL_TARGETS');
    const to = targets?.split(',');
    if (!to?.length) {
      throw new Error('No email address specified');
    }
    await client.emails.send({
      from: 'PostSig <noreply@postsig.com>',
      to,
      subject: systemEnv + ' ' + subject,
      html,
    });
    console.info('Email(s) sent to:', to.toString());

    return successResponse;
  } catch (err) {
    console.error(err);
    return errorResponse;
  }
});
