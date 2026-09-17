'use server';

import logger from '@/utils/pino';

export type LogoSource = 'brandfetch' | 'logodev' | 'companies' | 'postsig';

export interface LogoResult {
  url: string | null;
  source?: LogoSource;
}

interface BrandfetchLogoFormat {
  src: string;
}

interface BrandfetchLogo {
  type: string;
  formats: BrandfetchLogoFormat[];
}

interface BrandfetchBrandResponse {
  logos?: BrandfetchLogo[];
}

interface BrandfetchSearchResult {
  icon: string | null;
  name: string | null;
  domain: string;
  brandId: string;
}

interface LogoDevSearchResult {
  name: string | null;
  domain: string;
}

export async function fetchFromBrandfetch(
  domain?: string,
  name?: string,
): Promise<LogoResult | null> {
  const apiKey = process.env.BRANDFETCH_API_KEY;
  const clientId = process.env.BRANDFETCH_CLIENT_ID;

  try {
    if (domain && apiKey) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(
          `https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            cache: 'no-store',
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        const data: BrandfetchBrandResponse = await response.json();
        logger.debug(
          {
            hasLogos: !!data.logos,
            logoCount: data.logos?.length,
            domain,
          },
          'Brandfetch response',
        );

        if (data.logos && data.logos.length > 0) {
          const iconLogo = data.logos.find((logo) => logo.type === 'icon');
          const symbolLogo = data.logos.find((logo) => logo.type === 'symbol');
          const targetLogo = iconLogo || symbolLogo;

          if (targetLogo?.formats && targetLogo.formats.length > 0) {
            const logoUrl = targetLogo.formats[0].src;
            logger.debug({ logoUrl, domain }, 'Found logo via Brandfetch');
            return { url: logoUrl, source: 'brandfetch' };
          }
        }
      }
    }

    if (name && clientId) {
      const cleanedName = name
        .replace(/[.,"]/g, '')
        .replace(/(ltd|llc|inc|international sl)/gi, '')
        .replace(/\(.*?\)/g, '')
        .trim();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let searchResponse: Response;
      try {
        searchResponse = await fetch(
          `https://api.brandfetch.io/v2/search/${encodeURIComponent(cleanedName)}?c=${clientId}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }

      if (searchResponse.ok) {
        const searchData: BrandfetchSearchResult[] =
          await searchResponse.json();

        if (searchData.length > 0) {
          const match =
            searchData.find(
              (company) =>
                company.name?.toLowerCase() === cleanedName.toLowerCase(),
            ) || searchData[0];

          if (match.icon) {
            logger.debug(
              { logoUrl: match.icon, name, domain: match.domain },
              'Found logo via Brandfetch name search (icon)',
            );
            return { url: match.icon, source: 'brandfetch' };
          }

          if (match.domain && apiKey) {
            const brandResult = await fetchFromBrandfetch(match.domain);
            if (brandResult) {
              logger.debug(
                { name, domain: match.domain },
                'Found logo via Brandfetch name search (brand lookup)',
              );
              return brandResult;
            }
          }
        }
      }
    }
  } catch (error) {
    logger.debug({ error, domain, name }, 'Brandfetch failed');
  }
  return null;
}

export async function fetchFromLogoDev(
  domain?: string,
  name?: string,
): Promise<LogoResult | null> {
  const publishableKey = process.env.LOGO_DEV_PUBLIC_KEY;
  const secretKey = process.env.LOGO_DEV_SECRET_KEY;

  if (!publishableKey) {
    logger.warn('LOGO_DEV_PUBLIC_KEY not configured');
    return null;
  }

  try {
    // fallback=404 returns a 404 instead of a generic monogram for unknown logos
    if (domain) {
      const logoUrl = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${publishableKey}&format=png&size=128&fallback=404`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(logoUrl, {
          method: 'GET',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        logger.debug({ logoUrl, domain }, 'Using Logo.dev image URL');
        return { url: logoUrl, source: 'logodev' };
      }
      logger.debug(
        { domain, status: response.status },
        'Logo.dev returned no logo for domain',
      );
    }

    if (name && secretKey) {
      const cleanedName = name
        .replace(/[.,"]/g, '')
        .replace(/(ltd|llc|inc|international sl)/gi, '')
        .replace(/\(.*?\)/g, '')
        .trim();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let searchResponse: Response;
      try {
        searchResponse = await fetch(
          `https://api.logo.dev/search?q=${encodeURIComponent(cleanedName)}&strategy=match`,
          {
            headers: {
              Authorization: `Bearer ${secretKey}`,
            },
            cache: 'no-store',
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timeout);
      }

      if (searchResponse.ok) {
        const searchData: LogoDevSearchResult[] = await searchResponse.json();

        if (searchData.length > 0) {
          const match =
            searchData.find(
              (company) =>
                company.name?.toLowerCase() === cleanedName.toLowerCase(),
            ) || searchData[0];

          if (match?.domain) {
            const logoUrl = `https://img.logo.dev/${encodeURIComponent(match.domain)}?token=${publishableKey}&format=png&size=128&fallback=404`;

            const verifyController = new AbortController();
            const verifyTimeout = setTimeout(
              () => verifyController.abort(),
              5000,
            );
            let verifyResponse: Response;
            try {
              verifyResponse = await fetch(logoUrl, {
                method: 'GET',
                signal: verifyController.signal,
              });
            } finally {
              clearTimeout(verifyTimeout);
            }

            if (verifyResponse.ok) {
              logger.debug(
                { logoUrl, name, domain: match.domain },
                'Found logo via Logo.dev name search',
              );
              return { url: logoUrl, source: 'logodev' };
            }
            logger.debug(
              { name, domain: match.domain, status: verifyResponse.status },
              'Logo.dev returned no logo for searched domain',
            );
          }
        }
      }
    }
  } catch (error) {
    logger.debug({ error, domain, name }, 'Logo.dev failed');
  }
  return null;
}

export async function fetchFromCompaniesAPI(
  domain: string,
): Promise<LogoResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(
        `https://api.thecompaniesapi.com/v2/companies/${encodeURIComponent(domain)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.COMPANIES_API_KEY}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      const data = await response.json();
      const logo = data.company?.assets?.logoSquare?.src;
      if (logo) {
        logger.debug({ logoUrl: logo, domain }, 'Found logo via Companies API');
        return { url: logo, source: 'companies' };
      }
    }
  } catch (error) {
    logger.debug({ error, domain }, 'Companies API failed');
  }
  return null;
}

export async function fetchCompanyLogo(
  name?: string,
  domain?: string,
): Promise<LogoResult> {
  if (name && name.toLowerCase().includes('postsig')) {
    return { url: '/PSAppIcon.png', source: 'postsig' };
  }

  let result: LogoResult | null = null;

  if (domain) {
    result = await fetchFromBrandfetch(domain);
    if (result) return result;

    result = await fetchFromLogoDev(domain);
    if (result) return result;

    result = await fetchFromCompaniesAPI(domain);
    if (result) return result;
  }

  if (name && !domain) {
    result = await fetchFromBrandfetch(undefined, name);
    if (result) return result;

    result = await fetchFromLogoDev(undefined, name);
    if (result) return result;
  }

  return { url: null };
}
