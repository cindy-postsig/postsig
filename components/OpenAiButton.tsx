'use client';

import React from 'react';
import { createRoot } from 'react-dom/client';
import JSONTreeComponent from '@/components/json/JSONTreeComponent';

type OpenAiButtonProps = {
  extractedAiData: any;
};

const openAiWindow = (extractedAiData: any) => {
  const newWindow = window.open('', '_blank');
  if (!newWindow) {
    return;
  }
  newWindow.document.title = 'AI Extraction';
  const root = createRoot(newWindow.document.body);
  root.render(<JSONTreeComponent data={extractedAiData}></JSONTreeComponent>);
};

const OpenAiButton: React.FC<OpenAiButtonProps> = ({ extractedAiData }) => {
  return (
    <button
      className="focus:shadow-outline font-bold rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-950 focus:outline-none active:bg-blue-800"
      onClick={() => openAiWindow(extractedAiData)}
    >
      AI Extraction
    </button>
  );
};

export default OpenAiButton;
