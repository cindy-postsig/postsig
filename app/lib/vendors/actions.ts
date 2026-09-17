'use server';
import { getUserMetadata } from '@/data/users';
import logger from '@/utils/pino';
import { createClient } from '@/utils/supabase/server';
import {
  throwAuthenticationError,
  throwNotFoundError,
  AuthorizationError,
  ExternalServiceError,
  DatabaseError,
} from '../../../lib/errors';
import {
  fetchRelatedContractsByUserRoles,
  fetchSingleVendorByUserRoles,
  fetchVendorContractsByUserRoles,
  findVendorsByUserRoles,
  upsertOrganizationVendorDetails,
} from '@/data/superuser/vendors';
import { defineAbilitiesFor } from '@postsig/toolkit';
import { isValidClientRole } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';
import {
  vendorOrgDetailsInputSchema,
  type VendorOrgDetails,
  type VendorOrgDetailsInput,
} from '@/lib/v2/vendors/details';
import {
  FetchVendorContractsParams,
  FetchSingleVendorParams,
  FindVendorsParams,
  FetchRelatedContractsParams,
} from '@/constants/types';
import _ from 'lodash';
import { convertAllProductsToUSD } from '@/lib/v2';
import { buildBaseCurrencyRates } from '@/lib/v2/core/baseRates';
import { getContractStartDate } from '@/lib/v2/products/transforms';

/**
 * Vendor writes are server actions, so the UI's disabled controls bound
 * nothing — a recovered Next-Action id reaches them directly.
 */
async function assertCanUpdateVendors() {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throwAuthenticationError('User metadata not found');
  }
  if (!isValidClientRole(userMetadata.userRole)) {
    throw new AuthorizationError('Invalid user role');
  }
  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole,
    organizationId: userMetadata.organizationId,
  });
  if (!ability.can('update', 'Vendor')) {
    throw new AuthorizationError('Unauthorized: Cannot update vendors');
  }
  return userMetadata;
}

export async function fetchSingleVendor({ id }: FetchSingleVendorParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throwAuthenticationError('User metadata not found');
  }
  return fetchSingleVendorByUserRoles({ id, userMetadata });
}

export async function findVendors({
  column,
  value,
  userId,
}: FindVendorsParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throwAuthenticationError('User metadata not found');
  }
  return findVendorsByUserRoles({ column, value, userId, userMetadata });
}

export async function fetchVendorContracts({
  id,
  contractFields,
}: FetchVendorContractsParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throwAuthenticationError('User metadata not found');
  }
  const contracts = await fetchVendorContractsByUserRoles({
    id,
    contractFields,
    userMetadata,
  });
  const rates = await buildBaseCurrencyRates(
    contracts.map(
      (contract: {
        currency?: string | null;
        term_start_date?: Array<{ date: string | null }> | null;
      }) => ({
        currency: contract?.currency,
        startDate: getContractStartDate({
          term_start_date: contract?.term_start_date,
        }),
      }),
    ),
    userMetadata.baseCurrency,
  );
  const contractsInBaseCurrency = await Promise.all(
    contracts.map(async (contract: any) => {
      if (!contract) return contract;
      const productsInBaseCurrency = await convertAllProductsToUSD(
        contract,
        userMetadata.baseCurrency,
        rates,
      );
      return {
        ...contract,
        vendor_products_details: productsInBaseCurrency,
      };
    }),
  );
  return contractsInBaseCurrency;
}

export async function fetchRelatedContracts({
  id,
}: FetchRelatedContractsParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throwAuthenticationError('User metadata not found');
  }
  return fetchRelatedContractsByUserRoles({
    id,
    userMetadata,
  });
}

// Attribution comes from the session, not the argument list: a caller-supplied
// id would let an authorized account write vendors under someone else's name.
export async function updateVendor(id: number | null, data: any) {
  const userMetadata = await assertCanUpdateVendors();

  const supabase = await createClient();

  data.user_id = userMetadata.userId;
  try {
    if (!id) {
      const { data: insertData, error: insertError } = await supabase
        .from('vendors')
        .insert(data)
        .select();
      if (insertError) throw insertError;
      return insertData;
    }
    const { data: existingVendor, error: selectError } = await supabase
      .from('vendors')
      .select()
      .eq('id', id)
      .single();
    if (selectError) throw selectError;
    if (existingVendor) {
      const { data: updateData, error } = await supabase
        .from('vendors')
        // @ts-ignore - Supabase type inference issue
        .update(data)
        .eq('id', id)
        .select();
      if (error) throw error;
      return updateData;
    }
  } catch (error: any) {
    logger.error(error, 'Error updating vendor');
    throw new DatabaseError('Failed to update vendor', error);
  }
}

export async function insertVendor({
  name,
  address,
}: {
  name: string;
  address: string;
}) {
  return updateVendor(null, { name, address });
}

export async function findVendorProductsDetailsForExtractors(
  user_id: string,
  query?: { contract_id: number },
) {
  const supabase = await createClient();
  const vendorQuery = supabase
    .from('vendor_products_details')
    .select('*')
    .eq('user_id', user_id);
  if (query) {
    _.forIn(query, (value, key) => {
      vendorQuery.eq(key, value);
    });
  }
  const { data, error } = await vendorQuery;
  if (error) throw error;
  return data;
}

export async function updateVendorIctStatus(
  vendorId: number,
  isIctProvider: boolean,
) {
  try {
    return await updateVendor(vendorId, { ict_provider: isIctProvider });
  } catch (error: any) {
    logger.error(error, 'Error updating vendor ICT status');
    throw new DatabaseError('Failed to update vendor ICT status', error);
  }
}

// Type definition for news items
type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

export async function fetchVendorNews(vendorName: string): Promise<NewsItem[]> {
  try {
    // Clean the vendor name for search
    let searchName = vendorName.trim();

    // First handle special cases like "International SL"
    searchName = searchName.replace(/\bInternational\s+S\.?L\.?\b/gi, '');

    // Remove common suffixes that clutter search results
    searchName = searchName.replace(
      /\b(LLC|Group|LP|Ltd\.?|Inc\.?|Corporation|GmbH|Corp\.?|Limited|International|S\.?L\.?)\b/gi,
      '',
    );

    // Special case: keep "Group" for single-word company names
    const words = searchName.trim().split(/\s+/);
    if (words.length === 1 && vendorName.includes('Group')) {
      searchName = vendorName;
    }

    // Remove periods, commas, and extra spaces
    searchName = searchName.replace(/[.,]/g, '').trim();

    // Generate name variants for matching
    const nameVariants = generateNameVariants(vendorName, searchName, words);

    // Log the transformation for debugging
    logger.debug(
      {
        vendorName,
        searchName,
      },
      `Original: "${vendorName}" → Searching for: "${searchName}"`,
    );
    logger.debug(
      {
        nameVariants,
      },
      `Name variants for matching: ${nameVariants.join(', ')}`,
    );

    // Create exact match query with quotes
    const exactQuery = `${searchName}`;

    // Tier 1: Most reputable financial news sources
    const tier1Sources = [
      'waterstechnology.com', // Technology in finance
      'wealthmanagement.com', // Wealth management
      'tradersmagazine.com',
      'thetrade.com', // Trading industry

      'techcrunch.com',
      //'institutionalinvestor.com',

      //'bloomberg.com', // Major financial news
      //'ft.com', // Financial Times
      //'reuters.com', // Global news agency
      //'cnbc.com', // Business news network
    ];

    // Tier 2: Industry-specific and PR sources
    const tier2Sources = [
      'fintechfutures.com', // Fintech news
      //'businessinsider.com', // Business news site
      'investors.com', // Investment site
      'businesswire.com', // Press release distribution
      'prnewswire.com', // Press release distribution
      'gpbullhound.com', // Investment banking
      'crowdfundinsider.com', // Fintech news

      'taxjournal.com', // Tax news
      'financefeeds.com', // Finance industry
      'thefullfx.com', // FX markets
    ];

    // First try with just tier 1 sources
    let siteFilters = tier1Sources.map((site) => `site:${site}`).join('+OR+');
    let baseUrl = 'https://news.google.com/rss/search';
    let queryParams = `q=${exactQuery}%20${siteFilters}&hl=en-US&gl=US&ceid=US:en`;
    let url = `${baseUrl}?${queryParams}`;

    logger.debug({ url }, `Tier 1 Search URL: ${url}`);

    // Fetch from tier 1 sources
    let response = await fetch(url, { next: { revalidate: 3600 } }); // Cache for 1 hour

    if (!response.ok) {
      throw new ExternalServiceError(
        'NewsAPI',
        `Failed to fetch news: ${response.status}`,
      );
    }

    let tier1XmlData = await response.text();

    // Extract and filter tier 1 results
    const tier1Results = await extractAndFilterNewsItems(
      tier1XmlData,
      nameVariants,
    );
    logger.info(
      { count: tier1Results.length },
      `Found ${tier1Results.length} relevant items in tier 1 sources`,
    );

    // Initialize results array with tier 1 matches
    let allResults = [...tier1Results];

    // If tier 1 didn't yield enough results, try tier 2 sources
    if (tier1Results.length < 3) {
      logger.info('Not enough results from tier 1, trying tier 2 sources...');

      // Use only tier 2 sources for the second attempt
      siteFilters = tier2Sources.map((site) => `site:${site}`).join('+OR+');
      queryParams = `q=${exactQuery}%20${siteFilters}&hl=en-US&gl=US&ceid=US:en`;
      url = `${baseUrl}?${queryParams}`;

      logger.debug({ url }, `Tier 2 sources search URL: ${url}`);

      response = await fetch(url, { next: { revalidate: 3600 } });

      if (!response.ok) {
        throw new ExternalServiceError(
          'NewsAPI',
          `Failed to fetch news from tier 2 sources: ${response.status}`,
        );
      }

      const tier2XmlData = await response.text();

      // Extract and filter tier 2 results
      const combinedResults = await extractAndFilterNewsItems(
        tier2XmlData,
        nameVariants,
      );

      // Add new results that aren't already in tier 1 results
      for (const item of combinedResults) {
        const isDuplicate = allResults.some(
          (existing) =>
            existing.title.toLowerCase() === item.title.toLowerCase(),
        );

        if (!isDuplicate) {
          allResults.push(item);
        }
      }

      logger.info(
        { newItemsCount: allResults.length - tier1Results.length },
        `Added ${allResults.length - tier1Results.length} new items from tier 2 sources`,
      );
    }

    // Sort by date (most recent first)
    allResults.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      return dateB - dateA; // Descending order (newest first)
    });

    // Final check - if we have tier1 results but less than 3, don't filter
    const tier1ResultsCount = allResults.filter((item) => {
      const domain = new URL(item.link).hostname;
      return tier1Sources.some((source) => domain.includes(source));
    }).length;

    if (tier1ResultsCount > 0 && tier1ResultsCount < 3) {
      logger.info(
        { tier1ResultsCount },
        `Found ${tier1ResultsCount} tier1 results, not filtering results`,
      );
      return allResults;
    }

    return allResults;
  } catch (error) {
    console.error('Error fetching vendor news:', error);
    return [];
  }
}

// Helper function to extract and filter news items from XML data
async function extractAndFilterNewsItems(
  xmlData: string,
  nameVariants: string[],
): Promise<NewsItem[]> {
  try {
    // Simple check for no items
    if (!xmlData.includes('<item>')) {
      return [];
    }

    // We can't use DOM parser server-side, so we'll parse the XML using string operations
    const items = xmlData.split('<item>').slice(1); // Skip the first split which is before items

    const results: NewsItem[] = [];

    const seenTitles = new Set<string>();

    for (const itemXml of items) {
      // Extract title
      const titleMatch = itemXml.match(/<title>(.*?)<\/title>/s);
      if (!titleMatch) continue;

      let title = titleMatch[1].trim();
      // Remove source info if present (typically after " - ")
      title = title.split(' - ')[0].trim();

      // Skip if we've seen this title already
      if (seenTitles.has(title.toLowerCase())) {
        continue;
      }

      // Check for company name in title
      const titleLower = title.toLowerCase();

      // Extract link
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/s);
      const link = linkMatch ? linkMatch[1].trim() : '';

      // Extract pubDate
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/s);
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';

      // Extract source
      const sourceMatch = itemXml.match(/<source[^>]*>(.*?)<\/source>/s);
      const source = sourceMatch ? sourceMatch[1].trim() : '';

      // Extract description
      const descriptionMatch = itemXml.match(
        /<description>(.*?)<\/description>/s,
      );
      const description = descriptionMatch ? descriptionMatch[1].trim() : '';
      const descriptionLower = description.toLowerCase();

      // Check if title or description contains any of the name variants
      let matches = false;
      let matchingVariant = '';

      for (const variant of nameVariants) {
        // Try title first (preferred)
        if (titleLower.includes(variant)) {
          matches = true;
          matchingVariant = variant;
          break;
        }

        // Check description
        if (variant.split(/\s+/).length === 1) {
          // For single words, be more careful to avoid false positives
          // Use case-sensitive matching for single words
          const originalVariant =
            variant.charAt(0).toUpperCase() + variant.slice(1);
          if (
            description.includes(` ${originalVariant} `) || // Space on both sides
            description.startsWith(`${originalVariant} `) || // At start
            description.endsWith(` ${originalVariant}`) // At end
          ) {
            matches = true;
            matchingVariant = variant;
            break;
          }
        } else if (descriptionLower.includes(variant)) {
          // For multi-word variants, just check if present
          matches = true;
          matchingVariant = variant;
          break;
        }
      }

      // Skip if no match found
      if (!matches) {
        continue;
      }

      // Add to results if it matches
      seenTitles.add(title.toLowerCase());
      results.push({
        title,
        link,
        pubDate,
        source,
      });
    }

    return results.slice(0, 9);
  } catch (error) {
    console.error('Error extracting news items:', error);
    return [];
  }
}

// Helper function to generate name variants for matching
function generateNameVariants(
  vendorName: string,
  cleanName: string,
  words: string[],
) {
  const variants = [];

  // Full name without suffixes
  variants.push(cleanName.toLowerCase());

  // First word only (important for compound names)
  //if (words.length >= 1) {
  //  variants.push(words[0].toLowerCase());
  //}

  // First two words together (if available)
  if (words.length >= 2) {
    variants.push(words.slice(0, 2).join(' ').toLowerCase());
  }

  // Handle original names with commas (like "Exante Data, Inc")
  // Check if original name has a comma and use the part before it
  const commaParts = vendorName.split(',');
  if (commaParts.length > 1) {
    const beforeComma = commaParts[0].trim();
    variants.push(beforeComma.toLowerCase());

    // Also add first word and first two words from the comma part
    const commaWords = beforeComma.split(/\s+/);
    if (commaWords.length >= 1) {
      variants.push(commaWords[0].toLowerCase()); // First word
    }
    if (commaWords.length >= 2) {
      variants.push(commaWords.slice(0, 2).join(' ').toLowerCase()); // First two words together
    }
  }

  // Remove duplicates
  // Convert filtered variants to array, remove duplicates using object keys
  const uniqueVariants: string[] = [];
  const seen: Record<string, boolean> = {};

  for (const variant of variants.filter(Boolean)) {
    if (!seen[variant]) {
      seen[variant] = true;
      uniqueVariants.push(variant);
    }
  }

  return uniqueVariants;
}

export type UpdateVendorDetailsResult =
  | { ok: true; details: VendorOrgDetails }
  | { ok: false; error: string };

export async function updateVendorDetails(
  vendorId: number,
  input: VendorOrgDetailsInput,
): Promise<UpdateVendorDetailsResult> {
  const userMetadata = await assertCanUpdateVendors();

  const parsed = vendorOrgDetailsInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vendor details',
    };
  }

  const details = await upsertOrganizationVendorDetails(
    userMetadata.organizationId,
    vendorId,
    parsed.data,
  );
  revalidatePath(`/vendors/${vendorId}`);
  return { ok: true, details };
}
