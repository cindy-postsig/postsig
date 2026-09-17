import { useState } from 'react';

export function useCitations() {
  const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
  const [citationKey, setCitationKey] = useState<string>('');

  return {
    isCitationModalOpen,
    openCitationModal: () => setIsCitationModalOpen(true),
    closeCitationModal: () => setIsCitationModalOpen(false),
    setCitationKey,
    citationKey,
  };
}
