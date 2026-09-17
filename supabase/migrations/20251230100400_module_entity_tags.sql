-- Module Entity Tags: Junction table for tagging module_entities
-- Follows contract_tags pattern with org-scoped RLS

CREATE TABLE "public"."module_entity_tags" (
    "id" SERIAL PRIMARY KEY,
    "entity_id" BIGINT NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entity_id, tag_id)
);

CREATE INDEX idx_module_entity_tags_entity_id ON public.module_entity_tags USING btree (entity_id);
CREATE INDEX idx_module_entity_tags_tag_id ON public.module_entity_tags USING btree (tag_id);

ALTER TABLE "public"."module_entity_tags"
    ADD CONSTRAINT "module_entity_tags_entity_id_fkey"
    FOREIGN KEY (entity_id) REFERENCES module_entities(id) ON DELETE CASCADE;

ALTER TABLE "public"."module_entity_tags"
    ADD CONSTRAINT "module_entity_tags_tag_id_fkey"
    FOREIGN KEY (tag_id) REFERENCES user_tags(id) ON DELETE CASCADE;

ALTER TABLE "public"."module_entity_tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_entity_tags_select" ON public.module_entity_tags
    FOR SELECT
    TO authenticated
    USING (
        entity_id IN (
            SELECT me.id FROM module_entities me
            WHERE me.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_entity_tags_insert" ON public.module_entity_tags
    FOR INSERT
    TO authenticated
    WITH CHECK (
        entity_id IN (
            SELECT me.id FROM module_entities me
            WHERE me.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_entity_tags_delete" ON public.module_entity_tags
    FOR DELETE
    TO authenticated
    USING (
        entity_id IN (
            SELECT me.id FROM module_entities me
            WHERE me.organization_id IN (
                SELECT u.organization_id FROM users u WHERE u.id = auth.uid()
            )
        )
    );

CREATE POLICY "module_entity_tags_anon_deny" ON public.module_entity_tags
    FOR ALL
    TO anon
    USING (false);

CREATE TRIGGER audit_module_entity_tags_trigger
    AFTER INSERT OR DELETE OR UPDATE
    ON public.module_entity_tags
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON TABLE "public"."module_entity_tags" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON TABLE "public"."module_entity_tags" TO "service_role";
