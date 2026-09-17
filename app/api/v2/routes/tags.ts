import { Hono } from 'hono';
import { updateContractTagsHandler } from '@/app/api/v2/handlers/tags/contract-tags';
import { getOrgTagsHandler } from '@/app/api/v2/handlers/tags/org-tags';
import {
  getEntityTagsHandler,
  updateEntityTagsHandler,
} from '@/app/api/v2/handlers/tags/entity-tags';

export const tagsRouter = new Hono();

tagsRouter.put('/contract/:id', updateContractTagsHandler);
tagsRouter.get('/org/:id', getOrgTagsHandler);
tagsRouter.get('/entity/:id', getEntityTagsHandler);
tagsRouter.put('/entity/:id', updateEntityTagsHandler);
