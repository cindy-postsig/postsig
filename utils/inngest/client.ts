import { Inngest } from 'inngest';
import logger from '@/utils/pino';
export const inngest = new Inngest({
  id: 'postsig-app',
  logger,
});
