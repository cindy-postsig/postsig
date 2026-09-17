-- Add stock_option_plan document type (ID 41)

INSERT INTO "public"."document_types" ("id", "module_id", "code", "name", "description") VALUES
(41, 2, 'stock_option_plan', 'Stock Option Plan', 'Stock option / equity incentive plan documents — the plan establishing the rules, limits and mechanics governing equity awards to employees, directors and consultants, including plan identity and authorization, share reserve and evergreen provisions, permitted award types and eligibility, exercise price standards, vesting and post-termination exercise windows, change of control treatment, and plan administration')
ON CONFLICT (module_id, code) DO NOTHING;

-- Reset sequence to match highest ID
SELECT setval(pg_get_serial_sequence('document_types', 'id'), 41);
