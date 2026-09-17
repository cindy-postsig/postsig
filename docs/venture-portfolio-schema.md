# Venture Portfolio Company Schema

This document explains the database schema for how a portfolio company is structured across related tables.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PORTFOLIO COMPANY DATA MODEL                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐       ┌───────────────────┐       ┌─────────────────────┐
│  companies   │       │  module_entities  │       │   module_documents  │
│  (global)    │◄──────│  (org-scoped)     │◄──────│   (per entity)      │
└──────────────┘       └───────────────────┘       └─────────────────────┘
       │                       │                            │
       │                       │                            │
       ▼                       ▼                            ▼
 Basic company info     Portfolio company          Documents containing
 shared across orgs     within an org              extracted field values
                                                           │
                                                           │
                              ┌─────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────────┐      ┌──────────────────────────┐
                    │ document_field_values │──────│ master_field_definitions │
                    │ (EAV pattern)         │      │ (field schemas)          │
                    └───────────────────────┘      └──────────────────────────┘
```

## Table Details

### 1. `companies` (Global Entity)

Stores company information that's shared across all organizations.

| Column               | Purpose                              |
| -------------------- | ------------------------------------ |
| `id`                 | Primary key (bigint)                 |
| `name`               | Company name                         |
| `domain`             | Website domain (e.g., "dataflow.ai") |
| `industry`           | Industry classification              |
| `headquarters`       | Location                             |
| `legal_jurisdiction` | Incorporation jurisdiction           |
| `founded_year`       | Year founded                         |

**Example:** DataFlow AI exists once globally, even if multiple orgs invest in it.

---

### 2. `module_entities` (Org-Scoped Portfolio Company)

Links a company to an organization as a portfolio company.

| Column            | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `id`              | Internal primary key (bigint)                  |
| `public_id`       | UUID exposed to frontend (used in URLs)        |
| `organization_id` | Which org owns this portfolio entry            |
| `module_id`       | Always `2` for venture module                  |
| `company_id`      | FK to `companies.id`                           |
| `entity_type`     | Always `'portfolio_company'` for this use case |
| `name`            | Denormalized company name                      |
| `status`          | `'active'`, etc.                               |
| `metadata`        | JSONB for additional org-specific data         |

**Key Concept:** Same company can exist as different `module_entities` for different organizations (each with their own investment data).

---

### 3. `module_documents` (Documents Per Entity)

Documents associated with a portfolio company (IRA, Charter, SAFE, etc.).

| Column             | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `id`               | Primary key                                                     |
| `organization_id`  | Org that owns this document                                     |
| `module_id`        | `2` for venture                                                 |
| `document_type_id` | FK to `document_types` (charter, ira, safe_note, etc.)          |
| `entity_id`        | **FK to `module_entities.id`** - links doc to portfolio company |
| `status`           | `'processed'`, `'pending'`, etc.                                |
| `metadata`         | Document-specific metadata                                      |

---

### 4. `document_field_values` (EAV Pattern)

Stores all extracted/entered field values from documents.

| Column                | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `id`                  | Primary key                                           |
| `module_document_id`  | FK to `module_documents.id`                           |
| `field_definition_id` | FK to `master_field_definitions.id`                   |
| `value_text`          | Text values (stage, fund name, etc.)                  |
| `value_number`        | Numeric values (valuation, ownership %)               |
| `value_boolean`       | Boolean values (currently_raising, etc.)              |
| `value_date`          | Date values (entry_date, next_board_meeting)          |
| `value_json`          | Complex values (legal_terms, cap_table, transactions) |

**EAV Pattern:** One row per field value. Field type determined by `master_field_definitions.default_data_type`.

---

### 5. `master_field_definitions` (Field Schema)

Defines what fields exist and their types.

| Column                   | Purpose                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `id`                     | UUID primary key                                                                                |
| `field_key`              | Unique identifier (e.g., `'valuation'`, `'stage'`)                                              |
| `default_label`          | Display name (e.g., `'Valuation'`, `'Investment Stage'`)                                        |
| `default_data_type`      | `'text'`, `'number'`, `'currency'`, `'percentage'`, `'boolean'`, `'date'`, `'select'`, `'json'` |
| `category`               | Grouping: `'core'`, `'financials'`, `'ownership'`, `'legal'`, etc.                              |
| `default_select_options` | JSON array for select fields                                                                    |

---

## Query Path

To get a complete portfolio company:

```sql
-- 1. Start with module_entities (the portfolio company record)
SELECT * FROM module_entities
WHERE public_id = 'uuid-here'
  AND organization_id = 'org-uuid';

-- 2. Join to companies for basic info
JOIN companies ON module_entities.company_id = companies.id;

-- 3. Get all documents for this entity
SELECT * FROM module_documents WHERE entity_id = <module_entities.id>;

-- 4. Get all field values with their definitions
SELECT dfv.*, mfd.field_key, mfd.default_data_type
FROM document_field_values dfv
JOIN master_field_definitions mfd ON dfv.field_definition_id = mfd.id
WHERE dfv.module_document_id IN (<document_ids>);
```

---

## Example Data Flow

For DataFlow AI:

```
companies (id=1)
  └── name: "DataFlow AI"
  └── domain: "dataflow.ai"
  └── founded_year: 2022

module_entities (id=1, public_id='f2eb9b27-...')
  └── organization_id: 'e9262cc7-...'
  └── company_id: 1  ──────────────────► companies
  └── entity_type: 'portfolio_company'

module_documents (2 records)
  ├── IRA document (entity_id=1) ──────► module_entities
  │     └── field_values: legal_terms, info_rights, major_investor...
  │
  └── Charter document (entity_id=1)
        └── field_values: valuation, stage, cap_table, transactions...

document_field_values (28 records)
  ├── field_key='valuation', value_number=45000000
  ├── field_key='stage', value_text='Series A'
  ├── field_key='my_ownership', value_number=10.0
  ├── field_key='legal_terms', value_json={...complex object...}
  └── ...
```

---

## Document Types for Venture Module

| Code          | Name                      | Typical Fields Extracted                             |
| ------------- | ------------------------- | ---------------------------------------------------- |
| `charter`     | Charter / Amended Charter | cap_table, liquidation_preference, authorized_shares |
| `ira`         | Investor Rights Agreement | legal_terms (info rights, major investor, pro-rata)  |
| `voting`      | Voting Agreement          | drag_along, board composition                        |
| `rofr_cosale` | ROFR / Co-Sale            | rofr terms, co-sale rights                           |
| `safe_note`   | SAFE / Notes              | valuation_cap, discount, transactions                |
| `side_letter` | Side Letters              | custom terms overrides                               |
| `amendment`   | Amendments                | modifications to other docs                          |

---

## Field Categories

Fields in `master_field_definitions` are organized by category:

| Category       | Example Fields                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `core`         | stage, investment_status, cash_position, currently_raising, fund, tags                           |
| `financials`   | valuation, post_money_valuation, total_equity_financing, current_price_per_unit                  |
| `ownership`    | my_total_fmv, my_ownership, my_fully_diluted_percent, my_aggregate_cost, implied_value, multiple |
| `entry`        | my_entry_date, stage_at_entry, my_entry_cost, post_money_at_entry                                |
| `governance`   | board_of_directors, board_observers                                                              |
| `legal`        | legal_terms, major_investor_status, information_rights, anti_dilution_rights, etc.               |
| `cap_table`    | cap_table (JSON with snapshots)                                                                  |
| `transactions` | transactions (JSON array of investment history)                                                  |
