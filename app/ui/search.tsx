'use client';

import { useState, useEffect, useRef, useContext } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { searchContracts } from '@/app/lib/contracts/search-actions';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { normalizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { useVendors } from '@/hooks/useVendors';
import { useOrgTags } from '@/hooks/api/useOrgTags';
import ContractLabel from '@/components/contracts/ContractLabel';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Badge } from '@/components/ui/badge';
import { UserContext } from '@/app/userProvider';
import { isInvoiceType } from '@/app/lib/constants';

export default function Search({
  placeholder,
  size = 'default',
  preloadedVendors,
}: {
  placeholder: string;
  size?: 'sm' | 'default';
  preloadedVendors?: any[];
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ContractTableRow[]>([]);
  const [matchingVendors, setMatchingVendors] = useState<any[]>([]);
  const [matchingTags, setMatchingTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchCancelledRef = useRef(false);

  // Handle clicks outside the search container
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  const userContext = useContext(UserContext);

  // Use the vendors hook with fallback to preloaded vendors
  const { vendors: hookVendors, isLoading: isVendorsLoading } = useVendors(
    userContext?.userMetadata,
  );
  const vendors =
    preloadedVendors && preloadedVendors.length > 0
      ? preloadedVendors
      : hookVendors;

  const { data: orgTags } = useOrgTags(
    userContext?.userMetadata?.organizationId || '',
  );

  // Clear search when pathname changes (navigation occurs)
  useEffect(() => {
    setSearchTerm('');
    setOpen(false);
  }, [pathname]);

  const handleSearch = useDebouncedCallback(async (term) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    searchCancelledRef.current = false; // Reset cancellation flag

    if (term) {
      params.set('query', term);
      setIsLoading(true);
      try {
        const rows = await searchContracts(term);

        if (searchCancelledRef.current) return;

        setSearchResults(rows);

        // Only open if search wasn't cancelled
        if (!searchCancelledRef.current) {
          setOpen(true);
        }
      } catch (error) {
        console.error('Error fetching search results:', error);
        setSearchResults([]);
      } finally {
        if (!searchCancelledRef.current) {
          setIsLoading(false);
          setHasSearched(true);
        }
      }
    } else {
      params.delete('query');
      setSearchResults([]);
      setHasSearched(false);
      // Keep dropdown open to show vendors list
      if (!searchCancelledRef.current) {
        setOpen(true);
      }
    }

    // Only update the URL on the dedicated search pages
    if (pathname.includes('/dashboard') || pathname.includes('/contracts')) {
      replace(`${pathname}?${params.toString()}`);
    }
  }, 300);

  const handleResultSelection = () => {
    handleSearch.cancel();
    searchCancelledRef.current = true;
    setOpen(false);
    setSearchTerm('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    searchCancelledRef.current = false; // Reset cancellation flag when typing

    if (term) {
      const filteredVendors = vendors.filter(
        (vendor) =>
          vendor.name && vendor.name.toLowerCase().includes(term.toLowerCase()),
      );
      setMatchingVendors(filteredVendors);

      const filteredTags = (orgTags?.tags || [])
        .filter(
          (tag: { id: number; name: string }) =>
            tag.name && tag.name.toLowerCase().includes(term.toLowerCase()),
        )
        .map((tag: { id: number; name: string }) => tag.name);
      setMatchingTags(filteredTags);
    } else {
      setMatchingVendors([]);
      setMatchingTags([]);
    }

    handleSearch(term);
  };

  const formatCurrency = (value: number, currency?: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    } catch (error) {
      // Fallback in case of invalid currency code
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    }
  };

  const matchedOrderNumber = (contract: ContractTableRow): string | null => {
    if (contract.orderNumber === null || contract.orderNumber === undefined) {
      return null;
    }
    const orderNumber = String(contract.orderNumber).trim();
    const normalizedTerm = normalizeOrderNumber(searchTerm);
    return orderNumber &&
      normalizedTerm &&
      normalizeOrderNumber(orderNumber).includes(normalizedTerm)
      ? orderNumber
      : null;
  };

  const orderNumberLabel = (contract: ContractTableRow) =>
    isInvoiceType(contract.typeId) ? 'Invoice No.' : 'Contract No.';

  // Function to highlight the matching part of text
  const highlightMatch = (text: string, searchTerm: string) => {
    if (!text || !searchTerm || searchTerm.trim() === '') {
      return text;
    }

    try {
      const searchTermLower = searchTerm.toLowerCase();
      const indexOfMatch = text.toLowerCase().indexOf(searchTermLower);

      if (indexOfMatch === -1) {
        return text;
      }

      const beforeMatch = text.substring(0, indexOfMatch);
      const match = text.substring(
        indexOfMatch,
        indexOfMatch + searchTerm.length,
      );
      const afterMatch = text.substring(indexOfMatch + searchTerm.length);

      return (
        <>
          {beforeMatch}
          <span className="font-medium bg-amber-100 dark:bg-amber-800/50">
            {match}
          </span>
          {afterMatch}
        </>
      );
    } catch (error) {
      // Return original text if any error occurs during highlighting
      return text;
    }
  };

  return (
    <div className="relative flex w-full max-w-4xl justify-end">
      <label htmlFor="search" className="sr-only">
        Search
      </label>

      <div className="relative">
        <Input
          ref={inputRef}
          className={`${size === 'sm' ? 'h-8 pl-8' : 'h-10 pl-9'} max-w-56 rounded-sm bg-transparent text-sm placeholder:opacity-70 hover:bg-hover focus:bg-background/90 focus-visible:ring-1 dark:bg-transparent`}
          placeholder={placeholder}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          value={searchTerm}
        />
        <div
          className="absolute left-0 top-0 flex h-full cursor-pointer items-center justify-center pl-2"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.focus();
              setOpen(true);
            }
          }}
        >
          <MagnifyingGlassIcon
            className={`${size === 'sm' ? 'h-[16px] w-[16px]' : 'h-[18px] w-[18px]'} text-foreground/50 peer-focus:text-foreground`}
          />
        </div>
      </div>

      {/* Search Results Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-11 z-50 w-full rounded-md border bg-[hsl(var(--popover))] shadow-lg"
        >
          <div className="max-h-96 overflow-y-auto p-2 3xl:max-h-[600px]">
            {searchTerm &&
            (matchingTags.length > 0 ||
              matchingVendors.length > 0 ||
              searchResults.length > 0 ||
              isLoading) ? (
              // Show search results
              <>
                {/* Tags Section */}
                {matchingTags.length > 0 && (
                  <>
                    <div className="border-b p-2 text-xs text-muted-foreground">
                      Tags ({matchingTags.length})
                    </div>
                    <ul className="pb-4">
                      {matchingTags.map((tag) => (
                        <li key={tag}>
                          <Link
                            href={`/contracts?tags=${encodeURIComponent(tag.toLowerCase())}`}
                            className="flex items-center p-2 hover:bg-hover"
                            onClick={handleResultSelection}
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="user"
                                className="px-2.5 pb-0.5 pt-[3px] text-[.8em]"
                              >
                                {tag}
                              </Badge>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Vendors Section */}
                {matchingVendors.length > 0 && (
                  <>
                    <div className="border-b p-2 text-xs text-muted-foreground">
                      Vendors ({matchingVendors.length})
                    </div>
                    <ul className="pb-4">
                      {matchingVendors.map((vendor) => (
                        <li
                          key={vendor.id}
                          className="border-b border-border/70 last:border-b-0"
                        >
                          <Link
                            href={`/vendors/${vendor.id}`}
                            className="flex items-center p-2 hover:bg-hover"
                            onClick={handleResultSelection}
                          >
                            <VendorIcon
                              name={vendor.name}
                              domain={vendor.domain}
                              width={24}
                              height={24}
                              className="mr-2"
                              lazy
                            />
                            <div className="font-medium flex-1 text-sm">
                              {vendor.name}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Contracts Section */}
                {isLoading ? (
                  <>
                    <div className="border-b p-2 text-xs text-muted-foreground">
                      Contracts
                    </div>
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      Loading contracts...
                    </div>
                  </>
                ) : (
                  searchResults &&
                  Array.isArray(searchResults) &&
                  searchResults.length > 0 && (
                    <>
                      <div className="border-b p-2 text-xs text-muted-foreground">
                        Contracts ({searchResults.length})
                      </div>
                      <ul>
                        {searchResults.map((contract) => (
                          <li
                            key={contract.id}
                            className="border-b border-border/70 last:border-b-0"
                          >
                            <Link
                              href={`/contracts/${contract.contract_id || contract.id}`}
                              className="block p-3 hover:bg-hover"
                              onClick={() => {
                                handleSearch.cancel();
                                searchCancelledRef.current = true;
                                setOpen(false);
                                setSearchTerm('');
                              }}
                            >
                              <div className="flex items-center">
                                {/* Vendor Icon */}
                                <VendorIcon
                                  name={contract.vendor || ''}
                                  domain={contract.vendorDomain}
                                  width={32}
                                  height={32}
                                  className="mr-3 flex-shrink-0"
                                  lazy
                                />

                                {/* Column 1: Vendor and Product */}
                                <div className="line-clamp-2 flex-1 pr-2 text-sm leading-tight">
                                  <div className="font-medium">
                                    {contract.vendor || 'Unknown Vendor'}
                                  </div>
                                  <div className="">
                                    {matchedOrderNumber(contract) !== null ? (
                                      <>
                                        {orderNumberLabel(contract)}{' '}
                                        {highlightMatch(
                                          matchedOrderNumber(contract) ?? '',
                                          searchTerm.trim(),
                                        )}
                                      </>
                                    ) : contract.currentProducts &&
                                      contract.currentProducts.length > 0 ? (
                                      highlightMatch(
                                        contract.currentProducts[0]
                                          .vendor_products?.name || '',
                                        searchTerm,
                                      )
                                    ) : contract.product &&
                                      contract.product.length > 0 ? (
                                      highlightMatch(
                                        contract.product[0].vendor_products
                                          ?.name ||
                                          contract.product[0].name ||
                                          '',
                                        searchTerm,
                                      )
                                    ) : (
                                      ''
                                    )}
                                  </div>
                                </div>

                                {/* Column 2: Matching Tags and Asset Classes */}
                                <div className="flex flex-col gap-1 px-4 text-left">
                                  {/* Only render the column if there are matching tags or asset classes */}
                                  {((contract.tags &&
                                    contract.tags.some(
                                      (tag) =>
                                        tag.name &&
                                        tag.name
                                          .toLowerCase()
                                          .includes(searchTerm.toLowerCase()),
                                    )) ||
                                    (contract.assetClasses &&
                                      Array.isArray(contract.assetClasses) &&
                                      contract.assetClasses.some(
                                        (assetClass) =>
                                          assetClass.name &&
                                          assetClass.name
                                            .toLowerCase()
                                            .includes(searchTerm.toLowerCase()),
                                      ))) && (
                                    <>
                                      {/* Matching Tags */}
                                      {contract.tags &&
                                        contract.tags.length > 0 &&
                                        contract.tags.some(
                                          (tag) =>
                                            tag.name &&
                                            tag.name
                                              .toLowerCase()
                                              .includes(
                                                searchTerm.toLowerCase(),
                                              ),
                                        ) && (
                                          <div className="flex gap-1">
                                            {contract.tags
                                              .filter(
                                                (tag) =>
                                                  tag.name &&
                                                  tag.name
                                                    .toLowerCase()
                                                    .includes(
                                                      searchTerm.toLowerCase(),
                                                    ),
                                              )
                                              .map((tag) => (
                                                <Badge
                                                  key={tag.id}
                                                  variant="user"
                                                  className="px-2.5 pb-0.5 pt-[3px] text-[.8em]"
                                                >
                                                  {tag.name}
                                                </Badge>
                                              ))}
                                          </div>
                                        )}

                                      {/* Matching Asset Classes */}
                                      {contract.assetClasses &&
                                        Array.isArray(contract.assetClasses) &&
                                        contract.assetClasses.length > 0 &&
                                        contract.assetClasses.some(
                                          (assetClass) =>
                                            assetClass.name &&
                                            assetClass.name
                                              .toLowerCase()
                                              .includes(
                                                searchTerm.toLowerCase(),
                                              ),
                                        ) && (
                                          <div className="flex gap-1">
                                            {contract.assetClasses
                                              .filter(
                                                (assetClass) =>
                                                  assetClass.name &&
                                                  assetClass.name
                                                    .toLowerCase()
                                                    .includes(
                                                      searchTerm.toLowerCase(),
                                                    ),
                                              )
                                              .map((assetClass) => (
                                                <Badge
                                                  key={assetClass.id}
                                                  variant={'secondary'}
                                                  color="text-[.8em] px-2.5 pt-[3px] pb-0.5"
                                                >
                                                  {assetClass.name}
                                                </Badge>
                                              ))}
                                          </div>
                                        )}
                                    </>
                                  )}
                                </div>

                                {/* Column 3: Contract Type */}
                                <div className="px-4 text-left">
                                  {contract.type && (
                                    <div className="flex flex-wrap gap-1">
                                      {Array.isArray(contract.type) ? (
                                        contract.type.map((t, idx) => (
                                          <ContractLabel
                                            key={idx}
                                            name={t}
                                            shorten={true}
                                          />
                                        ))
                                      ) : (
                                        <ContractLabel
                                          name={contract.type}
                                          shorten={true}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Column 4: Total Contract Value */}
                                <div className="ml-auto min-w-20 flex-shrink-0 text-right">
                                  <div
                                    className={`whitespace-nowrap font-label text-[0.8rem] ${contract.totalContractValue === 0 && 'text-muted-foreground/50'}`}
                                  >
                                    {formatCurrency(
                                      contract.totalContractValue || 0,
                                      contract.currency,
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )
                )}
              </>
            ) : searchTerm &&
              !isLoading &&
              Array.isArray(searchResults) &&
              searchResults.length === 0 &&
              matchingTags.length === 0 &&
              matchingVendors.length === 0 ? (
              // Show appropriate message based on search state
              <div className="p-3 text-center text-sm text-muted-foreground">
                {hasSearched
                  ? 'No results found'
                  : `Search for "${searchTerm}"`}
              </div>
            ) : !searchTerm && vendors.length > 0 ? (
              // Show vendors list when no search term is entered
              <ul>
                <li className="border-b p-2 text-xs text-muted-foreground">
                  Vendors
                </li>
                {vendors.map((vendor) => (
                  <li
                    key={vendor.id}
                    className="border-b border-border/70 last:border-b-0"
                  >
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="flex items-center p-2 hover:bg-hover"
                      onClick={handleResultSelection}
                    >
                      <VendorIcon
                        name={vendor.name}
                        domain={vendor.domain}
                        width={24}
                        height={24}
                        className="mr-2"
                        lazy
                      />
                      <div className="font-medium flex-1 text-sm">
                        {vendor.name}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : !searchTerm && !isVendorsLoading ? (
              // Empty vendor list (loaded)
              <div className="p-3 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : searchTerm ? (
              // Show no results when there's a search term but no matches
              <div className="p-3 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : (
              // Fallback message when no vendors are loaded and no search term
              <div className="p-3 text-center text-sm text-muted-foreground">
                Loading vendors...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
