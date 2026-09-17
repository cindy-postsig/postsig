import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import ShareModal from '@/components/ShareModal';
import { usePdfVisibility } from '@/app/ui/contracts/togglePdf';
import { CardHeader, CardTitle, CardContent, Card } from '@/components/ui/card';
import CitationField from './CitationField';
import { Citation } from '@/constants/types';
import AmendmentAccordion from './amendments/AmendmentAccordion';
import {
  getAmendmentData,
  formatForAccordion,
} from '@/lib/amendments/amendmentDisplayUtils';
import type { AmendmentContract } from '@/lib/v2/contracts/amendments';
import type { ContractHierarchy } from '@/lib/amendments/hierarchyUtils';
import { EditableField } from '@/app/ui/contracts/edit/EditableField';
import {
  InlineFieldEditor,
  FieldEditMenu,
} from '@/app/ui/contracts/edit/InlineEditWrapper';
import { useEdit } from '@/app/ui/contracts/edit/EditContext';
import { isEditableField } from '@/lib/v2/contracts/edit/utils';
import { useDiscussionVisibility } from '@/app/ui/contracts/toggleDiscussion';

type TermCardProps = {
  contractId: number;
  title: string;
  text: string;
  on?: boolean;
  citations?: Citation | null;
  className?: string;
  fieldKey?: string;
  currentContract?: AmendmentContract | null;
  hierarchy?: ContractHierarchy | null;
  allContractsInHierarchy?: AmendmentContract[];
};

export default function TermCard({
  contractId,
  title,
  text,
  on,
  citations,
  className,
  fieldKey,
  currentContract,
  hierarchy,
  allContractsInHierarchy = [],
}: TermCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const context = usePdfVisibility();
  if (!context) {
    throw new Error(
      'usePdfVisibility must be used within a PdfVisibilityProvider',
    );
  }
  const discussionContext = useDiscussionVisibility();
  if (!discussionContext) {
    throw new Error(
      'useDiscussionVisibility must be used within a DiscussionVisibilityProvider',
    );
  }
  const { isPdfOpen, togglePdf, selectedFieldId } = context;
  const { isDiscussionOpen } = discussionContext;

  const edit = useEdit();
  const isEditMode = edit?.isEditMode ?? false;
  const canEdit = edit?.canEdit ?? false;
  const isFieldEditable = fieldKey
    ? isEditableField(fieldKey) && canEdit
    : false;
  const isInlineEditing = fieldKey
    ? (edit?.isFieldInlineEditing('contracts', contractId, fieldKey) ?? false)
    : false;

  const optimisticText = fieldKey
    ? ((edit?.getFieldValue(
        'contracts',
        contractId,
        fieldKey,
        text,
      ) as string) ?? text)
    : text;

  const maxWords = 150;
  const threshold = 20; // Don't show "show more" if fewer than this many words remain
  const words = optimisticText.split(' ');
  const shouldTruncate = words.length > maxWords + threshold;
  const displayText =
    shouldTruncate && !isExpanded
      ? words.slice(0, maxWords).join(' ') + '...'
      : optimisticText;

  const handleTogglePdf = () => {
    if (togglePdf) {
      togglePdf();
    }
  };

  const amendmentData = useMemo(() => {
    if (!fieldKey || !currentContract) return null;

    return getAmendmentData({
      fieldKey,
      currentContract,
      hierarchy,
      allContractsInHierarchy,
    });
  }, [fieldKey, currentContract, hierarchy, allContractsInHierarchy]);

  const hasAmendmentChain = amendmentData?.hasAmendmentChain || false;

  const accordionData = useMemo(() => {
    return amendmentData ? formatForAccordion(amendmentData) : null;
  }, [amendmentData]);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const cardClassName = cn(
    'h-full w-full',
    on ? 'opacity-100' : 'opacity-20',
    className,
  );

  const handleStartEdit = () => {
    if (!edit || !fieldKey) return;
    edit.startInlineEdit('contracts', contractId, fieldKey, text);
  };

  const renderTextContent = () => (
    <>
      {displayText}
      {shouldTruncate && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="ml-2 font-label text-sm text-psblue"
        >
          Show more
        </button>
      )}
      {shouldTruncate && isExpanded && (
        <button
          onClick={() => setIsExpanded(false)}
          className="ml-2 font-label text-sm text-psblue"
        >
          Show less
        </button>
      )}
    </>
  );

  const renderAmendmentContent = () => (
    <div>
      <div
        className={`w-full transition-all duration-300 ease-in-out ${
          isHistoryOpen
            ? 'mb-0 max-h-0 overflow-hidden opacity-0'
            : 'mb-2 max-h-96 opacity-100'
        }`}
      >
        {renderTextContent()}
      </div>
      {accordionData && (
        <AmendmentAccordion
          fieldKey={fieldKey!}
          fieldTitle={title}
          currentValue={displayText}
          relatedContracts={accordionData.relatedContracts}
          viewContext="chain"
          className=""
          isHistoryOpen={isHistoryOpen}
          onToggleHistory={setIsHistoryOpen}
        />
      )}
    </div>
  );

  const renderCardContent = () => {
    const contentClass = `w-full font-serif ${!(isPdfOpen || isDiscussionOpen) ? 'text-lg' : ''}`;

    // Full edit mode - show editable field
    if (isEditMode && isFieldEditable && fieldKey) {
      return (
        <EditableField
          fieldKey={fieldKey}
          value={text}
          className={contentClass}
        >
          {text}
        </EditableField>
      );
    }

    if (isInlineEditing && fieldKey) {
      return (
        <InlineFieldEditor
          fieldKey={fieldKey}
          value={text}
          className={contentClass}
        />
      );
    }

    if (hasAmendmentChain && amendmentData) {
      return <div className={contentClass}>{renderAmendmentContent()}</div>;
    }

    return <div className={contentClass}>{renderTextContent()}</div>;
  };

  const cardContent = (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {/* Show edit menu for editable fields when not in edit modes */}
        {isFieldEditable && !isEditMode && !isInlineEditing && (
          <FieldEditMenu onEdit={handleStartEdit} />
        )}
      </CardHeader>
      <ShareModal
        contractId={contractId}
        termTitle={title}
        term={text}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <CardContent className="h-full">{renderCardContent()}</CardContent>
    </>
  );

  if (isEditMode || isInlineEditing) {
    return <Card className={cardClassName}>{cardContent}</Card>;
  }

  if (isFieldEditable) {
    return (
      <div className="group/field h-full">
        <CitationField
          citation={citations || undefined}
          className={cardClassName}
          variant="card"
        >
          {cardContent}
        </CitationField>
      </div>
    );
  }

  return (
    <CitationField
      citation={citations || undefined}
      className={cardClassName}
      variant="card"
    >
      {cardContent}
    </CitationField>
  );
}
