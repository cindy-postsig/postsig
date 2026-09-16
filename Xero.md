# Xero Invoice Integration

This document explains the current Xero invoice reconciliation implementation in PostSig: how authentication is stored, how invoices are ingested through Nango, how invoice PDFs are uploaded into `contract_docs`, how AI extraction is triggered, and how invoice status updates are pushed back to Xero.

## Summary

The Xero integration uses Nango as the OAuth/proxy layer and stores the resulting connection per eligible user and provider. Invoice ingestion and status reconciliation run through Inngest every 2 hours and can also be triggered manually with the `integrations/sync-invoices` event.

At a high level:

1. A user connects Xero from Integration Settings.
2. PostSig stores the active Nango connection in `integration_connections`.
3. `sync-external-invoices` fetches Xero `ACCPAY` invoices in `SUBMITTED`
   status through Nango.
4. Each new invoice is stored as a PostSig `contracts` row with `type_id = 6`.
5. PostSig deduplicates/upserts the invoice before downloading the PDF.
6. If the invoice is new or missing its document, the invoice PDF is downloaded from Xero, uploaded to the `contract_docs` storage bucket, and inserted into the `contract_docs` table.
7. If the invoice is new or missing/failed extraction, `process-invoice-document` sanitizes the PDF and reuses the existing contract AI extraction event.
8. When a user updates an invoice status in PostSig, `sync-invoice-status-outbound` pushes supported status changes back to Xero.

## Main Files

- `lib/api/nango.ts`
  - Creates the Nango SDK client.
  - Defines provider ids: `xero` and `ramp`.

- `app/api/integrations/nango/connect/route.ts`
  - Creates a Nango Connect session for the authenticated user.

- `app/api/integrations/nango/callback/route.ts`
  - Saves or updates the current user's integration connection after Nango returns a connection id.

- `app/api/integrations/status/route.ts`
  - Reports whether the current user has an active connection.

- `utils/inngest/functions/syncExternalInvoices.ts`
  - Scheduled inbound invoice sync.
  - Current cron: `0 */2 * * *` (every 2 hours).
  - Also listens to `integrations/sync-invoices`.

- `lib/v2/integrations/invoice-sync/service.ts`
  - Fetches invoices.
  - Resolves Xero tenant id.
  - Downloads invoice PDFs.
  - Uploads PDFs to the `contract_docs` bucket.
  - Upserts invoice contracts.
  - Inserts `contract_docs` rows.
  - Writes sync logs.

- `lib/v2/integrations/invoice-sync/transforms.ts`
  - Maps Xero invoice payloads into the PostSig invoice-as-contract model.

- `utils/inngest/functions/processInvoiceDocument.ts`
  - Sanitizes the uploaded invoice PDF.
  - Triggers `contracts/extractcontract`.

- `utils/inngest/functions/syncInvoiceStatusOutbound.ts`
  - Handles PostSig invoice status changes and pushes them to the external provider.

- `lib/v2/integrations/invoice-sync/outbound.ts`
  - Contains the Xero status mapping and Xero-specific validation decisions.

## Database Changes

### `integration_connections`

Stores one connection per user and provider.

Important columns:

- `organization_id`
- `user_id`
- `provider`
- `nango_connection_id`
- `status`
- `connected_at`
- `disconnected_at`

Important constraint:

- Unique by `(user_id, provider)`.

This means multiple eligible users in the same organization can connect Xero,
but each user can have only one Xero connection row.

### Contract External Tracking

Adds external tracking to `contracts`:

- `external_source`
- `external_integration_connection_id`
- `external_invoice_id`
- `external_invoice_status`
- `decision_reason`
- `last_synced_at`

Important index:

- Unique partial index on `(organization_id, external_source, external_invoice_id)`.

This prevents duplicate PostSig invoice rows when the same Xero invoice is seen
across sync runs or across different user connections in the same organization.
The first imported contract keeps its `external_integration_connection_id`; a
different user connection that sees the same invoice skips the overlap instead
of taking over sync ownership.

`external_invoice_status` stores the latest known Xero invoice status, such as `AUTHORISED` or `VOIDED`.

Important note: outbound sync does not fully trust this local value. For void/reject operations, it fetches the latest invoice from Xero first because Xero status can change outside PostSig.

### Sync Logs

Stores inbound and outbound sync attempts.

Important columns:

- `organization_id`
- `user_id`
- `integration_connection_id`
- `provider`
- `sync_type`
- `status`
- `records_processed`
- `details`
- `error_details`
- `started_at`
- `completed_at`

`details` stores structured metadata for successful audit events, such as
invoice status changes. `error_details` is reserved for failures.

## Authentication Flow

1. User starts connection from Integration Settings.
2. Client calls `POST /api/integrations/nango/connect` with provider `xero`.
3. Server creates a Nango Connect session.
4. User completes the Xero OAuth flow in Nango.
5. Client sends the returned `connectionId` to `POST /api/integrations/nango/callback`.
6. Callback resolves the user's organization and upserts the current user's row in `integration_connections`.

The connection id is later used for all Xero API calls through the Nango proxy.

## Xero Tenant Handling

Xero requires `Xero-Tenant-Id` on Accounting API calls. Nango does not automatically provide it in the request headers for this implementation, so PostSig resolves and caches it.

Implementation:

- `getXeroTenantId(connectionId)` checks Nango metadata for `xeroTenantId`.
- If missing, it calls Xero `/connections` through Nango.
- The first returned tenant id is saved into Nango metadata.
- Future requests reuse the cached tenant id.

All Xero Accounting API calls include:

```ts
headers: { 'Xero-Tenant-Id': tenantId }
```

## Inbound Invoice Sync

Function: `sync-external-invoices`

Location: `utils/inngest/functions/syncExternalInvoices.ts`

Triggers:

- Scheduled: `0 */2 * * *`
- Manual event: `integrations/sync-invoices`

Concurrency:

- `concurrency: 1`

Retries:

- `retries: 3`

### Inbound Sync Steps

1. Load active connections from `integration_connections`.
2. For each connection, find that connection's last successful inbound sync from `integration_sync_logs`.
3. Fetch Xero invoices with:
   - `Statuses: SUBMITTED`
   - `where: Type=="ACCPAY"`
   - `If-Modified-Since` header when a last successful sync exists.
4. Page through Xero invoices until fewer than 100 are returned.
5. For each invoice:
   - Map Xero invoice fields into PostSig contract fields.
   - Upsert the invoice as a `contracts` row owned by the importing integration connection.
   - Derive the expected `contract_docs` storage path.
   - Check whether the invoice already has a matching `contract_docs` row and whether extraction is missing or failed.
   - Download/upload the invoice PDF only when the `contract_docs` row is missing.
   - Insert the missing `contract_docs` row after a successful upload.
   - Link new invoices to a parent vendor contract when a vendor match exists.
   - Trigger invoice document processing and AI extraction when the invoice is new, has a newly repaired document, or has missing/failed extraction.
6. Repair missing documents or extraction only for invoice contracts owned by the current integration connection.
7. Reconcile provider status for already-imported invoices owned by the current integration connection:
   - Xero invoices are fetched directly by `/api.xro/2.0/Invoices/{id}`.
   - Ramp bills are fetched directly by `/developer/v1/bills/{id}`.
   - This status-only phase does not create new contract rows from draft, paid, voided, deleted, rejected, or cancelled provider invoices.
8. Write a success or failure row to `integration_sync_logs`. When an existing
   invoice's provider status changes, write an additional inbound details row
   with `event: external_invoice_status_changed`, `contract_id`,
   `external_invoice_id`, `external_status_old`, and `external_status_new`.

### Rate Limiting Decision

The sync sleeps for 1 second between Xero PDF downloads:

```ts
await step.sleep(`xero-rate-limit-${externalId}`, '1s');
```

Reason: Xero has minute-level API limits, and PDF download calls are additional Accounting API requests. The pause only happens before PDF downloads that are actually needed, reducing avoidable `429` errors during bulk sync.

## Invoice Mapping

Location: `lib/v2/integrations/invoice-sync/transforms.ts`

Xero invoices are stored as contract rows with `type_id = 6`, which is the existing Invoice contract type.

Current mapping:

- `external_source`: `xero`
- `external_invoice_id`: `invoice.InvoiceID`
- `external_invoice_status`: `invoice.Status`
- `type_id`: `6`
- `invoice_status`: `review`
- `vendor_name`: `invoice.Contact.Name` or `Unknown Vendor`
- `currency`: `invoice.CurrencyCode` or `USD`
- `billing_frequency`: `One-Time`
- `term_start_date`: invoice date
- `term_end_date`: due date
- `summary`: `Xero Invoice <InvoiceNumber or InvoiceID>`
- `status_id`: `1` (`new`)

### Deduplication

Deduplication is handled by:

- Database unique partial index on `(organization_id, external_source, external_invoice_id)`.
- Code-level lookup before insert in `upsertInvoiceAsContract`.

If the invoice already exists, the current implementation updates:

- `last_synced_at`
- `external_invoice_status`
- `updated_at`

The sync checks existing invoices for repair work. If the expected `contract_docs` row is missing, it downloads/uploads the PDF and inserts the missing row. If extraction is missing or failed, it re-triggers invoice document processing using the deterministic invoice file path.

## PDF Upload and AI Extraction

### PDF Download

Location: `downloadXeroInvoicePdf`

Xero PDF download uses:

```ts
GET / api.xro / 2.0 / Invoices / { invoiceId };
Accept: application / pdf;
```

The response is validated by checking for a `%PDF-` header. Invalid or empty responses are logged and skipped.

### Storage Path

Downloaded invoice PDFs are uploaded to the existing `contract_docs` bucket only when the expected `contract_docs` row is missing.

Path format:

```text
{userId}/invoice_xero_{safeInvoiceId}.pdf
```

The upload uses `upsert: true` so a repaired download of the same file path can replace the stored object.

### `contract_docs` Row

For new invoices, or existing invoices missing their document row, PostSig inserts:

- `file_path`
- `contract_id`
- `user_id`
- `updated_at`

This makes the invoice PDF visible through the same document path used by regular CPM contracts.

### AI Processing

New invoice contracts, repaired document rows, and contracts with missing/failed extraction trigger:

```text
integrations/process-invoice-document
```

`processInvoiceDocument` then:

1. Downloads the PDF from `contract_docs`.
2. Attempts PDF sanitization using the existing sanitizer service.
3. Re-uploads the sanitized PDF to the same storage path.
4. Sends `contracts/extractcontract`.
5. Invalidates organization and vendor caches.

This reuses the existing CPM extraction pipeline instead of creating a separate invoice-only AI path.

## Parent Contract Linking

When a new invoice is ingested:

1. PostSig tries to resolve a vendor by exact organization and case-insensitive vendor name match.
2. If a vendor exists, PostSig finds the latest non-invoice contract for that vendor.
3. It inserts a row into `contract_relationships` with:
   - `parent_id`: parent vendor contract
   - `child_id`: invoice contract
   - `organization_id`
   - `active: true`
   - `disabled: false`

Decision: parent linking is best-effort. Missing vendor or parent contract does not fail ingestion.

## Outbound Status Sync

Function: `sync-invoice-status-outbound`

Location: `utils/inngest/functions/syncInvoiceStatusOutbound.ts`

Triggered by:

```text
integrations/invoice-status-updated
```

This event is sent when a user updates an externally sourced invoice status in PostSig.

### Outbound Flow

1. Load the contract's:
   - `external_source`
   - `external_integration_connection_id`
   - `external_invoice_id`
   - `external_invoice_status`
2. Skip if the invoice has no external source/id.
3. Resolve the invoice owner's connection from `integration_connections`.
4. Skip the provider push when the owning connection is missing or disconnected.
5. Call provider-specific push logic.
6. Update:
   - `last_synced_at`
   - `external_invoice_status` when the provider returned a new status.
7. Write an outbound sync log with details including
   `event: invoice_status_updated`, `contract_id`, `invoice_status_old`,
   `invoice_status_new`, `external_status_old`, `external_status_new`,
   `reason`, and `actor_name`.

## Xero Status Mapping

Locations:

- `lib/v2/integrations/invoice-sync/transforms.ts`
- `lib/v2/integrations/invoice-sync/outbound.ts`

Inbound Xero-to-PostSig mapping:

| Xero status  | PostSig status |
| ------------ | -------------- |
| `SUBMITTED`  | `review`       |
| `VOIDED`     | `void`         |
| `AUTHORISED` | `approved`     |
| `AUTHORIZED` | `approved`     |
| `DRAFT`      | `incomplete`   |
| `PAID`       | `paid`         |
| `DELETED`    | `declined`     |

Outbound PostSig-to-Xero mapping:

| PostSig status | Xero action                                            |
| -------------- | ------------------------------------------------------ |
| `approved`     | Set Xero invoice to `AUTHORISED`                       |
| `void`         | Ensure Xero invoice is `AUTHORISED`, then set `VOIDED` |
| `review`       | Not pushed; reconciled from Xero `SUBMITTED`           |
| `incomplete`   | Not pushed; reconciled from Xero `DRAFT`               |
| `declined`     | Not pushed; reconciled from Xero `DELETED`             |
| `paid`         | Not pushed; requires creating a Xero Payment object    |

PostSig only pushes Xero status updates when a user sets an invoice to
`approved` or `void`. Other PostSig statuses are set during inbound status
reconciliation after fetching the current Xero invoice by provider id.

## Xero VOIDED Rules

Xero rejects `VOIDED` in several cases. The most important known case is:

```text
The status VOIDED cannot be applied to the invoice because it has payments or credit notes allocated to it.
```

Current implementation protects against this and preserves one-click voiding:

1. Before sending `VOIDED`, fetch the latest invoice from Xero.
2. If the invoice is already `VOIDED`, return that status without another
   update.
3. Skip `VOIDED` if the invoice has allocations:
   - `AmountPaid > 0`
   - `AmountCredited > 0`
   - `Payments.length > 0`
   - `CreditNotes.length > 0`
   - `Prepayments.length > 0`
   - `Overpayments.length > 0`
4. If the invoice is not `AUTHORISED`/`AUTHORIZED`, silently update Xero to
   `AUTHORISED`.
5. Update Xero to `VOIDED`.

If Xero still returns the allocated-payment validation error, PostSig treats it as a non-retryable skip and returns without throwing. This prevents Inngest from retrying a permanent validation failure.

### History Notes

When PostSig changes or skips changing Xero status, it tries to write a Xero invoice history record:

```text
PUT /api.xro/2.0/Invoices/{invoiceId}/History
```

Xero controls the history `User` column for API-created history records, so it may show as `System Generated`. The integration includes the PostSig actor in the history `Details` instead:

```text
PostSig status: declined
PostSig user: Jane Doe
Reason: Duplicate invoice
```

This lets Xero users see the PostSig review actor and reason even when the invoice status cannot legally be changed in Xero.

History note failures are non-fatal.

## Retry Behavior

### Retryable

`429` rate limits are retried with `RetryAfterError`.

If Xero returns `retry-after`, the retry delay uses that value. Otherwise, the fallback delay is 60 seconds.

### Non-Retryable

Known Xero validation failures for allocated invoices are not retried:

- PostSig logs the validation message.
- PostSig writes a history note when possible.
- The function returns the latest known Xero status.
- Inngest continues instead of retrying.

## Inbound Status Updates

There is no Nango webhook implementation in the current Xero integration. The integration relies on the scheduled/manual polling path for inbound invoice ingestion and status refreshes.

Important consequence: the new-invoice polling query only imports `ACCPAY`
invoices with `SUBMITTED` status, but the status reconciliation phase fetches
already-imported invoices by provider id so `DRAFT`, `PAID`, `VOIDED`,
`DELETED`, and other provider statuses are still observed.

## Logging and Debugging

### Inngest

Use the Inngest UI to inspect:

- `sync-external-invoices`
- `process-invoice-document`
- `sync-invoice-status-outbound`

Important steps:

- `fetch-invoices-xero-{integrationConnectionId}`
- `get-processing-state-xero-{integrationConnectionId}-{externalId}`
- `download-upload-pdf-xero-{integrationConnectionId}-{externalId}`
- `upsert-invoice-xero-{integrationConnectionId}-{externalId}`
- `trigger-extraction-xero-{integrationConnectionId}-{externalId}`
- `push-status`

### Nango

Use Nango activity logs to inspect proxied Xero calls.

Common calls:

- `GET /connections`
- `GET /api.xro/2.0/Invoices` with optional `If-Modified-Since`
- `GET /api.xro/2.0/Invoices/{invoiceId}` with `Accept: application/pdf`
- `POST /api.xro/2.0/Invoices`
- `PUT /api.xro/2.0/Invoices/{invoiceId}/History`

### Application Logs

Application logs are emitted through `utils/pino.ts`.

Important log messages:

- `Cached Xero tenant ID`
- `Invoices fetched from provider`
- `Failed to download Xero invoice PDF`
- `Failed to upload invoice PDF to contract_docs bucket`
- `Skipping Xero outbound sync - invalid state transition`
- `Skipping Xero void sync because invoice has allocations`
- `Pushed status to Xero`
- `Failed to write reason to Xero invoice history`

## Environment Variables

Required:

- `NANGO_SECRET_KEY`

## Operational Decisions

- Invoices are represented as `contracts` rows with `type_id = 6` to reuse CPM contract UI, reports, relationships, and extraction.
- Invoice PDFs are stored in the existing `contract_docs` bucket to reuse document viewing and extraction.
- AI extraction is triggered for newly ingested invoices and repaired when an existing invoice has a document but missing/failed extraction.
- Duplicate prevention is database-backed with `(organization_id, external_source, external_invoice_id)`.
- Xero tenant id is cached in Nango metadata to avoid repeated `/connections` calls.
- Xero status sync is best effort. PostSig preserves the local user decision even when Xero refuses a transition.
- Xero `paid` is not pushed because it requires Payment creation, not an invoice status update.
- Allocated Xero invoices are not force-voided. The integration writes a history note instead.
- Sync runs every 2 hours to keep invoice data current while still avoiding unnecessary repeated AI/document processing.
