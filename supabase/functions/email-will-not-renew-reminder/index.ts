/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { Resend } from 'npm:resend@^3.2.0';
import { differenceInCalendarDays, parseISO } from 'npm:date-fns@^4.1.0';
import {
  createClient,
  SupabaseClientOptions,
} from 'https://esm.sh/@supabase/supabase-js';
import { errorResponse, successResponse } from '../lib/constants.ts';
import { ReminderEmail } from './ReminderEmail.tsx';

Deno.serve(async () => {
  try {
    // TEST MODE
    /* const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const client = new Resend(resendApiKey);
    const emailTemplate = ReminderEmail({
      vendorName: 'Test Vendor',
      products: ['Test Product 1', 'Test Product 2'],
      contractId: 'test-contract-123',
    });
    const testEmails = ['cindy@postsig.com', 'cindy+another@postsig.com'];
    for (const email of testEmails) {
      await client.emails.send({
        from: 'PostSig <noreply@postsig.com>',
        to: [email],
        subject: 'TEST: Reminder about expiring contract',
        react: emailTemplate,
      });
      console.info('Test email sent to:', email);
    }
    return successResponse;
    */

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

    const { data: contracts, error: contractError } = await supabase
      .from('contracts')
      .select(
        `
        id, user_id, will_not_renew_meta, term_end_date, cancel_date, organization_id,
        vendors (name),
        vendor_products_details (product_id, vendor_products (id, name))
        users (organization_id)
        `,
      )
      .eq('will_not_renew', true);

    if (contractError) {
      console.error('Error fetching contracts:', contractError);
      return;
    }

    for (const contract of contracts) {
      const termEndDate =
        contract.term_end_date && contract.term_end_date.length
          ? parseISO(contract.term_end_date[0].date)
          : null;
      const cancelDate =
        contract.cancel_date && contract.cancel_date.length
          ? parseISO(contract.cancel_date[0].date)
          : null;
      const taggedDate = new Date(contract.will_not_renew_meta?.updated_at);
      const today = new Date();

      let sendEmail = false;

      // 1) If cancelDate exists, check if today is 7 days before it
      if (cancelDate) {
        const daysFromTodayToCancel = differenceInCalendarDays(
          cancelDate,
          today,
        );
        if (daysFromTodayToCancel === 7) sendEmail = true;
      } else {
        if (!termEndDate) {
          console.warn(
            "Contract doesn't have termEndDate or cancelDate",
            contract.id,
          );
          continue;
        }

        // 2) If termEndDate is < 30 days from taggedDate, do nothing
        if (taggedDate) {
          const daysFromTaggedToTerm = differenceInCalendarDays(
            termEndDate,
            taggedDate,
          );
          if (daysFromTaggedToTerm < 30) continue;
        }

        // 3) Check if today is 30 days before termEndDate
        const daysFromTodayToTerm = differenceInCalendarDays(
          termEndDate,
          today,
        );
        if (daysFromTodayToTerm === 30) sendEmail = true;
      }

      if (!sendEmail) {
        console.info('Not sending email for contract', contract.id);
        continue;
      }

      // Fetch the users who can access this contract
      let organizationId = contract.organization_id;
      if (!organizationId) {
        console.log(
          'Contract missing orgId, using organization id of the user:',
          contract.user_id,
        );
        organizationId = contract.users?.organization_id;
      }

      if (!organizationId) {
        console.warn(
          'Cannot determine organizationId for contract',
          contract.id,
        );
        continue;
      }

      const {
        data: usersWhoCanSeeContract,
        error: usersWhoCanSeeContractError,
      } = await supabase.rpc('users_who_can_see_contracts', {
        p_contract_ids: [contract.id],
        p_organization_id: organizationId,
      } as any);

      if (usersWhoCanSeeContractError) {
        console.error(
          {
            error: usersWhoCanSeeContractError,
            contractId: contract.id,
            organizationId,
          },
          'Failed to fetch users who can see contract',
        );
        continue;
      }

      const emails = usersWhoCanSeeContract.map((u) => u.email);

      const products = contract.vendor_products_details.map(
        ({ vendor_products }: any) => vendor_products.name,
      );
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      const client = new Resend(resendApiKey);
      const emailTemplate = ReminderEmail({
        vendorName: contract.vendors.name || '',
        products,
        contractId: contract.id,
      });

      for (const email of emails) {
        await client.emails.send({
          from: 'PostSig <noreply@postsig.com>',
          to: [email],
          subject: 'Reminder about expiring contract',
          react: emailTemplate,
        });
        console.info('Email sent to:', email);
      }
    }

    return successResponse;
  } catch (err) {
    console.error(err);
    return errorResponse;
  }
});
