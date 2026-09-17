# Investor Document Upload - Implementation Spec

## Overview

Implement lightweight document upload for `/investor/documents` with real-time AI extraction streaming.

## Key Design Decisions

- **Naming**: Use "investor" prefix throughout
- **AI Provider**: Gemini via AI SDK (`@ai-sdk/google-vertex`)
- **Streaming**: Use `streamObject` to stream extraction results to UI in real-time
- **Storage**: Use `documents` bucket (already created in migration `20251231100000_documents_storage_bucket.sql`)

---

## Files to Create

### 1. Server Action: `app/lib/actions/investor-documents.ts`

```typescript
'use server';

import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import { sanitizeFileName } from '@/utils/helpers';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/utils/pino';

const INVESTOR_MODULE_CODE = 'investor';

export async function uploadInvestorDocument(formData: FormData): Promise<{
  success: boolean;
  documentId?: string;
  filePath?: string;
  error?: string;
}> {
  try {
    const userMetadata = await getUserMetadata();
    if (!userMetadata?.userId || !userMetadata?.organizationId) {
      return { success: false, error: 'Unauthorized' };
    }

    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Invalid file type' };
    }

    const supabase = createClient();

    // Get investor module ID
    const { data: moduleData, error: moduleError } = await supabase
      .from('app_modules')
      .select('id')
      .eq('code', INVESTOR_MODULE_CODE)
      .single();

    if (moduleError || !moduleData) {
      return { success: false, error: 'Module not found' };
    }

    // Get default document type (safe_note)
    const { data: docType } = await supabase
      .from('document_types')
      .select('id')
      .eq('module_id', moduleData.id)
      .eq('code', 'safe_note')
      .single();

    const documentPublicId = uuidv4();
    const sanitizedFileName = sanitizeFileName(file.name);
    const filePath = `${userMetadata.organizationId}/investor/${documentPublicId}/primary/${sanitizedFileName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      logger.error({ uploadError }, 'Failed to upload file');
      return { success: false, error: 'Upload failed' };
    }

    // Create module_documents record
    const { data: docData, error: docError } = await supabase
      .from('module_documents')
      .insert({
        organization_id: userMetadata.organizationId,
        user_id: userMetadata.userId,
        module_id: moduleData.id,
        document_type_id: docType?.id || 1,
        status: 'pending',
        metadata: { original_filename: file.name },
      })
      .select('id, public_id')
      .single();

    if (docError) {
      logger.error({ docError }, 'Failed to create document record');
      return { success: false, error: 'Database error' };
    }

    // Create module_document_files record
    await supabase.from('module_document_files').insert({
      module_document_id: docData.id,
      file_path: filePath,
      file_name: sanitizedFileName,
      file_size: file.size,
      file_type: file.type,
    });

    return {
      success: true,
      documentId: docData.public_id,
      filePath,
    };
  } catch (error) {
    logger.error({ error }, 'uploadInvestorDocument failed');
    return { success: false, error: 'Unexpected error' };
  }
}
```

### 2. Streaming API Route: `app/api/v2/handlers/investor/extract-document.ts`

```typescript
import { Context } from 'hono';
import { streamObject } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';

const extractionSchema = z.object({
  company_name: z.string().describe('The company name from the document'),
  document_type: z
    .enum([
      'charter',
      'safe_note',
      'ira',
      'voting',
      'rofr_cosale',
      'side_letter',
      'amendment',
    ])
    .describe('The type of investment document'),
});

const MODEL_ID = process.env.GOOGLE_VERTEX_MODEL_ID || 'gemini-2.0-flash';

// Setup Google Vertex (same pattern as chat/stream.ts)
const credentialsBuffer = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let google: ReturnType<typeof createVertex> | undefined;
if (credentialsBuffer) {
  try {
    const credentialsParsed = JSON.parse(
      Buffer.from(credentialsBuffer, 'base64').toString('utf-8'),
    );
    google = createVertex({
      googleAuthOptions: { credentials: credentialsParsed },
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: 'us-central1',
    });
  } catch (e) {
    logger.error({ error: e }, 'Failed to parse credentials');
  }
}

export async function extractDocument(c: Context) {
  if (!google) {
    return c.json({ error: 'AI Service not configured' }, 500);
  }

  try {
    const { documentId, filePath } = await c.req.json();
    const supabase = createClient();

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError) {
      return c.json({ error: 'Failed to download file' }, 500);
    }

    const pdfBase64 = Buffer.from(await fileData.arrayBuffer()).toString(
      'base64',
    );

    const result = streamObject({
      model: google(MODEL_ID),
      schema: extractionSchema,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: pdfBase64, mimeType: 'application/pdf' },
            {
              type: 'text',
              text: `Extract the company name and classify the document type.
            Document types: charter (Certificate of Incorporation), safe_note (SAFE or Convertible Note),
            ira (Investor Rights Agreement), voting (Voting Agreement),
            rofr_cosale (Right of First Refusal/Co-Sale), side_letter, amendment.`,
            },
          ],
        },
      ],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    logger.error({ error }, 'extractDocument failed');
    return c.json({ error: 'Extraction failed' }, 500);
  }
}
```

### 3. Add Route: `app/api/v2/routes/investor.ts`

Add to existing file:

```typescript
import { extractDocument } from '../handlers/investor/extract-document';

// Add route
investorRouter.post('/extract-document', extractDocument);
```

### 4. Background Job: `utils/inngest/functions/finalizeInvestorDocument.ts`

```typescript
import { inngest } from '../client';
import { createClient } from '@/utils/supabase/service_server';
import axios from 'axios';
import { PDF_SANITIZER_API } from '@/app/lib/constants';
import logger from '@/utils/pino';

// Similarity scoring functions (from app/lib/actions/openai.ts getVendorId pattern)
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1,
            );
    }
  }
  return matrix[b.length][a.length];
}

function calculateSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(n1, n2) / maxLen;
}

export const finalizeInvestorDocument = inngest.createFunction(
  { id: 'finalize-investor-document' },
  { event: 'investor/finalize-document' },
  async ({ event, step }) => {
    const {
      documentId,
      filePath,
      companyName,
      documentType,
      organizationId,
      userId,
    } = event.data;
    const supabase = createClient();

    // Step 1: Sanitize PDF
    await step.run('sanitize-pdf', async () => {
      try {
        const { data } = await supabase.storage
          .from('documents')
          .download(filePath);
        const formData = new FormData();
        formData.append('pdf', data, 'document.pdf');

        const response = await axios.post(PDF_SANITIZER_API.URL, formData, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        if (response.data?.byteLength > 0) {
          await supabase.storage
            .from('documents')
            .upload(
              filePath,
              new Blob([response.data], { type: 'application/pdf' }),
              { upsert: true },
            );
        }
      } catch (e) {
        logger.error({ e }, 'PDF sanitization failed (non-blocking)');
      }
    });

    // Step 2: Update document type
    const docTypeId = await step.run('update-doc-type', async () => {
      const { data: moduleData } = await supabase
        .from('app_modules')
        .select('id')
        .eq('code', 'investor')
        .single();

      const { data: docType } = await supabase
        .from('document_types')
        .select('id')
        .eq('module_id', moduleData?.id)
        .eq('code', documentType)
        .single();

      if (docType) {
        await supabase
          .from('module_documents')
          .update({ document_type_id: docType.id })
          .eq('public_id', documentId);
      }
      return docType?.id;
    });

    // Step 3: Match or create company
    const companyId = await step.run('match-or-create-company', async () => {
      const { data: existingCompanies } = await supabase
        .from('companies')
        .select('id, name');

      let bestMatch = null;
      let bestScore = 0;
      for (const company of existingCompanies || []) {
        const score = calculateSimilarity(companyName, company.name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = company;
        }
      }

      if (bestScore >= 0.8 && bestMatch) {
        return bestMatch.id;
      }

      const { data: newCompany } = await supabase
        .from('companies')
        .insert({ name: companyName })
        .select('id')
        .single();

      return newCompany?.id;
    });

    // Step 4: Create or find entity
    const entityId = await step.run('create-entity', async () => {
      const { data: moduleData } = await supabase
        .from('app_modules')
        .select('id')
        .eq('code', 'investor')
        .single();

      // Check if entity exists for this company in this org
      const { data: existingEntity } = await supabase
        .from('module_entities')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('company_id', companyId)
        .eq('module_id', moduleData?.id)
        .single();

      if (existingEntity) return existingEntity.id;

      const { data: newEntity } = await supabase
        .from('module_entities')
        .insert({
          organization_id: organizationId,
          module_id: moduleData?.id,
          entity_type: 'portfolio_company',
          name: companyName,
          company_id: companyId,
        })
        .select('id')
        .single();

      return newEntity?.id;
    });

    // Step 5: Link document to entity and update status
    await step.run('finalize', async () => {
      await supabase
        .from('module_documents')
        .update({ entity_id: entityId, status: 'processed' })
        .eq('public_id', documentId);
    });

    return { success: true, companyId, entityId };
  },
);
```

### 5. Register Function: `utils/inngest/index.ts`

Add import and export:

```typescript
import { finalizeInvestorDocument } from './functions/finalizeInvestorDocument';

// Add to functions array
export const functions = [
  // ... existing functions
  finalizeInvestorDocument,
];
```

---

## Files to Modify

### 6. Update: `app/(app)/(investor)/investor/documents/DocumentsUploadCard.tsx`

Replace with FilePond implementation:

- Import FilePond and register plugins
- Call `uploadInvestorDocument` server action
- After upload success, trigger extraction via fetch to `/api/v2/investor/extract-document`
- Use `experimental_useObject` hook to stream results
- When extraction completes, send Inngest event via server action

### 7. Update: `app/(app)/(investor)/investor/documents/DocumentsTableClient.tsx`

- Add state for uploading documents with streaming extraction results
- Display streamed `company_name` and `document_type` in real-time
- Merge uploaded docs with existing docs in table
- Handle drag-and-drop events

---

## Database

**Storage bucket**: `documents` (already created)
**Path structure**: `{org_id}/investor/{doc_public_id}/primary/{filename}`

**Tables used**:

- `module_documents` - main document record
- `module_document_files` - file metadata
- `document_types` - for document classification
- `companies` - company records
- `module_entities` - portfolio company entities

---

## Reference Files

| File                                                | Pattern                          |
| --------------------------------------------------- | -------------------------------- |
| `components/upload/FileUpload.tsx`                  | FilePond multi-file upload       |
| `app/api/v2/handlers/chat/stream.ts`                | AI SDK + Google Vertex streaming |
| `app/api/v2/handlers/contracts/process-contract.ts` | PDF sanitization                 |
| `app/lib/actions/openai.ts`                         | Company matching (getVendorId)   |
| `lib/v2/investor/service.ts`                        | Module queries pattern           |
