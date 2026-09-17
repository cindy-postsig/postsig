import logger from '@/utils/pino';

export interface CompanyEnrichment {
  name?: string;
  url?: string;
  businessType?: string;
  industry?: string;
  employeeCount?: number;
  revenue?: string;
  description?: string;
  headquarters?: string;
  foundedYear?: number;
  corporateJurisdiction?: string;
}

export async function fetchCompanyEnrichment(
  domain: string,
): Promise<CompanyEnrichment | null> {
  if (!domain) {
    return null;
  }

  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  try {
    timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://api.thecompaniesapi.com/v2/companies/${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Basic ${process.env.COMPANIES_API_KEY}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const enrichment: CompanyEnrichment = {};

    if (data.about?.name) {
      enrichment.name = data.about.name;
    }

    if (data.domain?.domain) {
      enrichment.url = `https://${data.domain.domain}`;
    }

    if (data.about?.businessType) {
      enrichment.businessType = data.about.businessType;
    }

    if (data.about?.industry) {
      enrichment.industry = data.about.industry;
    }

    if (typeof data.about?.totalEmployeesExact === 'number') {
      enrichment.employeeCount = data.about.totalEmployeesExact;
    }

    if (data.finances?.revenue) {
      enrichment.revenue = data.finances.revenue;
    }

    if (data.descriptions?.knowledgeGraph) {
      enrichment.description = data.descriptions.knowledgeGraph;
    } else if (data.descriptions?.primary) {
      enrichment.description = data.descriptions.primary;
    }

    if (data.locations?.headquarters) {
      const hq = data.locations.headquarters;
      const parts = [hq.city?.name, hq.country?.name].filter(Boolean);
      if (parts.length > 0) {
        enrichment.headquarters = parts.join(', ');
      }
    }

    if (typeof data.about?.yearFounded === 'number') {
      enrichment.foundedYear = data.about.yearFounded;
    }

    if (data.locations?.headquarters?.country?.name) {
      enrichment.corporateJurisdiction =
        data.locations.headquarters.country.name;
    }

    const hasData = Object.keys(enrichment).length > 0;
    if (!hasData) {
      return null;
    }

    return enrichment;
  } catch (error) {
    logger.debug({ error, domain }, 'Company enrichment fetch failed');
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
