alter table "public"."investor_closing" alter column "close_date" set not null;

alter table "public"."investor_closing_participant" alter column "security_id" set not null;

alter table "public"."investor_position_lot" alter column "acquired_date" set not null;

alter table "public"."investor_position_lot" alter column "source_closing_id" set not null;

alter table "public"."investor_security" alter column "security_type" set not null;

alter table "public"."investor_security_terms_version" alter column "effective_date" set not null;

CREATE UNIQUE INDEX investor_board_representation_unique ON public.investor_board_representation USING btree (entity_id, party_id);

CREATE UNIQUE INDEX investor_closing_event_date_label_unique ON public.investor_closing USING btree (event_id, close_date);

CREATE UNIQUE INDEX investor_closing_participant_unique ON public.investor_closing_participant USING btree (closing_id, party_id, security_id);

CREATE UNIQUE INDEX investor_party_org_name_unique ON public.investor_party USING btree (organization_id, name);

CREATE UNIQUE INDEX investor_position_lot_unique ON public.investor_position_lot USING btree (party_id, security_id, acquired_date, source_closing_id);

CREATE UNIQUE INDEX investor_security_terms_version_unique ON public.investor_security_terms_version USING btree (security_id, effective_date);

alter table "public"."investor_board_representation" add constraint "investor_board_representation_unique" UNIQUE using index "investor_board_representation_unique";

alter table "public"."investor_closing" add constraint "investor_closing_event_date_label_unique" UNIQUE using index "investor_closing_event_date_label_unique";

alter table "public"."investor_closing_participant" add constraint "investor_closing_participant_unique" UNIQUE using index "investor_closing_participant_unique";

alter table "public"."investor_party" add constraint "investor_party_org_name_unique" UNIQUE using index "investor_party_org_name_unique";

alter table "public"."investor_position_lot" add constraint "investor_position_lot_unique" UNIQUE using index "investor_position_lot_unique";

alter table "public"."investor_security_terms_version" add constraint "investor_security_terms_version_unique" UNIQUE using index "investor_security_terms_version_unique";


