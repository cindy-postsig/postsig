'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  key: string;
  name: string;
  href: string;
}

interface SettingsNavProps {
  navItems: NavItem[];
}

export function SettingsNav({ navItems }: SettingsNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (pathname === href) return true;
    return pathname.startsWith(href + '/');
  };

  return (
    <ul className="flex w-full flex-col gap-1 font-sans">
      {navItems.map((item) => (
        <li key={item.key} className="w-full">
          <Link
            href={item.href}
            className={`flex items-center gap-1.5 rounded-sm p-2 text-sm leading-5 hover:bg-hover ${
              isActive(item.href)
                ? 'font-medium bg-selected hover:bg-selected'
                : ''
            }`}
          >
            {item.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
