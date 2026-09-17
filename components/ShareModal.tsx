import React, { useState } from 'react';
import { shareTerm } from '@/app/lib/contracts/actions';

interface ShareModalProps {
  contractId: number;
  termTitle: string;
  term: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareModal({
  contractId,
  termTitle,
  term,
  isOpen,
  onClose,
}: ShareModalProps) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await shareTerm({ contractId, termTitle, term, recipient, message });
    onClose();
  };

  return (
    <div className="backdrop fixed left-0 top-0 z-50 flex h-full w-full items-center justify-center bg-neutral-600 bg-opacity-30">
      <div className="w-1/2 rounded-md bg-white p-8 shadow-lg">
        <div className="flex flex-row gap-8">
          <div id="shareForm" className="flex w-1/2 flex-col gap-4">
            <h2 className="font-serif text-2xl">Share Contract Term</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="block font-label">Recipient</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="block font-label">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="h-24 w-full"
                  required
                ></textarea>
              </div>
              <div className="modal-action">
                <button
                  type="submit"
                  className="rounded-sm bg-psblue px-4 py-2 text-white"
                >
                  Share
                </button>
                <button
                  type="button"
                  className="rounded-sm px-4 py-2"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
          <div id="termsPreview" className="w-1/2">
            <div className="h-full rounded-sm border border-neutral-300 bg-neutral-100 p-8">
              <div className="font-bold mb-4 font-label uppercase tracking-wide antialiased">
                {termTitle}
              </div>
              <p>{term}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
