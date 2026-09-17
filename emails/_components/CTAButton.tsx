import * as React from 'react';
import { Link } from '@react-email/components';

interface CTAButtonProps {
  href: string;
  size?: 'sm' | 'base';
  children: React.ReactNode;
}

export function CTAButton({ href, size = 'base', children }: CTAButtonProps) {
  const sizeClass = size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <Link
      href={href}
      className={`font-medium my-4 inline-block rounded-sm bg-[#160F5B] px-7 py-2 ${sizeClass} text-white no-underline`}
    >
      {children}
    </Link>
  );
}
