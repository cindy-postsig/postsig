INSERT INTO contract_statuses (id, name) VALUES
( 5, 'Uploaded'),
( 1, 'New'),
( 2, 'In Progress'),
( 3, 'Needs Approval'),
( 4, 'Published');

INSERT INTO contract_types (id, name) VALUES
( 1, 'Master Services Agreement'),
( 2, 'Service Order'),
( 3, 'Addendum'),
( 4, 'Other'),
( 5, 'TOS'),
( 6, 'Invoice'),
( 7, 'Trial Agreement'),
( 8, 'NDA');

insert into public.role_permissions (role, permission)
values
  ('admin', 'contracts.select'),
  ('admin', 'contracts.delete'),
  ('admin', 'contracts.update'),
  ('admin', 'contracts.insert'),
  ('admin', 'vendor_products.select'),
  ('admin', 'vendor_products.insert'),
  ('admin', 'vendor_products.delete'),
  ('admin', 'vendor_products.update'),
  ('admin', 'vendor_products_details.select'),
  ('admin', 'vendor_products_details.insert'),
  ('admin', 'vendor_products_details.update'),
  ('admin', 'vendor_products_details.delete'),
  ('extractor', 'contracts.select'),
  ('extractor', 'contracts.update'),
  ('extractor', 'vendor_products.select'),
  ('extractor', 'vendor_products.insert'),
  ('extractor', 'vendor_products.delete'),
  ('extractor', 'vendor_products.update'),
  ('extractor', 'vendor_products_details.select'),
  ('extractor', 'vendor_products_details.insert'),
  ('extractor', 'vendor_products_details.update'),
  ('extractor', 'vendor_products_details.delete');

  INSERT INTO roles (id, name, description) VALUES
    ( 1, 'Postsig Super Admin', NULL),
    ( 2, 'Postsig Admin', NULL),
    ( 3, 'Postsig User', NULL),
    ( 4, 'Postsig Developer', NULL),
    ( 5, 'Postsig QA', NULL),
    ( 6, 'Postsig Reviewer', NULL),
    ( 7, 'Postsig Extractor', NULL),
    ( 11, 'Client Admin', 'Can view all org contracts.'),
    ( 12, 'Client Supervisor', NULL),
    ( 13, 'Client Reviewer', NULL),
    ( 14, 'Client User', 'Can view their own contracts only.'),
    ( 15, 'Client Trial User', NULL);

  INSERT INTO data_delivery_types (id, name) VALUES
  (1, 'FTP'),
  (2, 'HTTP'),
  (3, 'API'),
  (4, 'Snowflake'),
  (5, 'Datafeed');

  INSERT INTO asset_classes (name) VALUES
  ('Equities'),
  ('Fixed Income'),
  ('Derivatives'),
  ('Foreign Exchange'),
  ('Commodities'),
  ('Real Estate'),
  ('Money Market Instruments'),
  ('Mutual Funds and Collective Investment Schemes'),
  ('Indices'),
  ('Alternative Investments'),
  ('Cryptocurrencies and Digital Assets'),
  ('Credit Instruments'),
  ('Structured Products'),
  ('Insurance Products'),
  ('ESG/Sustainability');

-- Insert sub-asset classes
WITH asset_class_ids AS (
    SELECT id, name FROM asset_classes
),
sub_assets AS (
    SELECT * FROM (VALUES
        -- Equities
        ('Equities', 'Common Stocks'),
        ('Equities', 'Preferred Stocks'),
        ('Equities', 'Exchange-Traded Funds'),
        ('Equities', 'ETFs'),
        ('Equities', 'American Depository Receipts'),
        ('Equities', 'ADRs'),
        ('Equities', 'Warrants and Rights'),

        -- Fixed Income
        ('Fixed Income', 'Government Bonds'),
        ('Fixed Income', 'U.S. Treasuries'),
        ('Fixed Income', 'Eurobonds'),
        ('Fixed Income', 'Corporate Bonds'),
        ('Fixed Income', 'Municipal Bonds'),
        ('Fixed Income', 'Sovereign Debt'),
        ('Fixed Income', 'Supranationals'),
        ('Fixed Income', 'Mortgage Backed Securities'),
        ('Fixed Income', 'MBS'),
        ('Fixed Income', 'Asset Backed Securities'),
        ('Fixed Income', 'ABS'),
        ('Fixed Income', 'Treasury Inflation Protected Securities'),
        ('Fixed Income', 'TIPS'),
        ('Fixed Income', 'Convertible Bonds'),

        -- Derivatives
        ('Derivatives', 'Equities Options'),
        ('Derivatives', 'Equity Options'),
        ('Derivatives', 'Index Options'),
        ('Derivatives', 'FX Options'),
        ('Derivatives', 'Interest Rate Options'),
        ('Derivatives', 'Futures'),
        ('Derivatives', 'Commodity Futures'),
        ('Derivatives', 'Financial Futures'),
        ('Derivatives', 'Swaps'),
        ('Derivatives', 'Interest Rate Swaps'),
        ('Derivatives', 'Credit Default Swaps'),
        ('Derivatives', 'CDS'),
        ('Derivatives', 'Forwards'),
        ('Derivatives', 'Currency Forwards'),
        ('Derivatives', 'Commodity Forwards'),
        ('Derivatives', 'Contracts for Difference'),
        ('Derivatives', 'CFDs'),

        -- Foreign Exchange
        ('Foreign Exchange', 'Spot FX'),
        ('Foreign Exchange', 'FX Forwards'),
        ('Foreign Exchange', 'FX Options'),
        ('Foreign Exchange', 'Currency Swaps'),

        -- Commodities
        ('Commodities', 'Energy'),
        ('Commodities', 'Oil'),
        ('Commodities', 'Natural Gas'),
        ('Commodities', 'Precious Metals'),
        ('Commodities', 'Gold'),
        ('Commodities', 'Silver'),
        ('Commodities', 'Platinum'),
        ('Commodities', 'Palladium'),
        ('Commodities', 'Industrial Metals'),
        ('Commodities', 'Copper'),
        ('Commodities', 'Aluminum'),
        ('Commodities', 'Agricultural Commodities'),
        ('Commodities', 'Wheat'),
        ('Commodities', 'Corn'),
        ('Commodities', 'Soybeans'),
        ('Commodities', 'FCOJ'),
        ('Commodities', 'Frozen Concentrated Orange Juice'),
        ('Commodities', 'Livestock'),
        ('Commodities', 'Cattle'),
        ('Commodities', 'Hogs'),
        ('Commodities', 'Soft Commodities'),
        ('Commodities', 'Coffee'),
        ('Commodities', 'Cotton'),
        ('Commodities', 'Sugar'),

        -- Real Estate
        ('Real Estate', 'Real Estate Investment Trusts'),
        ('Real Estate', 'REIT'),
        ('Real Estate', 'Commercial Real Estate'),
        ('Real Estate', 'Residential Real Estate'),

        -- Money Market Instruments
        ('Money Market Instruments', 'Treasury Bills'),
        ('Money Market Instruments', 'T-Bills'),
        ('Money Market Instruments', 'Commercial Paper'),
        ('Money Market Instruments', 'Certificates of Deposit'),
        ('Money Market Instruments', 'CD'),
        ('Money Market Instruments', 'Repurchase Agreements'),
        ('Money Market Instruments', 'Repos'),

        -- Mutual Funds and Collective Investment Schemes
        ('Mutual Funds and Collective Investment Schemes', 'Open-End Mutual Funds'),
        ('Mutual Funds and Collective Investment Schemes', 'Closed-End Funds'),
        ('Mutual Funds and Collective Investment Schemes', 'Hedge Funds'),
        ('Mutual Funds and Collective Investment Schemes', 'Unit Investment Trusts'),
        ('Mutual Funds and Collective Investment Schemes', 'UIT'),

        -- Indices
        ('Indices', 'Equity Market Indices'),
        ('Indices', 'Bond Market Indices'),
        ('Indices', 'Commodity Indices'),
        ('Indices', 'CRB Index'),
        ('Indices', 'Volatility Indices'),
        ('Indices', 'VIX'),

        -- Alternative Investments
        ('Alternative Investments', 'Private Equity'),
        ('Alternative Investments', 'Venture Capital'),
        ('Alternative Investments', 'Hedge Funds'),
        ('Alternative Investments', 'Infrastructure Funds'),
        ('Alternative Investments', 'Art'),
        ('Alternative Investments', 'Wine'),
        ('Alternative Investments', 'Collectibles'),

        -- Cryptocurrencies and Digital Assets
        ('Cryptocurrencies and Digital Assets', 'Bitcoin'),
        ('Cryptocurrencies and Digital Assets', 'BTC'),
        ('Cryptocurrencies and Digital Assets', 'Ethereum'),
        ('Cryptocurrencies and Digital Assets', 'ETH'),
        ('Cryptocurrencies and Digital Assets', 'Altcoins'),
        ('Cryptocurrencies and Digital Assets', 'Litecoin'),
        ('Cryptocurrencies and Digital Assets', 'Stablecoins'),
        ('Cryptocurrencies and Digital Assets', 'Non-fungible Tokens'),
        ('Cryptocurrencies and Digital Assets', 'NFT'),

        -- Credit Instruments
        ('Credit Instruments', 'Corporate Loans'),
        ('Credit Instruments', 'Syndicated Loans'),
        ('Credit Instruments', 'Collateralized Debt Obligations'),
        ('Credit Instruments', 'CDO'),

        -- Structured Products
        ('Structured Products', 'Collateralized Loan Obligations'),
        ('Structured Products', 'CLO'),
        ('Structured Products', 'Structured Notes'),

        -- Insurance Products
        ('Insurance Products', 'Life Insurance Contracts'),
        ('Insurance Products', 'Annuities'),
        ('Insurance Products', 'Catastrophe Bonds')
    ) AS sa(asset_name, sub_name)
)
INSERT INTO sub_asset_classes (parent_id, name)
SELECT ac.id, sa.sub_name
FROM sub_assets sa
JOIN asset_class_ids ac ON ac.name = sa.asset_name
WHERE NOT EXISTS (
    SELECT 1 FROM sub_asset_classes WHERE name = sa.sub_name
);
