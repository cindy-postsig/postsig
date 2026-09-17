'use client';

import { useRouter } from 'next/navigation';

export default function DateTypeLink({
  href,
  title,
}: {
  href: string;
  title: string;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => {
          router.push(href);
        }}
      >
        <span className="font-medium text-xs uppercase tracking-wider text-gray-500">
          {title}
        </span>
      </button>
    </div>
  );
}
