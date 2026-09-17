/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import {
  createClient,
  SupabaseClientOptions,
} from 'https://esm.sh/@supabase/supabase-js';
import { Resend } from 'npm:resend@^3.2.0';
import { errorResponse, successResponse } from '../lib/constants.ts';
import { NotificationEmail } from './NotificationEmail.tsx';
import { getBudgetsForEmail } from './budgetCalculator.ts';

const userRoles = {
  postsigUser: 3,
  postsigReviewer: 6,
  postsigExtractor: 7,
  clientAdmin: 11,
  clientSupervisor: 12,
  clientUser: 14,
};

const sendEmail = async (
  to: string,
  noticePeriod: string,
  contracts: {
    vendor: string;
    product: string;
    additionalProductCount: number;
    contractType: string;
    cancelBy: string;
    endDate: string;
    currentBudget: string;
    projectedBudget: string;
    tcv: string;
  }[],
) => {
  // Add validation for email
  if (!to) {
    console.warn('Skipping email send - no valid email address');
    return;
  }

  const emailTemplate = NotificationEmail({
    noticePeriod,
    // Limit contracts to 25
    contracts: contracts.slice(0, 25),
  });
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const client = new Resend(resendApiKey);
  await client.emails.send({
    from: 'PostSig <noreply@postsig.com>',
    to: 'cindy@postsig.com',
    subject: 'Latest Contracts Status Report',
    react: emailTemplate,
  });
  console.info(`Email sent to: ${to} with ${contracts.length} contracts`);
};

const formatCurrency = (value: number, currency?: string): string | null => {
  const roundedValue = Math.ceil(value);
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  });
  return value >= 0 ? formatter.format(roundedValue) : null;
};

const getMostRecentDate = (dateArr: any): string | null => {
  if (!dateArr || !Array.isArray(dateArr) || dateArr.length === 0) {
    return null;
  }
  return dateArr[0].date;
};

export function extendSupabaseQueryByUserRole(
  supabaseQuery: any,
  userId: string,
  roles: number[],
  orgUserIds: string[] = [],
) {
  const userRoles = {
    postsigUser: 3,
    postsigReviewer: 6,
    postsigExtractor: 7,
    clientAdmin: 11,
    clientSupervisor: 12,
    clientUser: 14,
  };

  let userRole;
  if (roles.length === 1) {
    userRole = roles[0];
  } else {
    // Map role to match following switch statement
    if (
      roles.some((role) =>
        [
          userRoles.clientAdmin,
          userRoles.clientSupervisor,
          userRoles.postsigReviewer,
          userRoles.postsigExtractor,
        ].includes(role),
      )
    ) {
      userRole = userRoles.clientAdmin;
    } else {
      userRole = userRoles.clientUser;
    }
  }

  // should consider
  switch (userRole) {
    case userRoles.clientUser:
    case userRoles.postsigUser:
      return supabaseQuery.eq('user_id', userId);
    case userRoles.clientAdmin:
    case userRoles.clientSupervisor:
    case userRoles.postsigReviewer:
    case userRoles.postsigExtractor:
      return supabaseQuery.in('user_id', orgUserIds);
    default:
      return supabaseQuery.eq('user_id', userId);
  }
}

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

    // Step 1: Get organizations with app_access = TRUE
    const { data: organizations, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('app_access', true);

    if (orgError) {
      console.error('Error fetching organizations:', orgError);
      return;
    }

    const organizationIds = organizations.map((org) => org.id);

    // Step 2: Get users in those organizations with email alerts setup
    const { data: users, error: userError } = await supabase
      .from('users')
      .select(
        'id, email, advance_notice_period, organization_id, user_role:user_roles2(role_id)',
      )
      .in('organization_id', ['3eae8a03-cdf8-4860-a6f1-efdfadf7bedf'])
      .eq('email_alerts', true)
      // Check frequency
      .eq('email_frequency', 'Weekly');
    if (userError) {
      console.error('Error fetching users:', userError);
      return;
    }

    const currentDate = new Date();
    const result = [];

    // Step 5: Process each user's contracts
    for (const user of users) {
      const { data: orgUsers, error: orgUsersError } = await supabase
        .from('users')
        .select('*')
        .eq('organization_id', user.organization_id);
      if (orgUsersError) {
        console.error('Error fetching other users of the organization');
        return;
      }

      // Step 4: Get contracts related to the user
      let query = supabase
        .from('contracts')
        .select(
          `
          id, user_id, cancel_date, cancel_by_date, term_start_date, term_end_date, currency, renewal_period, subscription_term, annual_increase,
          vendors (
            id, name, domain
          ),
          contract_types (
            id, name
          ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            id, product_id, contract_id, year, fees, one_time_only,
            vendor_products (
              id, name
            )
          )
          `,
        )
        // Use only published ones
        .eq('status_id', 4)
        // Use only active ones
        .eq('status', 'active');

      const orgUserIds = orgUsers.map((user: any) => user.id);
      query = extendSupabaseQueryByUserRole(
        query,
        user.id,
        user.user_role.map(({ role_id }) => role_id),
        orgUserIds,
      );

      const { data: contracts, error: contractError } = await query;

      if (contractError) {
        console.error('Error fetching contracts:', contractError);
        return;
      }
      const filteredContracts = [];

      const noticePeriod = user.advance_notice_period;
      if (!noticePeriod) {
        continue; // Skip if no notice period
      }

      for (const contract of contracts) {
        const endDateStr = getMostRecentDate(contract.term_end_date);
        const cancelDateStr = getMostRecentDate(contract.cancel_date);

        // Check both dates independently
        const isEligibleByEndDate =
          endDateStr &&
          (() => {
            const endDate = new Date(endDateStr);
            const reminderDate = new Date(endDateStr);
            reminderDate.setDate(reminderDate.getDate() - noticePeriod);
            return currentDate >= reminderDate && currentDate <= endDate;
          })();

        const isEligibleByCancelDate =
          cancelDateStr &&
          (() => {
            const cancelDate = new Date(cancelDateStr);
            const reminderDate = new Date(cancelDateStr);
            reminderDate.setDate(reminderDate.getDate() - noticePeriod);
            return currentDate >= reminderDate && currentDate <= cancelDate;
          })();

        if (isEligibleByEndDate || isEligibleByCancelDate) {
          filteredContracts.push(contract);
        }
      }

      if (filteredContracts.length > 0) {
        result.push({
          user_id: user.id,
          email: user.email,
          noticePeriod,
          contracts: filteredContracts,
          organizationFYStartMonth: 1,
        });
      }
    }

    // Send emails
    for (const record of result) {
      const contracts = record.contracts.map((contract) => {
        let product = 'N/A',
          additionalProductCount = 0;
        if (contract.vendor_products_details.length === 1) {
          product = contract.vendor_products_details[0].vendor_products.name;
        }

        if (contract.vendor_products_details.length > 1) {
          product = contract.vendor_products_details[0].vendor_products.name;
          additionalProductCount = contract.vendor_products_details.length - 1;
        }

        const { currentBudget, projectedBudget, totalContractValue } =
          getBudgetsForEmail(contract, record.organizationFYStartMonth);

        return {
          vendor: contract.vendors?.name?.replaceAll('"', '') || 'N/A',
          product,
          additionalProductCount,
          contractType: contract.contract_types?.name || 'N/A',
          cancelBy: getMostRecentDate(contract.cancel_date) || 'N/A',
          endDate: getMostRecentDate(contract.term_end_date) || 'N/A',
          currentBudget: formatCurrency(currentBudget, contract.currency),
          projectedBudget: formatCurrency(projectedBudget, contract.currency),
          tcv: formatCurrency(totalContractValue, contract.currency),
        } as {
          vendor: string;
          product: string;
          additionalProductCount: number;
          contractType: string;
          cancelBy: string;
          endDate: string;
          currentBudget: string;
          projectedBudget: string;
          tcv: string;
        };
      });

      await sendEmail(record.email, record.noticePeriod, contracts);
    }

    return successResponse;
  } catch (err) {
    console.error(err);
    return errorResponse;
  }
});
