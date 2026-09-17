import { cn } from '@/lib/utils';

interface CitationsIndexProps {
  fieldsWithCitations: {
    fieldId: string;
    displayName: string;
    citations: any[];
  }[];
  selectedFieldId?: string | null;
  selectedCitationContent?: any | null;
  onFieldSelect?: (fieldId: string) => void;
  onCitationClick?: (citationId: string) => void;
  className?: string;
}

export default function CitationsIndex({
  fieldsWithCitations,
  selectedFieldId,
  selectedCitationContent,
  onFieldSelect,
  onCitationClick,
  className,
}: CitationsIndexProps) {
  if (fieldsWithCitations.length === 0) {
    return null;
  }

  const handleFieldClick = (fieldId: string) => {
    onFieldSelect?.(fieldId);
  };

  const handleCitationClick = (citationId: string) => {
    onCitationClick?.(citationId);
  };

  return (
    <div
      className={cn(
        'scrollbar-track-gray/20 scrollbar-thumb-gray h-full overflow-y-auto border-r bg-background/80 scrollbar-thin',
        className,
      )}
    >
      <div className="font-bold p-4 pb-2 font-label text-xs uppercase tracking-wide text-foreground/85">
        Citations
      </div>
      <div className="p-2">
        {fieldsWithCitations.map((field) => (
          <div
            key={field.fieldId}
            className="border-b border-dotted border-b-foreground/20"
          >
            <button
              onClick={() => handleFieldClick(field.fieldId)}
              className={cn(
                'w-full px-2 py-1.5 text-left font-label text-[0.825rem] transition-colors',
                selectedFieldId === field.fieldId
                  ? field.citations.length === 1
                    ? 'font-bold bg-selected text-foreground'
                    : 'font-bold text-foreground'
                  : 'text-foreground/75 hover:bg-hover',
              )}
            >
              <div className="flex items-stretch justify-between">
                <span className="leading-tight">{field.displayName}</span>
                <span className="flex items-start text-xs text-muted-foreground">
                  {field.citations.length}
                </span>
              </div>
            </button>
            {field.citations.length > 1 &&
              selectedFieldId === field.fieldId && (
                <div className="mb-1 ml-3 space-y-1">
                  {field.citations.map((citation, index) => {
                    const isSelected =
                      selectedCitationContent?.id === citation.id;
                    return (
                      <button
                        key={citation.id}
                        onClick={() => handleCitationClick(citation.id)}
                        className={cn(
                          'w-full px-2 py-1 text-left font-label text-xs transition-colors',
                          isSelected
                            ? 'bg-selected'
                            : 'text-foreground/75 hover:bg-hover',
                        )}
                      >
                        Citation {index + 1}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
