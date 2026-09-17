'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';

import { userRoles } from '@/constants/data';
import {
  InvestorActivityType,
  InvestorValueOverrideCreatedActivityData,
  InvestorBoardSeatAddedActivityData,
  InvestorBoardSeatRemovedActivityData,
} from '@/constants/types';
import { getUserMetadata } from '@/data/users';
import { logInvestorActivity } from '@/data/superuser/investor-activities';
import { getEditableField } from '@/lib/v2/inv/overrides/registry';
import { createOverrideViaDroid } from '@/app/lib/investor/droid-client';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import type { Json } from '@/database.types';

const INVESTOR_WRITE_ROLES: ReadonlySet<number> = new Set([
  userRoles.clientSupervisor,
]);

export type BoardSeatUpdateResult =
  | { error: string }
  | { success: true; count: number };

export interface BoardSeatChange {
  seatId: number;
  fieldKey: string;
  originalValue: Json;
  overrideValue: Json;
}

const changeSchema = z.object({
  seatId: z.number().int().positive(),
  fieldKey: z.string().min(1),
  originalValue: z.unknown(),
  overrideValue: z.unknown(),
});

const inputSchema = z.object({
  changes: z.array(changeSchema).min(1).max(50),
  reason: z.string().max(500).default(''),
});

export async function updateBoardSeats(input: {
  changes: BoardSeatChange[];
  reason: string;
}): Promise<BoardSeatUpdateResult> {
  const meta = await getUserMetadata();
  if (!meta) {
    return { error: 'You are not signed in. Please refresh and try again.' };
  }
  if (!INVESTOR_WRITE_ROLES.has(meta.userRole)) {
    return { error: 'You do not have permission to edit board data.' };
  }

  const validated = inputSchema.safeParse(input);
  if (!validated.success) {
    return { error: 'Invalid payload.' };
  }

  const { changes, reason } = validated.data as {
    changes: BoardSeatChange[];
    reason: string;
  };

  // Validate each change against the field registry
  for (const change of changes) {
    const fieldDef = getEditableField('inv_board_seat', change.fieldKey);
    if (!fieldDef) {
      return { error: `Field "${change.fieldKey}" cannot be edited.` };
    }
    const parsed = fieldDef.rule.safeParse(change.overrideValue);
    if (!parsed.success) {
      const detail = parsed.error.issues[0]?.message ?? 'validation failed';
      return { error: `Invalid value for ${fieldDef.label}: ${detail}` };
    }
  }

  // Send each change to droid as a value override
  const errors: string[] = [];
  let successCount = 0;

  for (const change of changes) {
    try {
      await createOverrideViaDroid({
        entityType: 'inv_board_seat',
        entityId: change.seatId,
        fieldKey: change.fieldKey,
        originalValue: change.originalValue,
        overrideValue: change.overrideValue,
        reason: reason.trim(),
      });
      successCount++;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to save change';
      errors.push(`${change.fieldKey}: ${msg}`);
    }
  }

  if (errors.length > 0 && successCount === 0) {
    return { error: errors[0] };
  }

  // Log activity for all successful changes
  after(() => {
    for (const change of changes.slice(0, successCount)) {
      void logInvestorActivity<InvestorValueOverrideCreatedActivityData>({
        activityType: InvestorActivityType.VALUE_OVERRIDE_CREATED,
        activityData: {
          entityType: 'inv_board_seat',
          entityId: change.seatId,
          fieldKey: change.fieldKey,
          originalValue: change.originalValue,
          overrideValue: change.overrideValue,
          reason: reason.trim(),
        },
      });
    }
  });

  revalidatePath('/investor', 'layout');
  return { success: true, count: successCount };
}

// ---------------------------------------------------------------------------
// Add / remove board seats (direct Supabase row lifecycle, not overrides)
// ---------------------------------------------------------------------------

export type BoardSeatMutationResult =
  | { error: string }
  | { success: true; seatId: number };

const addSchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).nullable(),
  designatingFundId: z.number().int().positive().nullable(),
  kind: z.enum(['director', 'observer']),
});

export type AddBoardSeatInput = z.infer<typeof addSchema>;

const removeSchema = z.object({
  seatId: z.number().int().positive(),
  reason: z.string().max(500).default(''),
});

/**
 * Add a new board seat row for a company. `kind` maps to the seat_type CHECK
 * constraint: observers -> 'observer'; directors -> 'investor_designated' when
 * a designating fund is set, otherwise 'independent'.
 */
export async function addBoardSeat(
  input: AddBoardSeatInput & { reason?: string },
): Promise<BoardSeatMutationResult> {
  const meta = await getUserMetadata();
  if (!meta) {
    return { error: 'You are not signed in. Please refresh and try again.' };
  }
  if (!INVESTOR_WRITE_ROLES.has(meta.userRole)) {
    return { error: 'You do not have permission to edit board data.' };
  }

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Please complete all required fields.' };
  }
  const v = parsed.data;
  const reason = (input.reason ?? '').trim();

  const supabase = await createClient();

  // company_id is org-scoped by RLS; verify ownership before inserting.
  const { data: company } = await supabase
    .from('inv_company')
    .select('id')
    .eq('id', v.companyId)
    .eq('organization_id', meta.organizationId)
    .maybeSingle();
  if (!company) return { error: 'Company not found.' };

  const seatType =
    v.kind === 'observer'
      ? 'observer'
      : v.designatingFundId != null
        ? 'investor_designated'
        : 'independent';

  const { data, error } = await supabase
    .from('inv_board_seat')
    .insert({
      organization_id: meta.organizationId,
      company_id: v.companyId,
      holder_name: v.name,
      holder_title: v.title,
      designating_fund_id: v.designatingFundId,
      seat_type: seatType,
      effective_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error({ error, companyId: v.companyId }, 'Failed to add board seat');
    return { error: 'Failed to add the board seat.' };
  }

  const seatId = data.id;

  try {
    await logInvestorActivity<InvestorBoardSeatAddedActivityData>({
      activityType: InvestorActivityType.BOARD_SEAT_ADDED,
      activityData: {
        seatId,
        companyId: v.companyId,
        holderName: v.name,
        holderTitle: v.title,
        seatType,
        designatingFundId: v.designatingFundId,
        reason,
      },
    });
  } catch (activityError) {
    logger.error(
      { activityError, seatId, companyId: v.companyId },
      'Failed to log board seat added activity',
    );
  }

  revalidatePath('/investor', 'layout');
  return { success: true, seatId };
}

/**
 * Soft-delete a board seat by setting its end_date to today. The read layer
 * filters on `end_date IS NULL`, so the seat drops out of the active board
 * while history is preserved.
 */
export async function removeBoardSeat(input: {
  seatId: number;
  reason: string;
}): Promise<BoardSeatMutationResult> {
  const meta = await getUserMetadata();
  if (!meta) {
    return { error: 'You are not signed in. Please refresh and try again.' };
  }
  if (!INVESTOR_WRITE_ROLES.has(meta.userRole)) {
    return { error: 'You do not have permission to edit board data.' };
  }

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid payload.' };
  }
  const { seatId, reason } = parsed.data;

  const supabase = await createClient();

  // RLS scopes this to the caller's org; resolve fields for the audit entry.
  const { data: seat } = await supabase
    .from('inv_board_seat')
    .select('id, company_id, holder_name, seat_type, end_date')
    .eq('id', seatId)
    .eq('organization_id', meta.organizationId)
    .maybeSingle();
  if (!seat) return { error: 'Board seat not found.' };
  if (seat.end_date) return { error: 'Board seat is already removed.' };

  const { error } = await supabase
    .from('inv_board_seat')
    .update({ end_date: new Date().toISOString().slice(0, 10) })
    .eq('id', seatId)
    .eq('organization_id', meta.organizationId);

  if (error) {
    logger.error({ error, seatId }, 'Failed to remove board seat');
    return { error: 'Failed to remove the board seat.' };
  }

  try {
    await logInvestorActivity<InvestorBoardSeatRemovedActivityData>({
      activityType: InvestorActivityType.BOARD_SEAT_REMOVED,
      activityData: {
        seatId,
        companyId: seat.company_id,
        holderName: seat.holder_name,
        seatType: seat.seat_type,
        reason: reason.trim(),
      },
    });
  } catch (activityError) {
    logger.error(
      { activityError, seatId, companyId: seat.company_id },
      'Failed to log board seat removed activity',
    );
  }

  revalidatePath('/investor', 'layout');
  return { success: true, seatId };
}
