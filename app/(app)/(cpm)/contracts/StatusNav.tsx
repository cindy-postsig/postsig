'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface TabOption {
  label: string;
  href: string;
}

interface StatusNavProps {
  options?: TabOption[];
}

const StatusNav = ({
  options = [
    { label: 'Active', href: '/contracts' },
    { label: 'Pending', href: '/contracts/pending' },
    { label: 'Archived', href: '/contracts/archived' },
  ],
}: StatusNavProps) => {
  const pathname = usePathname();

  return (
    <div className="mt-6 flex gap-3">
      {options.map((option) => {
        // Check if current path matches the option's href
        const isActive =
          option.href === '/contracts'
            ? pathname === '/contracts'
            : pathname === option.href;

        return (
          <Link
            key={option.label}
            href={option.href}
            prefetch={false}
            className={`
              font-sans text-sm
              ${
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
};

export default StatusNav;
