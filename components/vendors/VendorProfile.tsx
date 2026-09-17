'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Loading from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import type { VendorProfile as VendorProfileData } from '@/app/lib/vendors/fetch-profile';
import logger from '@/utils/pino';

const POSTSIG_OVERRIDES = {
  description:
    'PostSig is a cutting-edge contract performance management platform focused on delivering actionable post-signature data to the capital markets industry. Headquartered in San Francisco, the AI-powered platform eliminates time-consuming manual processes, reduces risk and transforms contracts from passive documents into strategic business assets. With PostSig, data teams can reduce expenses and increase revenue by unlocking value from their otherwise dormant data agreements.',
  website: 'postsig.com',
  linkedin: 'https://www.linkedin.com/company/postsig',
  yearFounded: 2023,
};

const LABEL_CLASS = 'font-bold font-label text-xs uppercase tracking-wide';

export interface VendorProfileVendor {
  name: string;
  domain?: string | null;
  description?: string | null;
  address?: string | null;
  phone?: number | null;
  asset_classes?: Array<{ asset_class: { id: number; name: string } }>;
}

async function fetchVendorProfileClient(
  domain: string,
  signal?: AbortSignal,
): Promise<VendorProfileData | null> {
  const params = new URLSearchParams();
  params.append('domain', domain);

  const response = await fetch(`/api/vendors/profile?${params.toString()}`, {
    signal,
  });
  if (!response.ok) return null;
  return await response.json();
}

function formatAddress(address: string) {
  if (address.includes('\n')) {
    return address.split('\n').map((line, index, array) => (
      <span key={index}>
        {line.trim()}
        {index < array.length - 1 && <br />}
      </span>
    ));
  }

  // Single line: find the LAST two-letter state token ("NY 10055, USA"), then
  // treat everything after the second-to-last comma before it as city/state.
  const statePattern = /\b([A-Z]{2})(?=\s|\d|,|$)/g;
  let match;
  let lastStateMatch = null;
  while ((match = statePattern.exec(address)) !== null) {
    lastStateMatch = match;
  }

  if (lastStateMatch) {
    const beforeState = address.substring(0, lastStateMatch.index);
    const lastCommaIndex = beforeState.lastIndexOf(',');
    const secondToLastCommaIndex =
      lastCommaIndex > 0
        ? beforeState.substring(0, lastCommaIndex).lastIndexOf(',')
        : -1;

    if (secondToLastCommaIndex > 0) {
      const streetLines = address
        .substring(0, secondToLastCommaIndex)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const cityStatePart = address
        .substring(secondToLastCommaIndex + 1)
        .trim();

      if (streetLines.length >= 1) {
        return (
          <>
            {streetLines.map((line, index) => (
              <span key={index}>
                {line}
                <br />
              </span>
            ))}
            <span>{cityStatePart}</span>
          </>
        );
      }
    }
  }

  return address;
}

export function VendorProfile({ vendor }: { vendor: VendorProfileVendor }) {
  const [profileData, setProfileData] = useState<VendorProfileData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  const isPostSig = vendor.name.toLowerCase().includes('postsig');

  useEffect(() => {
    const controller = new AbortController();
    // The route keeps this component mounted across vendors, so a superseded
    // request must not write its result or clear the loading state.
    let active = true;

    async function fetchData() {
      setProfileData(null);
      setIsExpanded(false);
      setLoading(true);
      try {
        if (!isPostSig && vendor.domain) {
          const profile = await fetchVendorProfileClient(
            vendor.domain,
            controller.signal,
          );
          if (active) setProfileData(profile);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          logger.error(
            { error, vendorName: vendor.name, vendorDomain: vendor.domain },
            'Error fetching vendor profile',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [vendor.name, vendor.domain, isPostSig]);

  const description = isPostSig
    ? POSTSIG_OVERRIDES.description
    : (vendor.description ?? profileData?.description ?? null);
  const website = isPostSig
    ? POSTSIG_OVERRIDES.website
    : (vendor.domain ?? profileData?.domain);
  const yearsInBusiness = isPostSig
    ? new Date().getFullYear() - POSTSIG_OVERRIDES.yearFounded
    : profileData?.yearFounded != null
      ? new Date().getFullYear() - profileData.yearFounded
      : null;
  const address = vendor.address ?? profileData?.address?.raw ?? null;
  const cityCountry = [
    profileData?.address?.city,
    profileData?.address?.country,
  ]
    .filter(Boolean)
    .join(', ');
  const assetClasses = (vendor.asset_classes ?? []).filter(
    (entry, index, all) =>
      index ===
      all.findIndex((other) => other.asset_class.id === entry.asset_class.id),
  );

  if (loading) {
    return (
      <div className="flex min-h-[300px] w-full items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-12">
      <div className="grid w-full grid-cols-4 gap-12">
        <div className="col-span-3 flex flex-col gap-1">
          <h2 className={LABEL_CLASS}>About</h2>
          <div className="font-serif text-lg">
            {description ? (
              <>
                <div
                  ref={descriptionRef}
                  className={`relative overflow-hidden transition-[max-height] duration-500 ease-in-out ${
                    isExpanded ? '' : 'line-clamp-[6]'
                  }`}
                >
                  <p>{description}</p>
                </div>
                {description.length > 200 && (
                  <button
                    onClick={() => setIsExpanded((current) => !current)}
                    className="mt-2 font-label text-sm text-primary hover:underline"
                  >
                    {isExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </>
            ) : (
              <p>No description available.</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-8">
          {(address || (cityCountry && !isPostSig)) && (
            <div className="flex flex-col gap-1">
              <h2 className={LABEL_CLASS}>Address</h2>
              <p className="font-label text-sm">
                {address ? formatAddress(address) : cityCountry}
                {vendor.phone && (
                  <>
                    <br />
                    {vendor.phone}
                  </>
                )}
              </p>
            </div>
          )}

          {yearsInBusiness != null && (
            <div className="flex flex-col gap-1">
              <h2 className={LABEL_CLASS}>Years in Business</h2>
              <p className="font-label text-sm">{yearsInBusiness}</p>
            </div>
          )}

          {website && (
            <div className="flex flex-col gap-1">
              <h2 className={LABEL_CLASS}>Website</h2>
              <p className="font-label text-sm text-primary">
                <Link
                  href={
                    website.startsWith('http') ? website : `https://${website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {website}
                </Link>
              </p>
            </div>
          )}

          <div className="my-1 flex gap-4">
            {isPostSig ? (
              <Link
                href={POSTSIG_OVERRIDES.linkedin}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  alt="LinkedIn Account"
                  src={'/icons/Linkedin.svg'}
                  width={20}
                  height={20}
                />
              </Link>
            ) : (
              <>
                {profileData?.socials?.twitter?.url && (
                  <Link
                    href={profileData.socials.twitter.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      alt="X Account"
                      src={'/icons/X.svg'}
                      width={20}
                      height={20}
                      className="dark:invert"
                    />
                  </Link>
                )}
                {profileData?.socials?.linkedin?.url && (
                  <Link
                    href={profileData.socials.linkedin.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      alt="LinkedIn Account"
                      src={'/icons/Linkedin.svg'}
                      width={20}
                      height={20}
                      className="dark:invert"
                    />
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {assetClasses.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className={LABEL_CLASS}>Asset Classes</h2>
          <div>
            {assetClasses.map((entry) => (
              <Badge
                key={entry.asset_class.id}
                variant="secondary"
                className="mb-[2px] mr-1"
              >
                {entry.asset_class.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
