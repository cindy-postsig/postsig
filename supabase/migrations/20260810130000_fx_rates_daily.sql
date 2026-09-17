-- PSK-1796: daily USD-based FX rates.
--
-- Organizations can pick a base display currency (USD or EUR), so spend and
-- invoice surfaces need historical rates, not just today's: a monthly figure
-- must be converted at the rates that applied in that month, and a dated
-- amount at the rate of its own date.
--
-- Historical rates are immutable public data, so they are stored rather than
-- cached: a row, once written, is never recomputed and never expires. The
-- store is read-through — reads hit this table first and only the missing
-- spans are fetched from the rate provider and upserted.
--
-- rate = quote-currency units per 1 USD on rate_date (the provider's value
-- with base_currency=USD). USD itself is never stored; it is the identity.
--
-- Days may legitimately be absent (provider gaps); consumers treat a missing
-- day as "no rate" and fall back rather than interpolating.

-- The store writes with ON CONFLICT DO UPDATE, so rows are deliberately
-- rewritable and no insert-only trigger guards them: a re-fetch of a day the
-- provider has since corrected must be allowed to land. The CHECK constraints
-- below are the guard instead — they reject the shapes that would silently
-- corrupt conversion (a lowercase or non-ISO quote splitting the key space, a
-- stored USD identity row, a zero or negative multiplier).
CREATE TABLE IF NOT EXISTS public.fx_rates_daily (
    rate_date  date NOT NULL,
    quote      text NOT NULL CHECK (quote ~ '^[A-Z]{3}$' AND quote <> 'USD'),
    rate       numeric NOT NULL CHECK (rate > 0),

    PRIMARY KEY (rate_date, quote)
);

COMMENT ON TABLE public.fx_rates_daily IS 'Daily USD-based FX rates backing base-currency conversion (PSK-1796). Immutable historical data, written by the read-through store in lib/v2/core/fxRates.ts.';
COMMENT ON COLUMN public.fx_rates_daily.rate_date IS 'UTC date the rate applied to';
COMMENT ON COLUMN public.fx_rates_daily.quote IS 'Uppercase ISO 4217 code of the quote currency; USD is never stored (identity)';
COMMENT ON COLUMN public.fx_rates_daily.rate IS 'Quote-currency units per 1 USD on rate_date';

-- Reference data with no org scope. Reads and writes both go through the
-- service role (the store runs server-side only), so RLS is enabled with no
-- policies at all: authenticated and anon see nothing, the service role
-- bypasses RLS.
ALTER TABLE public.fx_rates_daily ENABLE ROW LEVEL SECURITY;
