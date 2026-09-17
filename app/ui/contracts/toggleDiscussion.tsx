'use client';
import { createContext, useContext, useState } from 'react';

export type DiscussionVisibilityContextType = {
  isDiscussionOpen: boolean;
  toggleDiscussion: () => void;
  openDiscussion: () => void;
};

const DiscussionVisibilityContext =
  createContext<DiscussionVisibilityContextType | null>(null);

export const useDiscussionVisibility = () =>
  useContext(DiscussionVisibilityContext);

export const DiscussionVisibilityProvider = ({
  children,
  initialIsDiscussionOpen = false,
}: {
  children: React.ReactNode;
  initialIsDiscussionOpen?: boolean;
}) => {
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(
    initialIsDiscussionOpen,
  );

  const openDiscussion = () => {
    setIsDiscussionOpen(true);
  };

  const toggleDiscussion = () => {
    setIsDiscussionOpen((prev) => !prev);
  };

  return (
    <DiscussionVisibilityContext.Provider
      value={{
        isDiscussionOpen,
        toggleDiscussion,
        openDiscussion,
      }}
    >
      {children}
    </DiscussionVisibilityContext.Provider>
  );
};
