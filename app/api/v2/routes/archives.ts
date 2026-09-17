import { Hono } from 'hono';
import { listModuleArchives } from '@/app/api/v2/handlers/archives/list';

export const archivesRouter = new Hono();

archivesRouter.get('/', listModuleArchives);
