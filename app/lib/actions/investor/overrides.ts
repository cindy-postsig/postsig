'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';

import { userRoles } from '@/constants/data';
import {
  InvestorActivityType,
  InvestorValueOverrideCreatedActivityData,
  InvestorValueOverrideRevertedActivityData,
  InvestorStatusRecordCreatedActivityData,
} from '@/constants/types';
import { getUserMetadata } from '@/data/users';
import { logInvestorActivity } from '@/data/superuser/investor-activities';
import { getEditableField } from '@/lib/v2/inv/overrides/registry';
import {
  createOverrideViaDroid,
  revertOverrideViaDroid,
  updateFinancingRoundViaDroid,
} from '@/app/lib/investor/droid-client';
import type { Json } from '@/database.types';

const INVESTOR_WRITE_ROLES: ReadonlySet<number> = new Set([
  userRoles.clientSupervisor,
]);

/**
 * Result of a value-override write. Errors are returned (not thrown) so a
 * user-meaningful message reaches the client — Next.js redacts messages thrown
 * from server actions in production. Mirrors createReportingRequest.
 */
export type OverrideActionResult = { error: string } | { success: true };

type AuthedInvestor = Awaited<ReturnType<typeof getUserMetadata>>;

async function getAuthedInvestor(): Promise<
  { meta: NonNullable<AuthedInvestor> } | { error: string }
> {
  const meta = await getUserMetadata();
  if (!meta) {
    return { error: 'You are not signed in. Please refresh and try again.' };
  }
  if (!INVESTOR_WRITE_ROLES.has(meta.userRole)) {
    return { error: 'You do not have permission to edit these values.' };
  }
  return { meta };
}

/** Map an unknown thrown value (e.g. from the droid client) to a user message. */
function toUserMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Run a droid write, converting a thrown failure into a returnable result. */
async function runDroidWrite(
  write: () => Promise<void>,
  fallback: string,
): Promise<OverrideActionResult> {
  try {
    await write();
    return { success: true };
  } catch (error) {
    return { error: toUserMessage(error, fallback) };
  }
}

export interface CreateOverrideInput {
  entityType: string;
  entityId: number;
  fieldKey: string;
  originalValue: Json;
  overrideValue: Json;
  reason: string;
}

// Validate the runtime shape before any property access: this is a server
// action, so `input` is untrusted and may not match CreateOverrideInput.
// `originalValue`/`overrideValue` stay permissive here — the field rule below
// validates `overrideValue` against its real domain.
const createOverrideSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.number().int(),
  fieldKey: z.string().min(1),
  originalValue: z.unknown(),
  overrideValue: z.unknown(),
  reason: z.string(),
});

export async function createOverride(
  input: CreateOverrideInput,
): Promise<OverrideActionResult> {
  const authed = await getAuthedInvestor();
  if ('error' in authed) return authed;

  const validated = createOverrideSchema.safeParse(input);
  if (!validated.success) {
    return { error: 'Invalid override payload' };
  }
  input = validated.data as CreateOverrideInput;

  const fieldDef = getEditableField(input.entityType, input.fieldKey);
  if (!fieldDef) {
    return { error: 'This field cannot be edited.' };
  }

  const parsed = fieldDef.rule.safeParse(input.overrideValue);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? 'validation failed';
    const message = `Invalid value for ${fieldDef.label}: ${detail}`;
    return { error: message };
  }

  // Writes are mediated by droid: org + role are re-derived from the forwarded
  // token, the create is atomic (last-write-wins), and the action is logged.
  const result = await runDroidWrite(
    () =>
      createOverrideViaDroid({
        entityType: input.entityType,
        entityId: input.entityId,
        fieldKey: input.fieldKey,
        originalValue: input.originalValue,
        overrideValue: input.overrideValue,
        reason: input.reason.trim(),
      }),
    'Could not save the change.',
  );
  if ('error' in result) return result;

  after(() =>
    logInvestorActivity<InvestorValueOverrideCreatedActivityData>({
      entityId: input.entityId,
      activityType: InvestorActivityType.VALUE_OVERRIDE_CREATED,
      activityData: {
        entityType: input.entityType,
        entityId: input.entityId,
        fieldKey: input.fieldKey,
        originalValue: input.originalValue,
        overrideValue: input.overrideValue,
        reason: input.reason.trim(),
      },
    }),
  );

  revalidatePath('/investor', 'layout');
  return { success: true };
}

export interface CreateInvestorStatusRecordsInput {
  /** Owning company, used to scope the audit-log activity. */
  companyId: number;
  /** Existing round to attach the new sub-records to. */
  financingRoundId: number;
  effectiveDate: string;
  reason?: string;
  informationRights?: {
    isMajorInvestor: boolean;
    infoRightsForMajor: boolean;
    infoRightsForAll: boolean;
  };
  terms?: {
    proRataRightsMajor: boolean;
    proRataRightsAll: boolean;
  };
}

const createInvestorStatusRecordsSchema = z.object({
  companyId: z.number().int(),
  financingRoundId: z.number().int(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
  informationRights: z
    .object({
      isMajorInvestor: z.boolean(),
      infoRightsForMajor: z.boolean(),
      infoRightsForAll: z.boolean(),
    })
    .optional(),
  terms: z
    .object({
      proRataRightsMajor: z.boolean(),
      proRataRightsAll: z.boolean(),
    })
    .optional(),
});

/**
 * Create the Investor Status source rows (inv_information_rights /
 * inv_round_terms) for a company that has none yet, by upserting the nested
 * sub-records on an existing financing round via the droid financing-rounds
 * PATCH. Only the sub-records the caller supplies are written. Used by the
 * Overview Investor Status section's create-on-edit path.
 */
export async function createInvestorStatusRecords(
  input: CreateInvestorStatusRecordsInput,
): Promise<OverrideActionResult> {
  const authed = await getAuthedInvestor();
  if ('error' in authed) return authed;

  const validated = createInvestorStatusRecordsSchema.safeParse(input);
  if (!validated.success) {
    return { error: 'Invalid payload' };
  }
  const data = validated.data;

  if (!data.informationRights && !data.terms) {
    return { error: 'Nothing to create.' };
  }

  const terms = data.terms
    ? { effectiveDate: data.effectiveDate, ...data.terms }
    : undefined;
  const informationRights = data.informationRights
    ? { effectiveDate: data.effectiveDate, ...data.informationRights }
    : undefined;

  const result = await runDroidWrite(
    () =>
      updateFinancingRoundViaDroid(data.financingRoundId, {
        terms,
        informationRights,
      }),
    'Could not create the record.',
  );
  if ('error' in result) return result;

  const changes: InvestorStatusRecordCreatedActivityData['changes'] = [];
  if (data.informationRights) {
    if (data.informationRights.isMajorInvestor) {
      changes.push({
        entityType: 'inv_information_rights',
        fieldKey: 'is_major_investor',
        value: true,
      });
    }
    if (data.informationRights.infoRightsForMajor) {
      changes.push({
        entityType: 'inv_information_rights',
        fieldKey: 'info_rights_for_major',
        value: true,
      });
    }
    if (data.informationRights.infoRightsForAll) {
      changes.push({
        entityType: 'inv_information_rights',
        fieldKey: 'info_rights_for_all',
        value: true,
      });
    }
  }
  if (data.terms) {
    if (data.terms.proRataRightsMajor) {
      changes.push({
        entityType: 'inv_round_terms',
        fieldKey: 'pro_rata_rights_major',
        value: true,
      });
    }
    if (data.terms.proRataRightsAll) {
      changes.push({
        entityType: 'inv_round_terms',
        fieldKey: 'pro_rata_rights_all',
        value: true,
      });
    }
  }

  // Logged with entity_id = null (the new rows' ids are not returned by the
  // PATCH and are not module_entities ids); the owning company id lives in
  // activity_data so the feed's company-scoped query surfaces it.
  after(() =>
    logInvestorActivity<InvestorStatusRecordCreatedActivityData>({
      activityType: InvestorActivityType.INVESTOR_STATUS_RECORD_CREATED,
      activityData: {
        companyId: data.companyId,
        financingRoundId: data.financingRoundId,
        effectiveDate: data.effectiveDate,
        changes,
        ...(data.reason?.trim() ? { reason: data.reason.trim() } : {}),
      },
    }),
  );

  revalidatePath('/investor', 'layout');
  return { success: true };
}

export async function revertOverride(
  overrideId: string,
  entityId?: number,
): Promise<OverrideActionResult> {
  const authed = await getAuthedInvestor();
  if ('error' in authed) return authed;

  const result = await runDroidWrite(
    () => revertOverrideViaDroid(overrideId),
    'Could not revert the change.',
  );
  if ('error' in result) return result;

  after(() =>
    logInvestorActivity<InvestorValueOverrideRevertedActivityData>({
      entityId,
      activityType: InvestorActivityType.VALUE_OVERRIDE_REVERTED,
      activityData: { overrideId },
    }),
  );

  revalidatePath('/investor', 'layout');
  return { success: true };
}
