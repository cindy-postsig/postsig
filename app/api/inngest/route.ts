export const maxDuration = 800; // This function can run for a maximum of 13 minutes
export const dynamic = 'force-dynamic';
import { serve } from 'inngest/next';
import { inngest } from '@/utils/inngest/client';
import {
  getContractData,
  getContractSpecs,
  processOpenAiFile,
} from '@/utils/inngest/functions';
import processContract from '@/utils/inngest/functions/processContract';
import translateContractDocument from '@/utils/inngest/functions/translateContractDocument';
import extractContract from '@/utils/inngest/functions/extractContract';
import finalizeContractExtraction from '@/utils/inngest/functions/finalizeContractExtraction';
import checkContractLineage from '@/utils/inngest/functions/checkContractLineage';
import extractContractText from '@/utils/inngest/functions/extractContractText';
import generateCitations from '@/utils/inngest/functions/generateCitations';
import processContractMetadata from '@/utils/inngest/functions/processContractMetadata';
import generateHighlights from '@/utils/inngest/functions/generateHighlights';
import lineageFieldAnalysis from '@/utils/inngest/functions/lineageFieldAnalysis';
import processContractZip from '@/utils/inngest/functions/processContractZip';
import syncExternalInvoices from '@/utils/inngest/functions/syncExternalInvoices';
import syncDocuSignEnvelopes from '@/utils/inngest/functions/syncDocuSignEnvelopes';
import syncInvoiceStatusOutbound from '@/utils/inngest/functions/syncInvoiceStatusOutbound';
import processInvoiceDocument from '@/utils/inngest/functions/processInvoiceDocument';
import contractReplacementDetection from '@/utils/inngest/functions/contractReplacementDetection';

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    getContractData,
    getContractSpecs,
    processOpenAiFile,
    processContract,
    translateContractDocument,
    extractContract,
    finalizeContractExtraction,
    checkContractLineage,
    extractContractText,
    generateCitations,
    processContractMetadata,
    generateHighlights,
    lineageFieldAnalysis,
    processContractZip,
    syncExternalInvoices,
    syncDocuSignEnvelopes,
    syncInvoiceStatusOutbound,
    processInvoiceDocument,
    contractReplacementDetection,
  ],
});
