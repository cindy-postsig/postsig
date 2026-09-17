import { z } from 'zod';
import { addUsersToContract } from '@/app/lib/mcp/add-users-to-contract';
import { resolveContractUsers } from '@/app/lib/mcp/contract-users';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');

const userRow = z
  .object({
    email: z
      .string()
      .email()
      .optional()
      .describe('Optional. May be missing for some employees.'),
    name: z
      .string()
      .optional()
      .describe(
        'Full name. If not provided, first_name + last_name are joined.',
      ),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    employee_id: z
      .string()
      .optional()
      .describe(
        'HR employee ID (e.g. EMP01). Most stable match key when present — use over email when available.',
      ),
    cost_center: z.string().optional(),
    country: z.string().optional(),
    region: z.string().optional(),
    department: z.string().optional(),
    division: z.string().optional(),
    start_date: isoDate.optional().describe('ISO date (YYYY-MM-DD)'),
    leave_date: isoDate
      .optional()
      .describe('ISO date (YYYY-MM-DD). Set when an employee has left.'),
  })
  .refine(
    (row) =>
      Boolean(
        row.employee_id ||
        row.email ||
        row.name ||
        (row.first_name && row.last_name),
      ),
    {
      message:
        'Provide at least one identifier: employee_id, email, name, or first_name + last_name.',
    },
  );

const input = z.object({
  contract_id: z.number().int(),
  product_id: z
    .number()
    .int()
    .optional()
    .describe(
      'The contract product these users are licensed for. If the contract has multiple products, ask the user which one before calling. Omit only if the contract has a single product or the data is product-agnostic.',
    ),
  users: z.array(userRow).min(1),
  dry_run: z
    .boolean()
    .default(true)
    .describe(
      'If true (default), returns the planned changes without writing. ALWAYS call dry_run:true first, show the user the resolved contract (id, vendor, dates, products, fees) and the plan, and only call again with dry_run:false after they confirm.',
    ),
  on_employee_conflict: z
    .enum(['link_only', 'update_org_employee'])
    .default('link_only')
    .describe(
      'How to handle existing employees whose org_employees data differs from the CSV. ' +
        'link_only (default): link the existing employee to this contract without updating their master record. ' +
        'update_org_employee: update the master record with the CSV data, then link. ' +
        'When the dry-run plan shows existing_match_with_diffs entries, surface those diffs to the user and ask which policy they want before re-calling.',
    ),
});

async function addUsers(payload: z.infer<typeof input>) {
  return addUsersToContract({
    contractId: payload.contract_id,
    productId: payload.product_id,
    users: payload.users,
    dryRun: payload.dry_run,
    onEmployeeConflict: payload.on_employee_conflict,
  });
}

const listInput = z.object({
  contract_id: z
    .number()
    .int()
    .describe('Contract id (from list_contracts / query_contracts results).'),
  product_id: z
    .number()
    .int()
    .optional()
    .describe(
      'Restrict to one product on the contract. Omit to return users across all products.',
    ),
  status: z
    .array(z.enum(['active', 'inactive', 'on_leave']))
    .optional()
    .describe(
      'Filter to these employment statuses; omit to return everyone. ' +
        'Only active counts as an active user. on_leave and inactive are both NOT active — an on-leave employee is treated as inactive. ' +
        'For active users pass ["active"]. inactive = departed/left the company; on_leave = temporarily away.',
    ),
  ...paginationSchema,
});

async function listContractUsers(payload: z.infer<typeof listInput>) {
  const users = await resolveContractUsers(
    payload.contract_id,
    payload.product_id,
  );
  const statusCounts = {
    active: users.filter((u) => u.status === 'active').length,
    inactive: users.filter((u) => u.status !== 'active').length,
  };
  const matched = payload.status
    ? users.filter((u) => payload.status!.includes(u.status))
    : users;
  const page = paginate(matched, payload);
  return {
    contractId: payload.contract_id,
    productId: payload.product_id ?? null,
    statusFilter: payload.status ?? null,
    statusCounts,
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    users: page.items,
  };
}

export const usersTools: McpToolDef[] = [
  {
    name: 'list_contract_users',
    description:
      'List the real people assigned to a contract, with HR-style metadata — name, email, employee id, cost center, country, region, division, department, group, start/leave dates, product, and employment status. ' +
      'Use for "who is on contract X (and in which cost centers / countries / departments)?" questions. ' +
      'ALWAYS report headcount from statusCounts ({ active, inactive }) — never the row total. ' +
      'Only status active counts as an active user. on_leave AND inactive are both NOT active, and statusCounts.inactive includes both (an on-leave employee counts as inactive). ' +
      'So "how many active users" is statusCounts.active — do not include on-leave or departed people. ' +
      'Each row keeps its precise status (active / on_leave / inactive) if you need to distinguish on-leave from departed. ' +
      'count and totalMatched are pagination only (rows on this page / across all pages) — never report them as the active count. ' +
      'Pass status (e.g. ["active"]) to narrow the returned rows; statusCounts still shows the full active/inactive split. ' +
      'Each row carries linkedToOrgEmployee: when true the fields come from the org_employees master record (canonical, edited org-wide); when false only the inline contract_users snapshot exists (legacy or unlinked) and may be stale. ' +
      'Soft-deleted org_employees rows are excluded. Paginated. ' +
      'For seat allocation (contractual cap) and over-assignment checks use get_renewal_summary include:["seats"] — number_of_users on vendor_products_users is a separate axis from real-people assignments.',
    inputSchema: listInput,
    annotations: {
      title: 'List contract users',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listContractUsers as McpToolDef['handler'],
  },
  {
    name: 'add_users_to_contract',
    description:
      'Attach a set of named users (typically from an HR CSV) to a contract product. ' +
      'For each input row: matches against org_employees (by employee_id, then email, then name); ' +
      'creates new org_employees rows when no match exists; links to the contract via contract_users.org_employee_id. ' +
      'Idempotent: rows already on the contract get their snapshot fields refreshed instead of duplicated. ' +
      'ALWAYS call dry_run:true first. The plan returns four buckets: new_employee, existing_match_clean, existing_match_with_diffs, already_linked. ' +
      'Surface the resolved contract (id, vendor, dates, products, fees — call get_contract or get_renewal_summary to retrieve them) and the plan to the user, ask them to confirm, and ask whether to update master records when there are existing_match_with_diffs entries. ' +
      'Then call again with dry_run:false and the appropriate on_employee_conflict policy. ' +
      'Requires the write scope.',
    inputSchema: input,
    annotations: {
      title: 'Add users to contract',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    requiredScope: 'write',
    handler: addUsers as McpToolDef['handler'],
  },
];
