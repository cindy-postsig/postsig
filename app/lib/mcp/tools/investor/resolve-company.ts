import { z } from 'zod';
import { getInvCompany, type InvCompany } from '@/lib/v2/inv';
import { getScopedPortfolioInvCompanies } from '@/lib/v2/inv/service';
import { NotFoundError } from '@/lib/errors';
import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';

// public_id is a Postgres UUID column, so any 8-4-4-4-12 hex string is an id —
// including imported ones without RFC version/variant bits, which z.uuid()
// would reject and send down the name path.
const publicIdSchema = z.guid();

// Case, spacing and punctuation carry no meaning in a company name: "acme inc"
// and "Acme, Inc." are the same company.
const normalizeName = (name: string): string =>
  name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Resolves the company reference every per-company tool takes. A public_id
 * (UUID) is looked up directly; anything else is matched as a company name,
 * since people ask for companies by name and only the tools know the ids.
 */
export async function resolveCompanyRef(ref: string): Promise<InvCompany> {
  const trimmed = ref.trim();
  const publicId = publicIdSchema.safeParse(trimmed).success
    ? trimmed
    : await findPublicIdByName(trimmed);

  try {
    const { company } = await getInvCompany(publicId);
    return company;
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new NotFoundToolError('Portfolio company', ref);
    }
    throw err;
  }
}

/**
 * A full name wins outright; otherwise a partial name is matched anywhere in
 * the company name. Neither is unique, so several hits are reported back as
 * candidates rather than guessed at — a confidently wrong company is worse
 * than an error.
 */
async function findPublicIdByName(name: string): Promise<string> {
  const needle = normalizeName(name);
  if (!needle) {
    throw new NotFoundToolError('Portfolio company', name);
  }

  const companies = await getScopedPortfolioInvCompanies();
  const exact = companies.filter((c) => normalizeName(c.name) === needle);
  const matches =
    exact.length > 0
      ? exact
      : companies.filter((c) => normalizeName(c.name).includes(needle));

  if (matches.length === 0) {
    throw new NotFoundToolError('Portfolio company', name);
  }
  if (matches.length > 1) {
    throw new ValidationToolError(
      `"${name}" matches ${matches.length} portfolio companies: ${matches
        .map((c) => `${c.name} (${c.publicId})`)
        .join(', ')}. Retry with one public_id or a more specific name.`,
    );
  }
  return matches[0].publicId;
}
