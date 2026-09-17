import React from 'react';
import Link from 'next/link';

type NavLinkProps = {
  children: React.ReactNode;
  href: string | null;
  selected?: boolean;
};

const NavLink: React.FC<NavLinkProps> = ({
  children,
  href,
  selected = false,
}) => {
  return (
    <Link
      prefetch={false}
      href={href || '#'}
      className={`flex h-10 w-10 items-center justify-center rounded-sm px-[.6em] ${
        selected
          ? 'bg-gray-700/15 text-foreground'
          : 'text-foreground hover:bg-gray-700/15'
      }`}
    >
      {children}
    </Link>
  );
};

export default NavLink;
