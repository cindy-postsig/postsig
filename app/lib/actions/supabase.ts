'use server';

import { createClient } from '@/utils/supabase/server';
import _ from 'lodash';
import {
  throwAuthenticationError,
  throwNotFoundError,
} from '../../../lib/errors';
import { auditLogger, getUserAuditContext } from '@/lib/audit';

export async function verifyUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throwAuthenticationError('User not found');
  return user;
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throwAuthenticationError('User not found');
  return user;
}

export async function insertVendorProduct(data: any) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throwAuthenticationError('User not found');
  const { data: insertData, error } = await supabase
    .from('vendor_products')
    .insert(data)
    .select();
  if (error) throw error;
  return insertData;
}

export async function getVendorProducts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throwAuthenticationError('User not found');
  const { data, error } = await supabase
    .from('vendor_products')
    .select('*')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
}

export async function findVendorProducts(vendor_id: number, user_id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throwAuthenticationError('User not found');
  const { data, error } = await supabase
    .from('vendor_products')
    .select('*')
    .eq('vendor_id', vendor_id)
    .eq('user_id', user_id);
  if (error) throw error;
  return data;
}

export async function insertContract(data: any) {
  const supabase = await createClient();
  const { id: userId } = await getUser();
  data.user_id = userId;
  const { data: insertData, error } = await supabase
    .from('contracts')
    .insert(data)
    .select();
  if (error) throw error;
  if (insertData.length > 0) {
    return insertData[0];
  }
  return null;
}

export async function insertContractDoc(data: any) {
  const supabase = await createClient();
  const { id: userId } = await getUser();
  data.user_id = userId;
  const { data: insertData, error } = await supabase
    .from('contract_docs')
    .insert(data)
    .select();
  if (error) throw error;
  return insertData;
}

export async function updateUserMetadata(data: any = {}) {
  const supabase = await createClient();
  const user = await verifyUser();
  const context = await getUserAuditContext();

  const sanitizedData = _.pick(data, ['show_ftux']);
  if (_.isEmpty(sanitizedData)) return;

  try {
    const { error } = await supabase.from('users').upsert({
      id: user?.id,
      ...sanitizedData,
      updated_at: new Date().toISOString(),
    } as any);

    if (error) throw error;

    // Log user metadata update
    await auditLogger.logUserEvent(
      'USER_PROFILE_UPDATE',
      user.id,
      context,
      undefined,
      sanitizedData,
    );
  } catch (error) {
    throw error;
  }
}

// Vendor Functions
export async function findVendors(vendorName: string) {
  const supabase = await createClient();
  const { id: userId } = await getUser();
  const { data, error } = await supabase
    .from('vendors')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', vendorName);
  if (error) throw error;
  return data;
}

export async function insertVendor(vendorName: string) {
  const supabase = await createClient();
  const { id: userId } = await getUser();
  const { data, error } = await supabase
    .from('vendors')
    // @ts-ignore - Supabase type inference issue
    .insert([
      {
        user_id: userId,
        name: vendorName,
      },
    ])
    .select();
  if (error) throw error;
  if (data.length > 0) return data[0];
  return null;
}

// User Functions
export async function updateUser(data: any) {
  const supabase = await createClient();
  const { id: userId } = await getUser();
  const context = await getUserAuditContext();

  // Get existing user data for audit trail
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  const { data: insertData, error } = await supabase
    .from('users')
    // @ts-ignore - Supabase type inference issue
    .update(data)
    .eq('id', userId)
    .select();

  if (error) throw error;

  // Log user profile update
  await auditLogger.logUserEvent(
    'USER_PROFILE_UPDATE',
    userId,
    context,
    existingUser || undefined,
    data,
  );

  return insertData;
}
