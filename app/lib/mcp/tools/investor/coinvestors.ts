import { z } from 'zod';
import { NotFoundToolError } from '@/app/lib/mcp/errors';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';
import {
  getInvCoInvestors,
  getInvCoInvestorNetwork,
  getScopedPortfolioInvCompanies,
} from '@/lib/v2/inv/service';
import { resolveCompanyRef } from './resolve-company';

// =============================================================================
// list_co_investors
// =============================================================================

const listCoInvestorsInput = z.object({
  min_companies: z
    .number()
    .int()
    .optional()
    .describe(
      'Only return co-investors that share at least this many of our portfolio companies.',
    ),
  min_rounds: z
    .number()
    .int()
    .optional()
    .describe(
      'Only return co-investors that have participated in at least this many of our financing rounds.',
    ),
  shared_company: z
    .string()
    .optional()
    .describe(
      'Restrict to co-investors present in this specific portfolio company (public_id or name).',
    ),
  ...paginationSchema,
});

async function listCoInvestors(input: z.infer<typeof listCoInvestorsInput>) {
  const network = await getInvCoInvestorNetwork();
  let entries = Array.from(network.values());

  if (input.shared_company) {
    const company = await resolveCompanyRef(input.shared_company);
    entries = entries.filter((e) => e.companyNames.includes(company.name));
  }
  if (input.min_companies !== undefined) {
    entries = entries.filter(
      (e) => e.companiesCoinvested >= input.min_companies!,
    );
  }
  if (input.min_rounds !== undefined) {
    entries = entries.filter((e) => e.roundsParticipated >= input.min_rounds!);
  }

  entries.sort(
    (a, b) =>
      b.companiesCoinvested - a.companiesCoinvested ||
      (b.totalCoinvested ?? 0) - (a.totalCoinvested ?? 0),
  );

  const page = paginate(entries, input);
  return {
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    coInvestors: page.items.map((e) => ({
      name: e.investorName,
      investorType: e.investorType,
      roundsParticipated: e.roundsParticipated,
      companiesCoinvested: e.companiesCoinvested,
      companyNames: e.companyNames,
      totalCoinvestedUSD: e.totalCoinvested,
    })),
  };
}

// =============================================================================
// get_co_investor
// =============================================================================

const getCoInvestorInput = z.object({
  name: z
    .string()
    .describe('Co-investor name (case-insensitive). From list_co_investors.'),
});

async function getCoInvestor(input: z.infer<typeof getCoInvestorInput>) {
  const network = await getInvCoInvestorNetwork();
  const needle = input.name.trim().toLowerCase();
  const entry = Array.from(network.values()).find(
    (e) => e.investorName.toLowerCase() === needle,
  );
  if (!entry) {
    throw new NotFoundToolError('Co-investor', input.name);
  }

  // Resolve the shared company names to public ids so the agent can drill in
  // with get_company_co_investors. The network view carries names only, so a
  // name shared by several companies cannot be pinned to one and stays null.
  const companies = await getScopedPortfolioInvCompanies();
  const idsByName = new Map<string, string[]>();
  for (const c of companies) {
    idsByName.set(c.name, [...(idsByName.get(c.name) ?? []), c.publicId]);
  }
  const sharedCompanies = entry.companyNames.map((name) => {
    const ids = idsByName.get(name) ?? [];
    return { publicId: ids.length === 1 ? ids[0] : null, name };
  });

  return {
    name: entry.investorName,
    investorType: entry.investorType,
    roundsParticipated: entry.roundsParticipated,
    companiesCoinvested: entry.companiesCoinvested,
    totalCoinvestedUSD: entry.totalCoinvested,
    sharedCompanies,
  };
}

// =============================================================================
// get_company_co_investors
// =============================================================================

const getCompanyCoInvestorsInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id or name (from list_portfolio_companies).',
    ),
});

async function getCompanyCoInvestors(
  input: z.infer<typeof getCompanyCoInvestorsInput>,
) {
  const company = await resolveCompanyRef(input.public_id);
  const { coInvestors } = await getInvCoInvestors(company.id);

  const byRound = new Map<number, typeof coInvestors>();
  for (const ci of coInvestors) {
    const group = byRound.get(ci.financingRoundId);
    if (group) group.push(ci);
    else byRound.set(ci.financingRoundId, [ci]);
  }

  const uniqueInvestors = new Set(coInvestors.map((ci) => ci.investorName));
  const totalInvested = coInvestors.reduce(
    (sum, ci) => sum + (ci.amountInvested ?? 0),
    0,
  );

  const rounds = Array.from(byRound.values())
    .map((group) => {
      const first = group[0];
      return {
        stage: first.roundStageName,
        stageCode: first.roundStageCode,
        date: first.roundDate,
        coInvestorCount: group.length,
        totalInvested: group.reduce((s, ci) => s + (ci.amountInvested ?? 0), 0),
        coInvestors: group.map((ci) => ({
          name: ci.investorName,
          investorType: ci.investorType,
          relationship: ci.relationship,
          hasBoardSeat: ci.hasBoardSeat,
          isMajorInvestor: ci.isMajorInvestor,
          amountInvested: ci.amountInvested,
          currency: ci.currency,
        })),
      };
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    publicId: company.publicId,
    name: company.name,
    count: uniqueInvestors.size,
    dealCount: coInvestors.length,
    totalInvested,
    rounds,
  };
}

export const coinvestorTools: McpToolDef[] = [
  {
    name: 'list_co_investors',
    description:
      'List every co-investor that has participated alongside our funds across the portfolio, with rollup stats — how many of our financing rounds they joined, how many of our portfolio companies they share, the company names, and total dollars committed alongside us. ' +
      'Filters: shared_company (only co-investors in that portco), min_companies, min_rounds. Sorted by companies shared then total dollars. Paginated.',
    inputSchema: listCoInvestorsInput,
    annotations: {
      title: 'List co-investors',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listCoInvestors as McpToolDef['handler'],
  },
  {
    name: 'get_co_investor',
    description:
      'Rollup on one co-investor across our portfolio: investor type, how many of our rounds and companies they participated in, total dollars committed alongside us, and the shared portfolio companies (with public ids to drill in via get_company_co_investors). Use after list_co_investors.',
    inputSchema: getCoInvestorInput,
    annotations: {
      title: 'Get co-investor',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCoInvestor as McpToolDef['handler'],
  },
  {
    name: 'get_company_co_investors',
    description:
      'All co-investors on a specific portfolio company, grouped by financing round (newest first). Each round carries the stage, date, co-investor count, total committed, and per-investor detail — investor type, relationship, board seat, major-investor flag, and amount invested. Use for "who else is on the cap table" or "who came in at Series A" questions.',
    inputSchema: getCompanyCoInvestorsInput,
    annotations: {
      title: 'Get company co-investors',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyCoInvestors as McpToolDef['handler'],
  },
];
