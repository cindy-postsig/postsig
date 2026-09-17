-- Enable ltree extension
CREATE EXTENSION IF NOT EXISTS ltree;

-- Drop existing tables if needed
DROP TABLE IF EXISTS folder_contracts CASCADE;
DROP TABLE IF EXISTS folders CASCADE;

-- Create folders table
CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  path ltree NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),

  CONSTRAINT folders_organization_name_parent_unique UNIQUE (organization_id, parent_id, name)
);

-- Create folder_contracts junction table
CREATE TABLE folder_contracts (
  folder_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  contract_id bigint REFERENCES contracts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (folder_id, contract_id)
);

-- Indexes for folders
CREATE INDEX idx_folders_path ON folders USING gist(path);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_org ON folders(organization_id);

-- Indexes for folder_contracts
CREATE INDEX idx_folder_contracts_folder ON folder_contracts(folder_id);
CREATE INDEX idx_folder_contracts_contract ON folder_contracts(contract_id);

-- Trigger function: Set path when inserting new folder
CREATE OR REPLACE FUNCTION set_path_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  parent_path ltree;
BEGIN
  IF NEW.parent_id IS NULL THEN
    -- Root folder: path is just the folder's id (remove hyphens for ltree)
    NEW.path = text2ltree(replace(NEW.id::text, '-', '_'));
  ELSE
    -- Get parent's path and append this folder's id (remove hyphens for ltree)
    SELECT path INTO parent_path
    FROM folders
    WHERE id = NEW.parent_id;

    NEW.path = parent_path || text2ltree(replace(NEW.id::text, '-', '_'));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Set path after insert
CREATE TRIGGER trigger_set_path_after_insert
BEFORE INSERT ON folders
FOR EACH ROW
EXECUTE FUNCTION set_path_after_insert();

-- Trigger function: Update entire subtree when folder is moved (reparented)
CREATE OR REPLACE FUNCTION reparent_update_subtree()
RETURNS TRIGGER AS $$
DECLARE
  old_path ltree;
  new_path ltree;
  parent_path ltree;
BEGIN
  -- Only run if parent_id actually changed
  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    old_path = OLD.path;

    -- Calculate new path for this folder (remove hyphens for ltree)
    IF NEW.parent_id IS NULL THEN
      new_path = text2ltree(replace(NEW.id::text, '-', '_'));
    ELSE
      SELECT path INTO parent_path
      FROM folders
      WHERE id = NEW.parent_id;

      new_path = parent_path || text2ltree(replace(NEW.id::text, '-', '_'));
    END IF;

    -- Update this folder's path
    NEW.path = new_path;

    -- Update all descendants' paths
    UPDATE folders
    SET path = new_path || subpath(path, nlevel(old_path))
    WHERE path <@ old_path
    AND id != NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Reparent and update subtree
CREATE TRIGGER trigger_reparent_update_subtree
BEFORE UPDATE OF parent_id ON folders
FOR EACH ROW
EXECUTE FUNCTION reparent_update_subtree();

alter table "public"."folders" enable row level security;

alter table "public"."folder_contracts" enable row level security;

grant select on table "public"."folders" to "authenticated";

grant insert on table "public"."folders" to "authenticated";

grant all on table "public"."folders" to "service_role";

grant select on table "public"."folder_contracts" to "authenticated";

grant insert on table "public"."folder_contracts" to "authenticated";

grant all on table "public"."folder_contracts" to "service_role";

-- RLS Policies for folders
create policy "Users can view folders in their organization"
on "public"."folders"
as permissive
for select
to authenticated
using (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

create policy "Users can create folders in their organization"
on "public"."folders"
as permissive
for insert
to authenticated
with check (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);
