'use client';
import { createClient } from '@/utils/supabase/component';
import { unstable_noStore as noStore } from 'next/cache';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

// Storage Functions

export async function uploadFile(file: any, filePath: string) {
  const segments = filePath.split('/').filter(Boolean);
  let safePath: string;
  try {
    safePath = buildSafePath(segments);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new Error('Invalid file path');
    }
    throw error;
  }

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('contract_docs')
    .upload(safePath, file);
  if (error) throw error;
  return data;
}

export async function getUserInfo() {
  noStore();
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}
