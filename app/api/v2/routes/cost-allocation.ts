import { Hono } from 'hono';
import {
  getCostAllocationCatalog,
  getCostAllocationTab,
  putAllocationBudget,
  putContractAllocation,
} from '../handlers/cost-allocation';

export const costAllocationRouter = new Hono();

// The org-wide target catalog the editor's picker browses.
costAllocationRouter.get('/catalog', getCostAllocationCatalog);

// One contract's resolved allocation, amounts included.
costAllocationRouter.get('/contracts/:id', getCostAllocationTab);
costAllocationRouter.put('/contracts/:id', putContractAllocation);

// The summary report's inline budget edit.
costAllocationRouter.put('/budgets', putAllocationBudget);
