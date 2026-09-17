'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  name: string;
  href: string;
};

export default function SettingsNav({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex w-full flex-col gap-1 font-sans">
      {navItems.map((item) => (
        <li key={item.name} className="w-full">
          <Link
            href={item.href}
            className={`flex items-center gap-1.5 rounded-sm p-2 text-sm leading-5 hover:bg-hover ${
              pathname === item.href
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
