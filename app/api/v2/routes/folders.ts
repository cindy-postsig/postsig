import { Hono } from 'hono';
import { getOrgFoldersHandler } from '../handlers/folders/org-folders';
import { updateContractFoldersHandler } from '../handlers/folders/contract-folders';

export const foldersRouter = new Hono();

// Get folders for a specific org
foldersRouter.get('/org/:id', getOrgFoldersHandler);

// update folders for a specific contract
foldersRouter.put('/contract/:id', updateContractFoldersHandler);
