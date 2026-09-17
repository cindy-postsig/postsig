import { Hono } from 'hono';
import { getVentureDocumentSummaryHandler } from '@/app/api/v2/handlers/investor/document-summary';
import { listVentureDocuments } from '@/app/api/v2/handlers/investor/documents';
import { processDocument } from '@/app/api/v2/handlers/investor/process-document';
import { processAumniExport } from '@/app/api/v2/handlers/investor/process-aumni-export';
import { notifyUpload } from '@/app/api/v2/handlers/investor/notify-upload';
import {
  listInvCompanies,
  getInvCompanyHandler,
} from '@/app/api/v2/handlers/investor/inv-companies';
import { listInvFunds } from '@/app/api/v2/handlers/investor/inv-funds';
import { listInvInvestmentFlows } from '@/app/api/v2/handlers/investor/inv-investment-flows';
import { listInvCoInvestors } from '@/app/api/v2/handlers/investor/inv-co-investors';
import { listExtractionFields } from '@/app/api/v2/handlers/investor/extraction-fields';
import { reportingRouter } from '@/app/api/v2/routes/reporting';

export const investorRouter = new Hono();

investorRouter.get('/extraction-fields', listExtractionFields);
investorRouter.get('/document-summary', getVentureDocumentSummaryHandler);
investorRouter.get('/documents', listVentureDocuments);
investorRouter.post('/process-document', processDocument);
investorRouter.post('/process-aumni-export', processAumniExport);
investorRouter.post('/notify-upload', notifyUpload);

// inv_* schema endpoints (new portfolio data model)
investorRouter.get('/inv/companies', listInvCompanies);
investorRouter.get('/inv/companies/:id', getInvCompanyHandler);
investorRouter.get('/inv/funds', listInvFunds);
investorRouter.get('/inv/investment-flows', listInvInvestmentFlows);
investorRouter.get('/inv/co-investors', listInvCoInvestors);

investorRouter.route('/reporting', reportingRouter);
