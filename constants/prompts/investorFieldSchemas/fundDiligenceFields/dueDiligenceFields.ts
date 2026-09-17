import { z } from 'zod';

export const ddDataRoomStructureSchema = z
  .object({
    folders_present: z
      .array(z.string())
      .nullable()
      .describe('List of top-level data room folders/categories present'),
    gap_analysis: z
      .array(
        z.object({
          missing_category: z
            .string()
            .describe('Name of expected but missing category'),
          risk_rating: z
            .enum(['high', 'medium', 'low'])
            .describe('Risk rating for this gap (preliminary indicator only)'),
        }),
      )
      .nullable()
      .describe('Missing categories and their risk ratings'),
  })
  .nullable()
  .describe(
    'Extract data room structure from this Due Diligence Package. List all top-level folders/categories present, and identify missing categories with a preliminary risk rating. Common expected categories: corporate docs, financials, IP, contracts, employment, litigation, tax, insurance, regulatory. IMPORTANT: Risk ratings are preliminary indicators only — expert counsel must validate. If not found, return null.',
  );

export const ddFinancialDataSchema = z
  .array(
    z.object({
      period: z
        .string()
        .describe('Reporting period (e.g., "FY2024", "Q3 2025")'),
      revenue: z.number().nullable().describe('Revenue'),
      gross_profit: z.number().nullable().describe('Gross profit'),
      gross_margin_pct: z
        .number()
        .nullable()
        .describe('Gross margin percentage'),
      opex: z.number().nullable().describe('Operating expenses'),
      ebitda: z.number().nullable().describe('EBITDA'),
      net_income: z.number().nullable().describe('Net income'),
      cash: z.number().nullable().describe('Cash and equivalents'),
      total_debt: z.number().nullable().describe('Total debt'),
      burn_rate: z.number().nullable().describe('Monthly burn rate'),
      reconciliation_flag: z
        .boolean()
        .nullable()
        .describe('Whether numbers reconcile across documents'),
    }),
  )
  .nullable()
  .describe(
    'Extract financial data from this Due Diligence Package. For each reporting period, return key financials (revenue, gross profit, margin, opex, EBITDA, net income, cash, debt, burn rate) and flag any reconciliation issues across documents. If not found, return null.',
  );

export const ddMaterialContractsSchema = z
  .array(
    z.object({
      counterparty: z.string().describe('Counterparty name'),
      contract_type: z
        .string()
        .describe(
          'Type of contract (e.g., "customer", "vendor", "partnership")',
        ),
      value: z.number().nullable().describe('Contract value if stated'),
      term_end_date: z.string().nullable().describe('Term end date (ISO 8601)'),
      auto_renewal: z
        .boolean()
        .nullable()
        .describe('Whether contract auto-renews'),
      change_of_control_clause: z
        .boolean()
        .nullable()
        .describe('Whether a CoC clause exists'),
      exclusivity: z
        .boolean()
        .nullable()
        .describe('Whether exclusivity provisions exist'),
      termination_for_convenience: z
        .boolean()
        .nullable()
        .describe('Whether termination for convenience is available'),
    }),
  )
  .nullable()
  .describe(
    'Extract material contracts from this Due Diligence Package. For each contract, return counterparty, type, value, term end, auto-renewal, change of control clause, exclusivity, and termination for convenience. Focus on contracts material to the business. If not found, return null.',
  );

export const ddIpOwnershipSchema = z
  .object({
    patents: z
      .array(
        z.object({
          title: z.string().describe('Patent title or number'),
          status: z
            .string()
            .describe('Status (e.g., "granted", "pending", "provisional")'),
        }),
      )
      .nullable()
      .describe('Patent portfolio'),
    trademarks: z
      .array(z.string())
      .nullable()
      .describe('Registered trademarks'),
    copyrights: z
      .array(z.string())
      .nullable()
      .describe('Registered copyrights'),
    ip_assignments_per_founder: z
      .boolean()
      .nullable()
      .describe('Whether each founder has executed an IP assignment'),
    missing_assignments: z
      .array(z.string())
      .nullable()
      .describe('Names of founders/employees with missing IP assignments'),
    third_party_claims: z
      .boolean()
      .nullable()
      .describe('Whether any third-party IP claims exist'),
  })
  .nullable()
  .describe(
    'Extract IP ownership details from this Due Diligence Package. List patents (with status), trademarks, copyrights, verify founder IP assignments, flag missing assignments, and note any third-party claims. If not found, return null.',
  );

export const ddEmployeeEquitySchema = z
  .object({
    headcount_total: z.number().nullable().describe('Total headcount'),
    headcount_by_department: z
      .record(z.string(), z.number())
      .nullable()
      .describe('Headcount by department'),
    key_employees_with_non_compete: z
      .array(z.string())
      .nullable()
      .describe('Key employees with non-compete agreements'),
    unformalised_equity_grants: z
      .boolean()
      .nullable()
      .describe('Whether there are unformalised or undocumented equity grants'),
    founder_vesting: z
      .object({
        fully_vested: z
          .boolean()
          .nullable()
          .describe('Whether founder shares are fully vested'),
        schedule: z
          .string()
          .nullable()
          .describe('Vesting schedule if still vesting'),
        cliff_passed: z
          .boolean()
          .nullable()
          .describe('Whether the cliff has passed'),
      })
      .nullable()
      .describe('Founder vesting status'),
  })
  .nullable()
  .describe(
    'Extract employee and equity details from this Due Diligence Package. Include total headcount, headcount by department, key employees with non-competes, any unformalised equity grants, and founder vesting status. If not found, return null.',
  );

export const ddLitigationComplianceSchema = z
  .object({
    pending_litigation: z
      .array(
        z.object({
          opposing_party: z.string().describe('Opposing party'),
          nature: z.string().describe('Nature of the claim'),
          amount_at_stake: z.number().nullable().describe('Amount at stake'),
          status: z.string().describe('Current status'),
          materiality: z
            .enum(['material', 'immaterial', 'unknown'])
            .describe('Materiality assessment'),
        }),
      )
      .nullable()
      .describe('Pending litigation matters'),
    threatened_claims: z
      .array(z.string())
      .nullable()
      .describe('Known threatened claims'),
    regulatory_investigations: z
      .array(z.string())
      .nullable()
      .describe('Ongoing regulatory investigations'),
    compliance_certifications: z
      .array(z.string())
      .nullable()
      .describe('Compliance certifications held (e.g., "SOC 2", "ISO 27001")'),
  })
  .nullable()
  .describe(
    'Extract litigation and compliance data from this Due Diligence Package. List pending litigation (with parties, nature, amounts, status, materiality), threatened claims, regulatory investigations, and compliance certifications. If not found, return null.',
  );
