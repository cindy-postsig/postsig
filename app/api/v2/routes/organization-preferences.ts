import { Hono } from 'hono';
import {
  getVendorWhitelist,
  addVendor,
  addVendors,
  removeVendor,
  replaceWhitelist,
  uploadCSV,
} from '../handlers/organization-preferences/vendor-whitelist';
import {
  getPostsigEmailAddress,
  togglePostsigEmailAddress,
} from '../handlers/organization-preferences/postsig-email-address';

export const organizationPreferencesRouter = new Hono();

organizationPreferencesRouter.get('/vendor-whitelist', getVendorWhitelist);
organizationPreferencesRouter.post('/vendor-whitelist', addVendor);
organizationPreferencesRouter.post('/vendor-whitelist/bulk', addVendors);
organizationPreferencesRouter.delete('/vendor-whitelist/:email', removeVendor);
organizationPreferencesRouter.put('/vendor-whitelist', replaceWhitelist);
organizationPreferencesRouter.post('/vendor-whitelist/upload', uploadCSV);
organizationPreferencesRouter.get(
  '/postsig-email-address',
  getPostsigEmailAddress,
);
organizationPreferencesRouter.post(
  '/postsig-email-address',
  togglePostsigEmailAddress,
);
