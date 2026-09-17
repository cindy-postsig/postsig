'use client';

import { useId, useState, useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input } from '@/components/ui/input';

interface SearchDropdownProps {
  placeholder: string;
  size?: 'sm' | 'default';
  dropdownAlign?: 'left' | 'right';
  dropdownClassName?: string;
  children: (props: { searchTerm: string; onSelect: () => void }) => ReactNode;
}

export function SearchDropdown({
  placeholder,
  size = 'default',
  dropdownAlign = 'right',
  dropdownClassName,
  children,
}: SearchDropdownProps) {
  const inputId = useId();
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close
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

  // Clear on navigation
  useEffect(() => {
    setSearchTerm('');
    setOpen(false);
  }, [pathname]);

  const handleSelect = () => {
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Search
      </label>

      <Input
        id={inputId}
        ref={inputRef}
        className={`${size === 'sm' ? 'h-8 pl-8' : 'h-10 pl-9'} max-w-56 rounded-sm bg-transparent text-sm placeholder:opacity-70 hover:bg-hover focus:bg-background/90 focus-visible:ring-1 dark:bg-transparent`}
        placeholder={placeholder}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        value={searchTerm}
      />
      <div
        className="absolute left-0 top-0 flex h-full cursor-pointer items-center justify-center pl-2"
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        <MagnifyingGlassIcon
          className={`${size === 'sm' ? 'h-[16px] w-[16px]' : 'h-[18px] w-[18px]'} text-foreground/50 peer-focus:text-foreground`}
        />
      </div>

      {open && (
        <div
          ref={dropdownRef}
          className={`absolute top-11 z-50 min-w-72 rounded-md border bg-[hsl(var(--popover))] shadow-lg ${dropdownAlign === 'left' ? 'left-0' : 'right-0'} ${dropdownClassName ?? ''}`}
        >
          <div className="max-h-96 overflow-y-auto p-2 3xl:max-h-[600px]">
            {children({ searchTerm, onSelect: handleSelect })}
          </div>
        </div>
      )}
    </div>
  );
}
