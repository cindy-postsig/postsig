'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SimpleTagFilterProps {
  availableTags: string[];
  selectedTag?: string | null;
}

export default function SimpleTagFilter({
  availableTags,
  selectedTag,
}: SimpleTagFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (value: string) => {
    if (value === 'all') {
      router.push(pathname);
    } else {
      router.push(`${pathname}?tags=${value}`);
    }
  };

  return (
    <div className="mb-6">
      <Select value={selectedTag || 'all'} onValueChange={handleChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select a tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tags</SelectItem>
          {availableTags.map((tag) => (
            <SelectItem key={tag} value={tag}>
              {tag}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
