-- Date format is now stored in the preferences tables:
--   organizations -> org_preferences (preference_key = 'regional.date_format')
--   users         -> user_preferences (preference_key = 'regional.date_format')
-- The org value is written by the admin app; drop the now-unused columns.

alter table organizations
  drop column date_format;

alter table users
  drop column date_format;
