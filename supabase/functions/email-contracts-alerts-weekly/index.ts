/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import {
  createClient,
  SupabaseClientOptions,
} from 'https://esm.sh/@supabase/supabase-js';
import { Resend } from 'npm:resend@^3.2.0';
import { errorResponse, successResponse } from '../lib/constants.ts';
import { NotificationEmail } from './NotificationEmail.tsx';
import { getBudgetsForEmail } from './budgetCalculator.ts';
import { extendContractsFetchQueryByUserRole } from '../lib/supabase-query.builder.ts';
import {
  formatDate,
  isDateFormatPattern,
  resolveDateFormat,
} from '../lib/date-format.ts';

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
    renewalType: string;
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

  const emailTemplate = NotificationEmail({ noticePeriod, contracts });
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const client = new Resend(resendApiKey);
  await client.emails.send({
    from: 'PostSig <noreply@postsig.com>',
    to,
    subject: 'Latest Contracts Status Report',
    react: emailTemplate,
  });
  // eslint-disable-next-line no-console
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
      .select('id, fiscal_year_start_month')
      .eq('app_access', true);

    if (orgError) {
      console.error('Error fetching organizations:', orgError);
      return;
    }

    const organizationIds = organizations.map((org: any) => org.id);

    // Date format is stored in preference tables (regional.date_format).
    // Org default -> org_preferences; per-user override -> user_preferences.
    const DATE_FORMAT_PREFERENCE_KEY = 'regional.date_format';
    const { data: orgDateFormatPrefs } = await supabase
      .from('org_preferences')
      .select('organization_id, preference_value')
      .in('organization_id', organizationIds)
      .eq('preference_key', DATE_FORMAT_PREFERENCE_KEY);
    const orgDateFormatMap = new Map<string, string>();
    orgDateFormatPrefs?.forEach((pref: any) => {
      if (typeof pref.preference_value === 'string') {
        orgDateFormatMap.set(pref.organization_id, pref.preference_value);
      }
    });

    // Step 2: Get users in those organizations with email alerts setup
    const { data: users, error: userError } = await supabase
      .from('users')
      .select(
        'id, email, advance_notice_period, email_frequency, last_notified_date, organization_id, user_role:user_roles2(role_id)',
      )
      .in('organization_id', organizationIds)
      .eq('email_alerts', true);
    if (userError) {
      console.error('Error fetching users:', userError);
      return;
    }

    const { data: userDateFormatPrefs } = await supabase
      .from('user_preferences')
      .select('user_id, preference_value')
      .in(
        'user_id',
        users.map((u: any) => u.id),
      )
      .eq('preference_key', DATE_FORMAT_PREFERENCE_KEY);
    const userDateFormatMap = new Map<string, string>();
    userDateFormatPrefs?.forEach(
      (pref: { user_id: string; preference_value: unknown }) => {
        const value = pref.preference_value;
        if (isDateFormatPattern(value)) {
          userDateFormatMap.set(pref.user_id, value);
        }
      },
    );

    const currentDate = new Date();
    const result = [];

    // Step 3: Process each user's contracts
    for (const user of users) {
      // Ignore reviewer and extractor users
      if (
        user.user_role.some(
          ({ role_id }: any) =>
            role_id === userRoles.postsigReviewer ||
            role_id === userRoles.postsigExtractor,
        )
      ) {
        continue;
      }

      if (user.last_notified_date) {
        const lastSentDate = new Date(user.last_notified_date);
        const today = new Date();
        const frequency = user.email_frequency === 'Weekly' ? 7 : 30;
        const period = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - frequency,
        );
        if (lastSentDate > period) {
          continue;
        }
      }

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
          id, user_id, cancel_date, cancel_by_date, term_start_date, term_end_date, currency, renewal_period, subscription_term, annual_increase, renewal_type,
          vendors (
            id, name, domain, merged_into_vendor_id,
            merged_vendor:merged_into_vendor_id (
              id, name, domain
            )
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

      const orgUserIds = (orgUsers ?? []).map((u: { id: string }) => u.id);
      query = await extendContractsFetchQueryByUserRole(
        supabase,
        query,
        user.id,
        user.user_role.map(({ role_id }: any) => role_id),
        orgUserIds,
        user.organization_id,
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

      const organizationFYStartMonth = organizations.find(
        (org: any) => org.id === user.organization_id,
      )?.fiscal_year_start_month;

      const organizationDateFormat =
        orgDateFormatMap.get(user.organization_id) ?? null;
      const dateFormat = resolveDateFormat(
        userDateFormatMap.get(user.id) ?? null,
        organizationDateFormat,
      );

      for (const contract of contracts) {
        const endDateStr = getMostRecentDate(contract.term_end_date);
        const cancelDateStr = getMostRecentDate(contract.cancel_date);

        // Check term end date eligibility
        const isEligibleByEndDate =
          endDateStr &&
          (() => {
            const endDate = new Date(endDateStr);
            const reminderDate = new Date(endDateStr);
            reminderDate.setDate(reminderDate.getDate() - noticePeriod);
            return currentDate >= reminderDate && currentDate <= endDate;
          })();

        // Check cancel date eligibility - only if cancel date has not passed
        let isEligibleByCancelDate = false;
        if (cancelDateStr) {
          const cancelDate = new Date(cancelDateStr);
          // Skip entirely if cancel date is in the past
          if (currentDate > cancelDate) {
            continue;
          }

          // Check if we're in the notification window for the cancel date
          const reminderDate = new Date(cancelDateStr);
          reminderDate.setDate(reminderDate.getDate() - noticePeriod);
          isEligibleByCancelDate =
            currentDate >= reminderDate && currentDate <= cancelDate;
        }

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
          organizationFYStartMonth,
          dateFormat,
        });
      }
    }

    // Step 5: Send emails for each user
    for (const record of result) {
      const contracts = record.contracts
        // Sort contracts by cancel date and end date
        .sort((a, b) => {
          const candidateA =
            getMostRecentDate(a.cancel_date) ||
            getMostRecentDate(a.term_end_date);
          const candidateB =
            getMostRecentDate(b.cancel_date) ||
            getMostRecentDate(b.term_end_date);
          if (!candidateA && !candidateB) {
            return 0;
          }
          if (!candidateA) {
            return -1;
          }
          if (!candidateB) {
            return 1;
          }
          const dateA = new Date(candidateA);
          const dateB = new Date(candidateB);
          if (dateA < dateB) return -1;
          if (dateA > dateB) return 1;
          return 0;
        })
        // Limit contracts to 25
        .slice(0, 25)
        // Format data to match email template
        .map((contract) => {
          let product = 'N/A',
            additionalProductCount = 0;
          if (contract.vendor_products_details.length === 1) {
            product = contract.vendor_products_details[0].vendor_products.name;
          }

          if (contract.vendor_products_details.length > 1) {
            product = contract.vendor_products_details[0].vendor_products.name;
            additionalProductCount =
              contract.vendor_products_details.length - 1;
          }

          const { currentBudget, projectedBudget, totalContractValue } =
            getBudgetsForEmail(contract, record.organizationFYStartMonth);

          return {
            vendor:
              contract.vendors?.merged_vendor?.name?.replaceAll('"', '') ||
              contract.vendors?.name?.replaceAll('"', '') ||
              'N/A',
            product,
            additionalProductCount,
            contractType: contract.contract_types?.name || 'N/A',
            cancelBy: formatDate(
              getMostRecentDate(contract.cancel_date),
              record.dateFormat,
            ),
            endDate: formatDate(
              getMostRecentDate(contract.term_end_date),
              record.dateFormat,
            ),
            currentBudget: formatCurrency(currentBudget, contract.currency),
            projectedBudget: formatCurrency(projectedBudget, contract.currency),
            tcv: formatCurrency(totalContractValue, contract.currency),
            renewalType: contract.renewal_type || 'N/A',
          } as {
            vendor: string;
            product: string;
            additionalProductCount: number;
            contractType: string;
            renewalType: string;
            cancelBy: string;
            endDate: string;
            currentBudget: string;
            projectedBudget: string;
            tcv: string;
          };
        });

      await sendEmail(record.email, record.noticePeriod, contracts);

      const today = new Date();

      // Update last notified date
      await supabase
        .from('users')
        .update({ last_notified_date: today })
        .eq('id', record.user_id);
      // eslint-disable-next-line no-console
      console.info(
        `Updated last notified date of ${record.user_id} to ${today}`,
      );
    }

    return successResponse;
  } catch (err) {
    console.error(err);
    return errorResponse;
  }
});
