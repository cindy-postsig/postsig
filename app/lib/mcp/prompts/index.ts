import { z } from 'zod';

export interface McpPromptDef {
  name: string;
  description: string;
  argsSchema?: z.ZodRawShape;
  /** Returns the user-facing seed message text. The route handler wraps it
   *  in the SDK's GetPromptResult shape. */
  build: (args: Record<string, unknown>) => string;
}

export const allMcpPrompts: McpPromptDef[] = [
  {
    name: 'upcoming-renewals-review',
    description:
      'Walk the user through contracts whose action date (notice/cancel-by/term-end) falls within a given window. Uses get_upcoming_renewals.',
    argsSchema: {
      days: z
        .string()
        .optional()
        .describe(
          'Window in days from today (default 60). Pass as a string per MCP prompt arg convention.',
        ),
    },
    build: (args) => {
      const raw = (args.days as string | undefined) ?? '60';
      const days = Number.isFinite(Number(raw)) ? Number(raw) : 60;
      return [
        `Review every contract whose action date falls in the next ${days} days.`,
        '',
        'Steps:',
        `1. Call get_upcoming_renewals with days=${days}.`,
        "2. For each contract, summarise the soonest action (notice/cancel-by/term-end), the renewal type, and the current annual spend (formatted in the response's baseCurrency).",
        '3. Group by urgency: "this week", "next 30 days", and "later".',
        '4. Flag any contract with auto_renewal=true and no business_sponsor — those are highest priority.',
        '5. Offer to call get_renewal_summary on any single contract for deeper detail.',
      ].join('\n');
    },
  },
  {
    name: 'dora-ict-audit',
    description:
      'Run the DORA ICT-provider audit and walk the user through findings. Uses get_report_data with type=dora.',
    build: () =>
      [
        'Run a DORA ICT-provider audit.',
        '',
        'Steps:',
        '1. Call get_report_data with type="dora" and active_tab="ict" to get ICT-classified vendors.',
        '2. Summarise: how many ICT providers, total annual spend, total contract value (TCV).',
        '3. Highlight any ICT vendor with: missing key clauses (call get_contract on a few to spot-check), no business_sponsor, or auto_renewal=true.',
        '4. Then call get_report_data with active_tab="other" and contrast non-ICT exposure.',
        '5. Conclude with a short risk note: where are the gaps?',
      ].join('\n'),
  },
  {
    name: 'unowned-contracts',
    description:
      'Find active contracts with no business sponsor. Uses query_contracts and get_contract.',
    build: () =>
      [
        'Find active contracts that lack a business sponsor (owner) and surface them for ownership assignment.',
        '',
        'Steps:',
        '1. Call query_contracts with status="active". Iterate pages with the cursor until exhausted.',
        '2. Filter the results to those whose businessSponsor is null.',
        '3. Sort by currentAnnualSpendBase desc — the most expensive unowned contracts go first.',
        '4. Return a tight list (top 20) with: contract id, name, vendor, term end, annual spend.',
        '5. Suggest update_contract calls to assign sponsors, but DO NOT execute them — confirm each with the user first.',
      ].join('\n'),
  },
];
