import { z } from 'zod';
import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import ReportingRequestEmail from '@/emails/ReportingRequestEmail';
import ReportingReminderEmail from '@/emails/ReportingReminderEmail';
import logger from '@/utils/pino';
import {
  canSendReminder,
  deriveCompanyDomain,
  formatPeriodLabel,
  isFreemailDomain,
  isFreemailEmail,
  normalizeDomainInput,
} from './transforms';
import { logKpiEvent } from './events';

export interface ReportingCaller {
  userId: string;
  organizationId: string;
  senderName: string | null;
  userRole: number;
}

const createRequestSchema = z.object({
  companyId: z.number().int(),
  requestType: z.enum(['kpi', 'reporting_pack']),
  periodYear: z.number().int().min(2000).max(2100),
  periodQuarter: z.number().int().min(1).max(4).nullable(),
  recipientEmails: z.array(z.email()),
  // The sign-in domain the investor confirmed in the form. undefined = field
  // not shown (a domain is already stored, or a legacy caller) — fall back to
  // registry/recipient derivation; null = investor cleared it — pin nothing,
  // the link stays invite-only.
  companyDomain: z.string().max(255).nullable().optional(),
  message: z.string().max(2000).optional(),
  kpiIds: z.array(z.number().int()).optional(),
  docTypeIds: z.array(z.number().int()).optional(),
  customDocLabels: z.array(z.string()).optional(),
});

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type CreateReportingRequestInput = z.infer<typeof createRequestSchema>;
export type CreateReportingRequestResult =
  | { publicId: string; emailed: boolean; companyDomain: string | null }
  | { error: string };

function senderIdentity(senderName: string | null, orgName: string | null) {
  const cleanName = senderName?.replace(/["<>\r\n]/g, '').trim() || null;
  const senderLabel = cleanName
    ? orgName
      ? `${cleanName} (${orgName})`
      : cleanName
    : (orgName ?? 'PostSig');
  const fromName = cleanName ? `${cleanName} via PostSig` : 'PostSig';
  return { cleanName, senderLabel, fromName };
}

// Provisions one recipient (org-less account, portco module access, company
// membership) and emails them a magic link. Returns the user id so the caller
// can record the recipient row; it does not touch the request itself.
async function provisionAndEmailRecipient(args: {
  organizationId: string;
  companyId: number;
  recipientEmail: string;
  publicId: string;
  requestType: 'kpi' | 'reporting_pack';
  includesDocuments: boolean;
  periodLabel: string;
  message: string | null;
  senderId: string;
  senderName: string | null;
  notify: boolean;
  variant?: 'request' | 'shared';
}): Promise<{ userId: string } | null> {
  const admin = createServiceClient();
  const email = args.recipientEmail.trim().toLowerCase();

  try {
    const { data: moduleRow } = await admin
      .from('app_modules')
      .select('id')
      .eq('code', 'portco')
      .maybeSingle();
    if (!moduleRow) {
      logger.error(
        'portco app_module is missing; cannot grant recipient access',
      );
      return null;
    }

    let userId: string;
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          user_metadata: { signed_up: true },
        });
      if (createError || !created.user) {
        logger.error({ createError, email }, 'Failed to create recipient user');
        return null;
      }
      userId = created.user.id;
    }

    const { error: grantError } = await admin.from('user_module_access').upsert(
      {
        user_id: userId,
        organization_id: args.organizationId,
        module_id: moduleRow.id,
        granted_by: args.senderId,
        is_default: false,
      },
      { onConflict: 'user_id,module_id', ignoreDuplicates: true },
    );
    if (grantError) {
      logger.error(
        { grantError, userId },
        'Failed to grant portco module access',
      );
      return null;
    }

    // Record the recipient's external membership of this company so the portco
    // app can resolve their company for self-serve reporting (no request token
    // needed thereafter). External users are org-less — they are NOT investor-org
    // members — so membership lives here, not in the investor-internal ACL family.
    const { error: membershipError } = await admin
      .from('inv_portco_user')
      .upsert(
        {
          company_id: args.companyId,
          organization_id: args.organizationId,
          user_id: userId,
        },
        { onConflict: 'company_id,user_id', ignoreDuplicates: true },
      );
    if (membershipError) {
      logger.error(
        { membershipError, userId },
        'Failed to record portco company membership',
      );
      return null;
    }

    // Existing recipients keep their access but aren't re-notified (e.g. on edit
    // or re-request); only newly added recipients get an email.
    if (!args.notify) return { userId };

    // Access is already provisioned above; only the magic-link email needs the
    // portco URL. A missing config must not strip the recipient's access — they
    // keep it and the sender can share the link from the request view.
    const portcoUrl = process.env.NEXT_PUBLIC_PORTCO_APP_URL;
    if (!portcoUrl) {
      logger.error(
        { userId },
        'NEXT_PUBLIC_PORTCO_APP_URL is not set; recipient provisioned but not emailed',
      );
      return { userId };
    }

    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashedToken = link?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      logger.error({ linkError, email }, 'Failed to generate recipient link');
      return null;
    }

    const next = `/requests/${args.publicId}`;
    const actionUrl = `${portcoUrl}/auth/confirm?token_hash=${hashedToken}&type=magiclink&next=${encodeURIComponent(next)}`;

    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', args.organizationId)
      .maybeSingle();

    const resend = new Resend(process.env.RESEND_API_KEY);
    const noun =
      args.requestType === 'kpi'
        ? args.includesDocuments
          ? 'KPIs and documents'
          : 'KPIs'
        : 'reporting pack';
    const orgName = org?.name ?? null;
    const { cleanName, senderLabel, fromName } = senderIdentity(
      args.senderName,
      orgName,
    );
    const subject =
      args.variant === 'shared'
        ? `${senderLabel} shared a reporting request with you for ${args.periodLabel}`
        : `${senderLabel} requested your ${noun} for ${args.periodLabel}`;
    const { error: emailError } = await resend.emails.send({
      from: `${fromName} <noreply@postsig.com>`,
      to: [email],
      subject,
      react: ReportingRequestEmail({
        senderName: cleanName,
        senderOrg: orgName,
        periodLabel: args.periodLabel,
        requestType: args.requestType,
        includesDocuments: args.includesDocuments,
        message: args.message,
        actionUrl,
      }) as ReactElement,
    });
    if (emailError) {
      logger.error({ emailError, email }, 'Failed to send reporting email');
      return null;
    }

    return { userId };
  } catch (error) {
    logger.error({ error, email }, 'Failed to provision/email recipient');
    return null;
  }
}

export async function createReportingRequest(
  input: CreateReportingRequestInput,
  caller: ReportingCaller,
): Promise<CreateReportingRequestResult> {
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Please complete all required fields.' };
  }
  const v = parsed.data;

  if (v.requestType === 'kpi' && !v.kpiIds?.length) {
    return { error: 'Select at least one KPI to request.' };
  }
  if (
    v.requestType === 'reporting_pack' &&
    !v.docTypeIds?.length &&
    !v.customDocLabels?.some((l) => l.trim())
  ) {
    return { error: 'Select at least one document to request.' };
  }

  const recipientEmails = Array.from(
    new Set(
      v.recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
    ),
  );

  const supabase = await createClient();
  const { userId, organizationId, senderName } = caller;

  // The request row's org passes RLS on its own, but nothing pins company_id to
  // that org — verify the company belongs to the caller before trusting it.
  const { data: company } = await supabase
    .from('inv_company')
    .select('id, company_id, domain')
    .eq('id', v.companyId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!company) return { error: 'Company not found.' };

  // Recipients get full portal access, so personal (freemail) addresses are
  // rejected outright. Only NEW recipients are checked: ones already on the
  // request predate this rule and blocking them would make the request
  // un-editable (existing recipients can't be dropped from the edit dialog).
  let priorRequestQuery = supabase
    .from('inv_reporting_request')
    .select('id, inv_reporting_request_recipient(email)')
    .eq('company_id', v.companyId)
    .eq('period_year', v.periodYear)
    .eq('request_type', v.requestType);
  priorRequestQuery =
    v.periodQuarter === null
      ? priorRequestQuery.is('period_quarter', null)
      : priorRequestQuery.eq('period_quarter', v.periodQuarter);
  const { data: priorRequest } = await priorRequestQuery.maybeSingle();
  const priorEmails = new Set(
    (priorRequest?.inv_reporting_request_recipient ?? []).map((r) =>
      r.email.trim().toLowerCase(),
    ),
  );
  const personalEmail = recipientEmails.find(
    (e) => !priorEmails.has(e) && isFreemailEmail(e),
  );
  if (personalEmail) {
    return {
      error: `${personalEmail} is a personal email address. Recipients need a work email.`,
    };
  }

  let confirmedDomain = v.companyDomain;
  if (typeof confirmedDomain === 'string') {
    confirmedDomain = normalizeDomainInput(confirmedDomain) || null;
    if (confirmedDomain) {
      if (!DOMAIN_RE.test(confirmedDomain)) {
        return { error: 'Enter a valid domain like acme.com.' };
      }
      if (isFreemailDomain(confirmedDomain)) {
        return {
          error: `${confirmedDomain} is a personal email domain. Use the company's work domain.`,
        };
      }
    }
  }

  // The first request pins the company's self-signup domain: the domain the
  // investor confirmed in the form when the field was shown, else the global
  // registry's domain when known, else the first corporate recipient email.
  // The portco app admits domain-matching emails to shared request links, so
  // a freemail domain must never land here — confirmed input is validated
  // above, deriveCompanyDomain filters recipients, and a polluted registry
  // row is filtered below.
  let companyDomain = company.domain;
  if (!companyDomain) {
    let candidate: string | null;
    if (confirmedDomain !== undefined) {
      candidate = confirmedDomain;
    } else {
      const { data: registry } = await supabase
        .from('inv_companies')
        .select('domain')
        .eq('id', company.company_id)
        .maybeSingle();
      const registryDomain =
        registry?.domain && !isFreemailDomain(registry.domain)
          ? registry.domain
          : null;
      candidate = registryDomain ?? deriveCompanyDomain(recipientEmails);
    }
    if (candidate) {
      // `is null` guards a concurrent first request from overwriting the domain;
      // a returned row proves this update won. Losing the race means another
      // request pinned a domain first — report what's persisted, not the local
      // candidate, so the share-link wording matches the actual gate.
      const { data: updated, error: domainError } = await supabase
        .from('inv_company')
        .update({ domain: candidate })
        .eq('id', company.id)
        .is('domain', null)
        .select('domain')
        .maybeSingle();
      if (domainError) {
        logger.error(
          { domainError, companyId: company.id },
          'Failed to store company domain',
        );
      } else if (updated) {
        companyDomain = candidate;
      } else {
        const { data: current } = await supabase
          .from('inv_company')
          .select('domain')
          .eq('id', company.id)
          .maybeSingle();
        companyDomain = current?.domain ?? null;
      }
    }
  }

  // Recipients are optional so the share link alone can be sent from the
  // investor's own email client — but only when the request stays reachable:
  // someone invited, someone already on it, or a pinned domain for
  // self-signup. Otherwise the link would admit nobody.
  if (!recipientEmails.length && !priorEmails.size && !companyDomain) {
    return { error: 'Add at least one recipient.' };
  }

  // Re-requesting the same company+period+type reuses (and reopens) the request
  // rather than minting a duplicate; submitted_at is cleared so it's pending again.
  // NULLS NOT DISTINCT on the unique constraint makes annual (null quarter) requests
  // deduplicate the same way quarterly ones do.
  const { data: request, error } = await supabase
    .from('inv_reporting_request')
    .upsert(
      {
        organization_id: organizationId,
        company_id: v.companyId,
        request_type: v.requestType,
        period_year: v.periodYear,
        period_quarter: v.periodQuarter,
        message: v.message?.trim() || null,
        status: 'sent',
        sent_by: userId,
        sent_at: new Date().toISOString(),
        submitted_at: null,
      },
      { onConflict: 'company_id,period_year,period_quarter,request_type' },
    )
    .select('id, public_id')
    .single();

  if (error || !request) {
    logger.error({ error, companyId: v.companyId }, 'Failed to create request');
    return { error: 'Failed to create the request.' };
  }

  // Replace any prior field/document selection from an earlier request.
  const { error: clearKpiError } = await supabase
    .from('inv_reporting_request_kpi')
    .delete()
    .eq('request_id', request.id);
  const { error: clearDocError } = await supabase
    .from('inv_reporting_request_document')
    .delete()
    .eq('request_id', request.id);
  if (clearKpiError || clearDocError) {
    logger.error(
      { clearKpiError, clearDocError, requestId: request.id },
      'Failed to clear prior request selections',
    );
    return { error: 'Failed to update the request.' };
  }

  // A request stores whatever was selected, independent of its primary type: a
  // KPI request may also carry documents. The portco app renders each section by
  // the rows that exist, so both sets travel on one request.
  if (v.kpiIds?.length) {
    const rows = v.kpiIds.map((id, i) => ({
      organization_id: organizationId,
      request_id: request.id,
      kpi_id: id,
      sort_order: i,
    }));
    const { error: kpiError } = await supabase
      .from('inv_reporting_request_kpi')
      .insert(rows);
    if (kpiError) {
      logger.error({ kpiError, requestId: request.id }, 'Failed KPI rows');
      return { error: 'Failed to save the requested KPIs.' };
    }
  }

  const typeRows = (v.docTypeIds ?? []).map((id, i) => ({
    organization_id: organizationId,
    request_id: request.id,
    doc_type_id: id,
    custom_doc_type: null,
    sort_order: i,
  }));
  const customRows = (v.customDocLabels ?? [])
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label, i) => ({
      organization_id: organizationId,
      request_id: request.id,
      doc_type_id: null,
      custom_doc_type: label,
      sort_order: (v.docTypeIds?.length ?? 0) + i,
    }));
  const docRows = [...typeRows, ...customRows];
  if (docRows.length) {
    const { error: docError } = await supabase
      .from('inv_reporting_request_document')
      .insert(docRows);
    if (docError) {
      logger.error({ docError, requestId: request.id }, 'Failed doc rows');
      return { error: 'Failed to save the requested documents.' };
    }
  }

  // An empty submitted list means "share-link only": whatever recipients the
  // request already has are left untouched, so this whole section is skipped.
  let emailed = false;
  if (recipientEmails.length) {
    // Recipients already on the request (priorEmails) keep their access but
    // aren't re-emailed; only newly added recipients get notified.
    // Provision every recipient BEFORE touching the stored rows, so a
    // provisioning/email failure can never leave the request with no recipient
    // able to fulfil it.
    const provisioned: { email: string; userId: string; notified: boolean }[] =
      [];
    for (const email of recipientEmails) {
      const notify = !priorEmails.has(email);
      const result = await provisionAndEmailRecipient({
        organizationId,
        companyId: v.companyId,
        recipientEmail: email,
        publicId: request.public_id,
        requestType: v.requestType,
        includesDocuments: docRows.length > 0,
        periodLabel: formatPeriodLabel(v.periodQuarter, v.periodYear),
        message: v.message?.trim() || null,
        senderId: userId,
        senderName,
        notify,
      });
      if (result)
        provisioned.push({ email, userId: result.userId, notified: notify });
    }

    // Recipients were requested and NONE could be provisioned: fail rather
    // than report success on a request whose invites all silently vanished
    // (on a fresh request with no domain, nobody could even open it).
    // Returning before the delete below also keeps any existing recipients.
    if (provisioned.length === 0) {
      logger.error(
        { requestId: request.id, priorRecipients: priorEmails.size },
        'No recipients could be provisioned',
      );
      return { error: 'Could not provision any recipient for this request.' };
    }

    // Replace the recipient list only after provisioning resolved.
    const { error: clearError } = await supabase
      .from('inv_reporting_request_recipient')
      .delete()
      .eq('request_id', request.id);
    if (clearError) {
      logger.error(
        { clearError, requestId: request.id },
        'Failed to clear prior recipients',
      );
      return { error: 'Failed to update the request recipients.' };
    }

    const { error: insertRecipientError } = await supabase
      .from('inv_reporting_request_recipient')
      .insert(
        provisioned.map((p) => ({
          organization_id: organizationId,
          request_id: request.id,
          email: p.email,
          user_id: p.userId,
          invited_by: userId,
        })),
      );
    if (insertRecipientError) {
      logger.error(
        { insertRecipientError, requestId: request.id },
        'Failed to insert recipients',
      );
      return { error: 'Failed to update the request recipients.' };
    }

    emailed = provisioned.some((p) => p.notified);
  }

  await logKpiEvent({
    companyId: v.companyId,
    organizationId,
    actorUserId: userId,
    eventType: 'request_sent',
    payload: {
      requestType: v.requestType,
      periodYear: v.periodYear,
      periodQuarter: v.periodQuarter,
      recipients: recipientEmails,
      kpiCount: v.kpiIds?.length ?? 0,
      docCount: docRows.length,
    },
  });

  return {
    publicId: request.public_id,
    emailed,
    companyDomain,
  };
}

export async function addReportingRequestRecipient(
  publicId: string,
  newEmail: string,
  caller: ReportingCaller,
): Promise<{ ok: true } | { error: string }> {
  const email = newEmail.trim().toLowerCase();
  if (!email) return { error: 'Email is required.' };
  if (!z.email().safeParse(email).success)
    return { error: 'Enter a valid email address.' };
  if (isFreemailEmail(email)) {
    return {
      error: `${email} is a personal email address. Recipients need a work email.`,
    };
  }

  const supabase = await createClient();
  const { userId, organizationId, senderName } = caller;

  const { data: req } = await supabase
    .from('inv_reporting_request')
    .select(
      'id, company_id, request_type, period_year, period_quarter, message, inv_reporting_request_document(count)',
    )
    .eq('public_id', publicId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!req) return { error: 'Request not found.' };

  const includesDocuments =
    (req.inv_reporting_request_document?.[0]?.count ?? 0) > 0;
  const result = await provisionAndEmailRecipient({
    organizationId,
    companyId: req.company_id,
    recipientEmail: email,
    publicId,
    requestType: req.request_type as 'kpi' | 'reporting_pack',
    includesDocuments,
    periodLabel: formatPeriodLabel(req.period_quarter, req.period_year),
    message: req.message ?? null,
    senderId: userId,
    senderName,
    notify: true,
    variant: 'shared',
  });
  if (!result) return { error: 'Failed to add the recipient.' };

  const { error: rowError } = await supabase
    .from('inv_reporting_request_recipient')
    .upsert(
      {
        organization_id: organizationId,
        request_id: req.id,
        email,
        user_id: result.userId,
        invited_by: userId,
      },
      { onConflict: 'request_id,email' },
    );
  if (rowError) {
    logger.error({ rowError, publicId }, 'Failed to record recipient');
    return { error: 'Failed to record the recipient.' };
  }

  await logKpiEvent({
    companyId: req.company_id,
    organizationId,
    actorUserId: userId,
    eventType: 'recipient_added',
    payload: {
      email,
      requestType: req.request_type as 'kpi' | 'reporting_pack',
      periodYear: req.period_year,
      periodQuarter: req.period_quarter,
    },
  });

  return { ok: true };
}

export async function removeReportingRequestRecipient(
  publicId: string,
  email: string,
  caller: ReportingCaller,
): Promise<{ ok: true } | { error: string }> {
  const target = email.trim().toLowerCase();
  const supabase = await createClient();
  const { organizationId } = caller;

  const { data: req } = await supabase
    .from('inv_reporting_request')
    .select('id')
    .eq('public_id', publicId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!req) return { error: 'Request not found.' };

  // A request must keep at least one recipient, or no one can fulfil it.
  const { data: current } = await supabase
    .from('inv_reporting_request_recipient')
    .select('email')
    .eq('request_id', req.id);
  const others = (current ?? []).filter(
    (r) => r.email.trim().toLowerCase() !== target,
  );
  if (others.length === 0) {
    return { error: 'Cannot remove the last recipient.' };
  }

  const { error } = await supabase
    .from('inv_reporting_request_recipient')
    .delete()
    .eq('request_id', req.id)
    .eq('email', target);
  if (error) {
    logger.error({ error, publicId }, 'Failed to remove recipient');
    return { error: 'Failed to remove the recipient.' };
  }

  // Company ACL is intentionally left intact: it may back other requests/periods.
  return { ok: true };
}

// Nudges every recipient of a still-unstarted request. The reminder email
// deliberately carries a plain link (no magic-link token): reminders can be
// sent repeatedly, and each magic link would invalidate the previous one and
// sign the recipient in without a password from an aging email.
export async function sendReportingRequestReminder(
  publicId: string,
  caller: ReportingCaller,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { organizationId, senderName } = caller;

  const { data: req } = await supabase
    .from('inv_reporting_request')
    .select(
      `
        id,
        company_id,
        request_type,
        period_year,
        period_quarter,
        status,
        sent_at,
        last_reminder_at,
        inv_reporting_request_document ( count ),
        inv_reporting_request_recipient ( email )
      `,
    )
    .eq('public_id', publicId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!req) return { error: 'Request not found.' };
  if (req.status !== 'sent') {
    return { error: 'This request is no longer pending.' };
  }

  let draftQuery = supabase
    .from('inv_reporting_submission')
    .select('inv_kpi_value(count), inv_reporting_document(count)')
    .eq('company_id', req.company_id)
    .eq('type', req.request_type)
    .eq('period_year', req.period_year)
    .neq('status', 'submitted');
  draftQuery =
    req.period_quarter === null
      ? draftQuery.is('period_quarter', null)
      : draftQuery.eq('period_quarter', req.period_quarter);
  const { data: draft } = await draftQuery.maybeSingle();
  const filledCount =
    req.request_type === 'kpi'
      ? (draft?.inv_kpi_value?.[0]?.count ?? 0)
      : (draft?.inv_reporting_document?.[0]?.count ?? 0);

  if (
    !canSendReminder({
      sentAt: req.sent_at,
      lastReminderAt: req.last_reminder_at,
      filledCount,
    })
  ) {
    return { error: 'A reminder is not available for this request yet.' };
  }

  const recipients = (req.inv_reporting_request_recipient ?? []).map(
    (r) => r.email,
  );
  if (!recipients.length) return { error: 'This request has no recipients.' };

  const portcoUrl = process.env.NEXT_PUBLIC_PORTCO_APP_URL;
  if (!portcoUrl) {
    logger.error('NEXT_PUBLIC_PORTCO_APP_URL is not set; cannot send reminder');
    return { error: 'Reminders are not configured.' };
  }

  const admin = createServiceClient();
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();
  const orgName = org?.name ?? null;
  const { cleanName, senderLabel, fromName } = senderIdentity(
    senderName,
    orgName,
  );

  const requestType = req.request_type as 'kpi' | 'reporting_pack';
  const includesDocuments =
    requestType === 'kpi' &&
    (req.inv_reporting_request_document?.[0]?.count ?? 0) > 0;
  const periodLabel = formatPeriodLabel(req.period_quarter, req.period_year);
  const noun =
    requestType === 'kpi'
      ? includesDocuments
        ? 'KPIs and documents'
        : 'KPIs'
      : 'reporting pack';
  const actionUrl = `${portcoUrl}/requests/${publicId}`;

  // One email per recipient so addresses aren't disclosed to each other,
  // matching the request/share emails.
  const resend = new Resend(process.env.RESEND_API_KEY);
  const results = await Promise.all(
    recipients.map((to) =>
      resend.emails.send({
        from: `${fromName} <noreply@postsig.com>`,
        to: [to],
        subject: `Reminder: ${senderLabel} is waiting on your ${noun} for ${periodLabel}`,
        react: ReportingReminderEmail({
          senderName: cleanName,
          senderOrg: orgName,
          periodLabel,
          requestType,
          includesDocuments,
          actionUrl,
        }) as ReactElement,
      }),
    ),
  );
  const emailErrors = results.filter((r) => r.error).map((r) => r.error);
  if (emailErrors.length === recipients.length) {
    logger.error({ emailErrors, publicId }, 'Failed to send reminder emails');
    return { error: 'Failed to send the reminder.' };
  }
  if (emailErrors.length) {
    logger.error(
      { emailErrors, publicId },
      'Some reminder emails failed to send',
    );
  }

  const { error: stampError } = await supabase
    .from('inv_reporting_request')
    .update({ last_reminder_at: new Date().toISOString() })
    .eq('id', req.id);
  if (stampError) {
    // The email went out; a failed stamp only re-opens the button early.
    logger.error({ stampError, publicId }, 'Failed to record reminder time');
  }

  await logKpiEvent({
    companyId: req.company_id,
    organizationId,
    actorUserId: caller.userId,
    eventType: 'reminder_sent',
    payload: {
      requestType,
      periodYear: req.period_year,
      periodQuarter: req.period_quarter,
    },
  });

  return { ok: true };
}
