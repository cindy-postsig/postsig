import { Hono } from 'hono';
import { getContractGroups } from '../handlers/groups/contract-groups';
import { getOrgGroups } from '../handlers/groups/org-groups';

export const groupsRouter = new Hono();

// Get business groups for a specific contract
groupsRouter.get('/contract/:id', getContractGroups);

// Get business groups for a specific org
groupsRouter.get('/org/:id', getOrgGroups);
