'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface MissingDocsCountContextValue {
  count: number;
  setCount: (n: number) => void;
}

const MissingDocsCountContext = createContext<MissingDocsCountContextValue>({
  count: 0,
  setCount: () => {},
});

export function MissingDocsCountProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);
  return (
    <MissingDocsCountContext.Provider value={{ count, setCount }}>
      {children}
    </MissingDocsCountContext.Provider>
  );
}

export function useMissingDocsCount() {
  return useContext(MissingDocsCountContext);
}
