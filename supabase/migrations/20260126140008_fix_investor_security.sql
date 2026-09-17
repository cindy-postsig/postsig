ALTER TABLE investor_security
  ADD CONSTRAINT investor_security_entity_series_unique
  UNIQUE NULLS NOT DISTINCT (entity_id, series_name);