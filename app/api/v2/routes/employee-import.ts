import { Hono } from 'hono';
import {
  commitEmployeeImport,
  previewEmployeeImport,
  saveEmployeeImportMapping,
} from '../handlers/employee-import';

export const employeeImportRouter = new Hono();

employeeImportRouter.post('/preview', previewEmployeeImport);
employeeImportRouter.post('/commit', commitEmployeeImport);
employeeImportRouter.post('/mapping', saveEmployeeImportMapping);
