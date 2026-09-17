import { investorTools } from './companies';
import { investorKpiTools } from './kpis';
import { coinvestorTools } from './coinvestors';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

export const investorMcpTools: McpToolDef[] = [
  ...investorTools,
  ...investorKpiTools,
  ...coinvestorTools,
];
