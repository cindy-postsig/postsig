// Warning: This is a superuser access.  Will bypass RLS, and has no user attached to it.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/database.types';

export const createClient = () => {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
};
