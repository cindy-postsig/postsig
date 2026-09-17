'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface TabOption {
  label: string;
  value: string | null;
}

interface StatusTabsProps {
  options?: TabOption[];
}

const StatusTabs = ({
  options = [
    { label: 'Active', value: null },
    { label: 'Pending', value: 'pending' },
    { label: 'Archived', value: 'archived' },
  ],
}: StatusTabsProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const currentStatus = searchParams.get('status');

  const createQueryString = (status: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (status === null) {
      params.delete('status');
    } else {
      params.set('status', status);
    }
    return params.toString();
  };

  return (
    <div className="mt-6 flex gap-3">
      {options.map((option) => {
        const isActive = currentStatus === option.value;

        return (
          <button
            key={option.label}
            onClick={() => {
              const queryString = createQueryString(option.value);
              router.push(`${pathname}?${queryString}`);
            }}
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
          </button>
        );
      })}
    </div>
  );
};

export default StatusTabs;
