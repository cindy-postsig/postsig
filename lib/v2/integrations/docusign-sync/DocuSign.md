# DocuSign Integration

DocuSign is a document repository integration used to import contract envelopes
from DocuSign into PostSig. The integration reads connected DocuSign accounts,
fetches envelopes and documents, stores PDFs in `contract_docs`, creates or
updates contract records, and triggers extraction when a document still needs
processing.

## Sync Configuration

### Enable sync

`Enable sync` controls the automatic scheduled sync for DocuSign.

When enabled, the DocuSign worker includes the connection in the scheduled
background run. When disabled, scheduled sync skips the connection.

Manual connection-scoped syncs can still include a disabled connection when the
sync is explicitly triggered for that integration.

### Every hour

DocuSign automatic sync runs every hour.

The schedule is defined in `utils/inngest/functions/syncDocuSignEnvelopes.ts`:

```ts
{
  cron: '0 * * * *';
}
```

Each run fetches active DocuSign connections from `integration_connections`
where:

- `provider = 'docusign'`
- `status = 'connected'`
- `sync_enabled = true` for scheduled runs

## Data Scope

### Completed envelopes

UI label: `Completed envelopes`

Description: `Ingest fully executed contracts.`

DocuSign sync always fetches envelopes with `completed` status. These represent
fully executed contracts. PostSig creates or updates a contract for each
envelope and downloads the related envelope documents.

The setting is displayed as fixed-on in the UI and cannot be disabled.

## Data Flow

1. The worker loads active DocuSign connections from `integration_connections`.
2. The worker reads the last successful sync timestamp from
   `integration_sync_logs`.
3. The worker fetches DocuSign envelopes through the native DocuSign OAuth
   helpers in `utils/docusign.ts`.
4. For each envelope, PostSig upserts a contract record with:
   - `external_source = 'docusign'`
   - `external_invoice_id = envelopeId`
   - `external_integration_connection_id = integration connection id`
5. The worker fetches envelope documents and skips DocuSign certificate files.
6. PDFs are uploaded to the `contract_docs` storage bucket.
7. A `contract_docs` row is inserted for the contract.
8. If the document is new or still needs extraction, the worker sends an
   `integrations/process-invoice-document` event.
9. The sync result is written to `integration_sync_logs`.
10. Connection health and last-sync metadata are updated on
    `integration_connections`.

## Storage and Tables

Primary tables used:

- `integration_connections`
- `integration_sync_logs`
- `contracts`
- `contract_docs`
- `users`

DocuSign OAuth tokens still live on the legacy user columns:

- `users.docusign_connected`
- `users.docusign_access_token`
- `users.docusign_refresh_token`
- `users.docusign_account_id`
- `users.docusign_base_uri`

The integrations UI uses `integration_connections` as the unified connection
model, with fallback handling for legacy DocuSign user fields.

## Sync Logs

DocuSign sync runs write rows to `integration_sync_logs` with:

- `provider = 'docusign'`
- `sync_type = 'inbound'`
- `status = 'success' | 'failed' | 'partial'`
- `records_processed`
- `details`
- `error_details`
- `started_at`
- `completed_at`

These logs power:

- the integrations recent-runs table
- last sync status
- action-required/error states
- connection health metadata

Noisy non-audit sync logs may be cleaned up by retention jobs. Audit-significant
rows should be preserved when they are used by contract activity history.

## Error Handling

If DocuSign returns a 401, the shared DocuSign helper treats it as
`token_expired`, refreshes the token with the stored refresh token, refetches
the user OAuth data, and retries the API call.

Failed syncs are written to `integration_sync_logs` and can update
`integration_connections.health_status` to indicate reconnect-required states
when the error is classified as authentication-related.

## Main Files

- `lib/v2/integrations/catalog.ts`
- `lib/v2/integrations/docusign-sync/service.ts`
- `lib/v2/integrations/docusign-sync/types.ts`
- `utils/inngest/functions/syncDocuSignEnvelopes.ts`
- `utils/docusign.ts`
- `components/settings/IntegrationDetailPageClient.tsx`
