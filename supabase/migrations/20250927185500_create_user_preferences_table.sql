-- Create user_preferences table for scalable notification preferences
create table "public"."user_preferences" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null,
  "preference_key" text not null,
  "preference_value" jsonb not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

-- Create primary key
alter table "public"."user_preferences" enable row level security;

-- Add primary key constraint
alter table "public"."user_preferences" add constraint "user_preferences_pkey" primary key ("id");

-- Add foreign key constraint
alter table "public"."user_preferences" add constraint "user_preferences_user_id_fkey" foreign key ("user_id") references "public"."users"("id") on delete cascade;

-- Add unique constraint to prevent duplicate preference keys per user
alter table "public"."user_preferences" add constraint "user_preferences_user_id_preference_key_key" unique ("user_id", "preference_key");

-- Create indexes for performance
create index "user_preferences_user_id_idx" on "public"."user_preferences" using btree ("user_id");
create index "user_preferences_preference_key_idx" on "public"."user_preferences" using btree ("preference_key");

-- Add RLS policies
create policy "Users can view their own preferences" on "public"."user_preferences"
  for select using (auth.uid() = user_id);

create policy "Users can insert their own preferences" on "public"."user_preferences"
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own preferences" on "public"."user_preferences"
  for update using (auth.uid() = user_id);

create policy "Users can delete their own preferences" on "public"."user_preferences"
  for delete using (auth.uid() = user_id);

-- Create function to update updated_at timestamp
create or replace function update_user_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger trigger_update_user_preferences_updated_at
  before update on "public"."user_preferences"
  for each row execute function update_user_preferences_updated_at();