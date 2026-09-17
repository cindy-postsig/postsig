import { bloombergTools } from './bloomberg';
import { contractsTools } from './contracts';
import { vendorsTools } from './vendors';
import { reportsTools } from './reports';
import { renewalsTools } from './renewals';
import { spendTools } from './spend';
import { priceHistoryTools } from './price-history';
import { usersTools } from './users';
import { tagsTools } from './tags';
import { lineageTools } from './lineage';
import { groupsTools } from './groups';
import { costAllocationTools } from './cost-allocation';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

export const cpmMcpTools: McpToolDef[] = [
  ...contractsTools,
  ...vendorsTools,
  ...reportsTools,
  ...renewalsTools,
  ...spendTools,
  ...priceHistoryTools,
  ...usersTools,
  ...tagsTools,
  ...lineageTools,
  ...groupsTools,
  ...costAllocationTools,
  ...bloombergTools,
];
