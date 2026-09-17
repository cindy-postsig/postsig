import { Hono } from 'hono';
import { listContracts } from '@/app/api/v2/handlers/contracts/list';
import { processContract } from '@/app/api/v2/handlers/contracts/process-contract';
import { getContractHandler } from '../handlers/contracts/get';
import { getContractActivitiesHandler } from '../handlers/contracts/activities';
import { getContractDocumentsHandler } from '../handlers/contracts/documents';
import { getLatestVersionHandler } from '../handlers/contracts/versions';
import { getContractCitationsHandler } from '../handlers/contracts/citations';
import { getAmendmentChainHandler } from '../handlers/contracts/amendments';
import { getContractACLHandler } from '../handlers/contracts/acl';
import { uploadContractVersion } from '@/app/api/v2/handlers/contracts/upload-version';
import { revertContractFieldHandler } from '@/app/api/v2/handlers/contracts/revert-field';
import { revertProductFieldHandler } from '@/app/api/v2/handlers/contracts/revert-product-field';
import { updateContractDetailsHandler } from '@/app/api/v2/handlers/contracts/contract-details';
import { processZip } from '@/app/api/v2/handlers/contracts/process-zip';
import { verifyZipUpload } from '@/app/api/v2/handlers/contracts/verify-zip-upload';
import { getOwnersCatalogHandler } from '@/app/api/v2/handlers/contracts/owners-catalog';
import { putContractOwnersHandler } from '@/app/api/v2/handlers/contracts/owners';

export const contractsRouter = new Hono();

contractsRouter.get('/', listContracts);
contractsRouter.post('/process-contract', processContract);
contractsRouter.post('/process-zip', processZip);
contractsRouter.post('/verify-zip-upload', verifyZipUpload);

// Before '/:id', which would otherwise capture 'owners' as a contract id.
contractsRouter.get('/owners/catalog', getOwnersCatalogHandler);

contractsRouter.get('/:id', getContractHandler);
contractsRouter.get('/:id/activities', getContractActivitiesHandler);
contractsRouter.get('/:id/documents', getContractDocumentsHandler);
contractsRouter.get('/:id/versions', getLatestVersionHandler);
contractsRouter.get('/:id/citations', getContractCitationsHandler);
contractsRouter.get('/:id/amendments', getAmendmentChainHandler);
contractsRouter.get('/:id/acl', getContractACLHandler);
contractsRouter.post('/:id/versions', uploadContractVersion);
contractsRouter.post('/:id/revert-field', revertContractFieldHandler);
contractsRouter.post('/:id/revert-product-field', revertProductFieldHandler);
contractsRouter.put('/:id/owners', putContractOwnersHandler);
contractsRouter.patch('/:id', updateContractDetailsHandler);
