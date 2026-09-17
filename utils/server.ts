'use server';

import { redirect } from 'next/navigation';
import { isValidInternalPath } from '@/lib/utils';

export async function redirectToPath(path: string) {
  if (!isValidInternalPath(path)) {
    throw new Error('Invalid redirect path');
  }
  return redirect(path);
}
