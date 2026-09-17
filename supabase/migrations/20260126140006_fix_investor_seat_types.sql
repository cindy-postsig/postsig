INSERT INTO public.investor_seat_types (code, label)
VALUES
  ('INVESTOR', 'INVESTOR'),
  ('COMMON',   'COMMON'),
  ('INDEPENDENT', 'INDEPENDENT'),
  ('CEO', 'CEO')
ON CONFLICT DO NOTHING; 