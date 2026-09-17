'use server';

import logger from '@/utils/pino';

export interface VendorProfile {
  domain?: string;
  description?: string;
  logo?: string;
  logoSource?: string;
  yearFounded?: number;
  address?: {
    raw?: string;
    city?: string;
    country?: string;
  };
  socials?: {
    twitter?: { url: string };
    linkedin?: { url: string };
  };
  // Provider payloads intentionally omitted from public API to reduce
  // payload size and avoid leaking third-party data structures
}

export async function fetchVendorProfile(
  domain: string,
): Promise<VendorProfile | null> {
  if (!domain) {
    logger.debug('No domain provided for profile fetch');
    return null;
  }

  const profile: VendorProfile = { domain };

  // Fetch from both Brandfetch and Companies API in parallel
  const [brandfetchResult, companiesResult] = await Promise.allSettled([
    fetchBrandfetchProfile(domain),
    fetchCompaniesProfile(domain),
  ]);

  // Process Brandfetch data
  if (brandfetchResult.status === 'fulfilled' && brandfetchResult.value) {
    const brandfetch = brandfetchResult.value;

    if (brandfetch.longDescription) {
      profile.description = brandfetch.longDescription;
    }

    if (brandfetch.company?.foundedYear) {
      profile.yearFounded = brandfetch.company.foundedYear;
    }

    // Extract logo from brandfetch
    if (brandfetch.logos && brandfetch.logos.length > 0) {
      const iconLogo = brandfetch.logos.find(
        (logo: any) => logo.type === 'icon',
      );
      const symbolLogo = brandfetch.logos.find(
        (logo: any) => logo.type === 'symbol',
      );
      const targetLogo = iconLogo || symbolLogo;

      if (targetLogo && targetLogo.formats && targetLogo.formats.length > 0) {
        profile.logo = targetLogo.formats[0].src;
        profile.logoSource = 'brandfetch';
      }
    }
  }

  // Process Companies API data
  if (companiesResult.status === 'fulfilled' && companiesResult.value) {
    const companies = companiesResult.value;

    // Use Companies API data if not already set by Brandfetch
    if (!profile.description && companies.descriptions?.primary) {
      profile.description = companies.descriptions.primary;
    }

    if (!profile.yearFounded && companies.yearFounded) {
      profile.yearFounded = companies.yearFounded;
    }

    if (!profile.logo && companies.company?.assets?.logoSquare?.src) {
      profile.logo = companies.company.assets.logoSquare.src;
      profile.logoSource = 'companies';
    }

    if (companies.locations?.headquarters) {
      profile.address = {
        raw: companies.locations.headquarters.address?.raw,
        city: companies.locations.headquarters.city?.name,
        country: companies.locations.headquarters.country?.name,
      };
    }

    if (companies.socials) {
      profile.socials = {
        twitter: companies.socials.twitter?.url
          ? { url: companies.socials.twitter.url }
          : undefined,
        linkedin: companies.socials.linkedin?.url
          ? { url: companies.socials.linkedin.url }
          : undefined,
      };
    }
  }

  // If we got no useful data, return null
  if (
    !profile.description &&
    !profile.logo &&
    !profile.yearFounded &&
    !profile.address &&
    !profile.socials
  ) {
    return null;
  }

  return profile;
}

async function fetchBrandfetchProfile(domain: string): Promise<any | null> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  try {
    timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      `https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.BRANDFETCH_API_KEY}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    logger.debug({ error, domain }, 'Brandfetch profile fetch failed');
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  return null;
}

async function fetchCompaniesProfile(domain: string): Promise<any | null> {
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

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    logger.debug({ error, domain }, 'Companies API profile fetch failed');
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  return null;
}
