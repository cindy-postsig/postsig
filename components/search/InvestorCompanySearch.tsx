'use client';

import Link from 'next/link';
import { useInvPortfolioCompanies } from '@/hooks/api/useInvPortfolioCompanies';
import { SearchDropdown } from '@/components/search/SearchDropdown';
import VendorIcon from '@/components/vendors/VendorIcon';

interface InvestorCompanySearchProps {
  placeholder: string;
  size?: 'sm' | 'default';
}

export default function InvestorCompanySearch({
  placeholder,
  size = 'default',
}: InvestorCompanySearchProps) {
  const { data, isLoading, isError } = useInvPortfolioCompanies();
  const companies = [...(data?.companies ?? [])].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? ''),
  );

  return (
    <SearchDropdown
      placeholder={placeholder}
      size={size}
      dropdownAlign="left"
      dropdownClassName="w-96"
    >
      {({ searchTerm, onSelect }) => {
        const filtered = searchTerm
          ? companies.filter((c) =>
              (c.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()),
            )
          : companies;

        if (isLoading) {
          return (
            <div className="p-3 text-center text-sm text-muted-foreground">
              Loading companies...
            </div>
          );
        }

        if (isError) {
          return (
            <div className="p-3 text-center text-sm text-muted-foreground">
              Failed to load companies
            </div>
          );
        }

        if (filtered.length === 0) {
          return (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {searchTerm ? 'No companies found' : 'No portfolio companies'}
            </div>
          );
        }

        return (
          <>
            <div className="p-2 text-xs text-muted-foreground">
              Companies ({filtered.length})
            </div>
            <ul>
              {filtered.map((company) => (
                <li
                  key={company.id}
                  className="border-b border-border/70 last:border-b-0"
                >
                  <Link
                    href={`/investor/company/${company.id}`}
                    className="flex items-center p-2 hover:bg-hover"
                    onClick={onSelect}
                  >
                    <VendorIcon
                      name={company.name}
                      domain={company.domain}
                      width={24}
                      height={24}
                      className="mr-2"
                      lazy
                    />
                    <div className="font-medium flex-1 text-sm">
                      {company.name}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    </SearchDropdown>
  );
}
