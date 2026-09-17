'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useDebouncedCallback } from 'use-debounce';
import { searchVendorContracts } from '@/app/lib/search/actions';
import { useState } from 'react';
import Link from 'next/link';

interface Results {
  id: number;
  vendor_name: string | null;
}

export default function SearchContracts({
  placeholder,
}: {
  placeholder: string | undefined;
}) {
  const [searchResults, setSearchResults] = useState<Results[]>([]);

  const handleSearch = useDebouncedCallback(async (query: string) => {
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }

    try {
      const results = await searchVendorContracts(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    }
  }, 300);

  return (
    <div>
      <div className="relative flex flex-1 flex-shrink-0">
        <input
          className="text-md peer block w-[400px] border-0 bg-transparent py-2 pl-9 outline-0 placeholder:text-stone-500 focus:outline-0 focus:ring-0"
          placeholder={placeholder}
          onChange={(e) => {
            handleSearch(e.target.value);
          }}
        />
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-neutral-500 peer-focus:text-neutral-900" />
      </div>
      {searchResults.length > 0 && (
        <div
          id="results"
          className="absolute top-10 w-full bg-white text-base shadow-xl"
        >
          <h2 className="p-4">Search</h2>
          {searchResults?.map((contract) => (
            <Link
              href={`/contracts/${contract.id}`}
              key={contract.id}
              className="flex px-4 py-4 hover:bg-blue-200 hover:bg-opacity-10"
            >
              <p className="font-bold w-64 text-sm uppercase tracking-wide">
                {contract.vendor_name}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
