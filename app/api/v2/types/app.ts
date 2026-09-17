import { Hono } from 'hono';
import { UserMetadata } from '@/constants/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/database.types';

export interface AppVariables {
  userMetadata: UserMetadata;
  supabase: SupabaseClient<Database>;
}

export type AppContext = {
  Variables: AppVariables;
};

export type AppHono = Hono<AppContext>;
