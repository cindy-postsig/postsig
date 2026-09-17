'use client';
import React from 'react';
import Link from 'next/link';
import VendorIcon from './VendorIcon';
import { formatCurrency } from '@/app/lib/utils'; // Make sure to import this

interface Vendor {
  id: number;
  name: string | null;
  domain?: string;
}

interface VendorLinkProps {
  vendor: Vendor;
  fees?: number;
}

const VendorLink: React.FC<VendorLinkProps> = ({ vendor, fees }) => {
  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 font-label text-sm transition-all hover:bg-hover"
    >
      <div className="flex items-center gap-3">
        <VendorIcon
          name={vendor.name || ''}
          domain={vendor.domain}
          height={20}
          width={20}
          className="mix-blend-darken"
        />
        <span className="leading-tight">
          {vendor.name ? vendor.name.replace(/['"]/g, '') : 'N/A'}
        </span>
      </div>
      {fees !== undefined && (
        <span className="ml-2 font-label">{formatCurrency(fees)}</span>
      )}
    </Link>
  );
};

export default VendorLink;
