'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface TagFilterProps {
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
  availableTags: string[];
}

export default function TagFilter({
  selectedTag,
  onTagSelect,
  availableTags,
}: TagFilterProps) {
  return (
    <div className="flex items-center gap-3">
      <Select
        value={selectedTag || 'all'}
        onValueChange={(value) => onTagSelect(value === 'all' ? null : value)}
      >
        <SelectTrigger className="h-8 w-48">
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

      {selectedTag && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTagSelect(null)}
          className="h-8"
        >
          Reset
        </Button>
      )}
    </div>
  );
}
