# Rerun Extraction — Integration Guide for Extractor App

## Event

Send a single Inngest event to trigger re-extraction. The postsig-nextjs function handles querying documents, routing logic, and fan-out.

```text
Event name: investor/rerun-extractions
```

Both apps must share the same Inngest environment for this to work.

---

## Payload Shape

```typescript
{
  name: 'investor/rerun-extractions',
  data: {
    organizationId: string;       // required — the org to scope the rerun to
    moduleDocumentId?: number;     // optional — target a single document
    statusIds?: number[];          // optional — filter by specific statuses
  },
  user: {
    id: string;                    // required — the user triggering the rerun
    organizationId: string;        // required — same as data.organizationId
  }
}
```

---

## Rerun Scenarios

### 1. Single document

Re-run extraction for one specific document.

```typescript
await inngest.send({
  name: 'investor/rerun-extractions',
  data: {
    organizationId: 'org-uuid',
    moduleDocumentId: 12345,
  },
  user: {
    id: 'user-uuid',
    organizationId: 'org-uuid',
  },
});
```

### 2. All unpublished documents

Re-run extraction for every document in the org that is **not** published (status 5). This is the default when no `moduleDocumentId` or `statusIds` are provided.

```typescript
await inngest.send({
  name: 'investor/rerun-extractions',
  data: {
    organizationId: 'org-uuid',
  },
  user: {
    id: 'user-uuid',
    organizationId: 'org-uuid',
  },
});
```

### 3. Documents with specific statuses

Re-run extraction for documents matching specific status IDs.

```typescript
await inngest.send({
  name: 'investor/rerun-extractions',
  data: {
    organizationId: 'org-uuid',
    statusIds: [6], // e.g. failed only
  },
  user: {
    id: 'user-uuid',
    organizationId: 'org-uuid',
  },
});
```

---

## Status IDs Reference

| ID  | Code                   | Description                     |
| --- | ---------------------- | ------------------------------- |
| 1   | `uploaded`             | Uploaded, not yet processed     |
| 2   | `ready_for_extraction` | Processed, awaiting AI          |
| 3   | `processing`           | Currently being processed       |
| 4   | `needs_approval`       | Extraction done, pending review |
| 5   | `published`            | Final — excluded by default     |
| 6   | `failed`               | Failed during processing        |

---

## Filter Priority

The function applies filters in this order:

1. If `moduleDocumentId` is set → fetch that single document (ignores `statusIds`)
2. Else if `statusIds` is set → fetch documents matching those statuses
3. Else → fetch all documents where `status_id != 5` (not published)

Deleted documents (`is_deleted = true`) are always excluded.

---

## What Happens Internally

For each document found, the function checks whether a company is already linked (`company_id`):

- **Has company** → sends `investor/extract-document` (AI extraction only)
- **No company** → sends `investor/extract-document-info` (company matching + AI extraction)

Each fanned-out event gets a unique idempotency key (`{filePath}-rerun-{timestamp}`) so it bypasses Inngest's deduplication window.

---

## Activity Logging

A single `investor_extraction_rerun_requested` activity is written to the `activities` table with:

```json
{
  "moduleDocumentId": 12345, // or null for batch
  "statusIds": [6], // or null if not filtered
  "documentCount": 42
}
```

Each individual document's extraction lifecycle (completion, failure, company matching, etc.) is logged by the downstream functions as usual.

---

## Response

The function returns:

```json
{
  "success": true,
  "count": 42 // number of extraction events sent
}
```

If no documents match the filter:

```json
{
  "success": true,
  "count": 0
}
```
