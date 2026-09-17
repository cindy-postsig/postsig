'use client';

import { useState, useEffect, useContext } from 'react';
import { fetchVendorList } from '@/app/lib/dashboard/actions';
import { UserContext } from '@/app/userProvider';
import AiPromptSearch from '@/components/search/AiPromptSearch';
import Search from '@/app/ui/search';

interface HeaderSearchProps {
  placeholder: string;
  size?: 'sm' | 'default';
}

export default function HeaderSearch({
  placeholder,
  size = 'default',
}: HeaderSearchProps) {
  const [vendors, setVendors] = useState<any[]>([]);
  const userContext = useContext(UserContext);
  const userMetadata = userContext?.userMetadata;
  const isAssistantUser = userMetadata?.assistantEnabled;

  useEffect(() => {
    async function loadVendors() {
      try {
        const { vendors: vendorsList } = await fetchVendorList(
          userContext?.userMetadata,
        );
        if (vendorsList && Array.isArray(vendorsList)) {
          const sortedVendors = [...vendorsList].sort((a, b) =>
            a.name && b.name ? a.name.localeCompare(b.name) : 0,
          );
          setVendors(sortedVendors);
        }
      } catch (error) {
        console.error('Error loading vendors:', error);
      }
    }

    loadVendors();
  }, [userContext?.userMetadata]);

  return isAssistantUser ? (
    <AiPromptSearch
      placeholder={placeholder}
      size={size}
      preloadedVendors={vendors}
    />
  ) : (
    <Search placeholder={placeholder} size={size} preloadedVendors={vendors} />
  );
}
