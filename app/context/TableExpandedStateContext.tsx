'use client';

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useCallback,
} from 'react';

// Define the shape of our context
// Use TanStack's ExpandedState type: true | Record<string, boolean>
type ExpandedStateMap = Record<string, boolean>;
type ExpandedStateContextType = {
  expandedState: Record<string, ExpandedStateMap>;
  setExpandedState: (tableId: string, state: ExpandedStateMap | true) => void;
  getExpandedState: (tableId: string) => ExpandedStateMap;
  clearAllExpandedStates: () => void;
};

// Create the context
const TableExpandedStateContext = createContext<
  ExpandedStateContextType | undefined
>(undefined);

// Provider component
export function TableExpandedStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Store expanded state for multiple tables
  const [expandedStates, setExpandedStates] = useState<
    Record<string, ExpandedStateMap>
  >({});

  // Set expanded state for a specific table
  const setExpandedState = (
    tableId: string,
    state: ExpandedStateMap | true,
  ) => {
    setExpandedStates((prev) => {
      // If state is true, we don't store it - only store object states
      if (state === true) return prev;

      // Only update if the state has actually changed
      const currentState = prev[tableId] || {};
      if (JSON.stringify(currentState) === JSON.stringify(state)) {
        return prev;
      }
      return {
        ...prev,
        [tableId]: state,
      };
    });
  };

  // Get expanded state for a specific table
  const getExpandedState = useCallback(
    (tableId: string): ExpandedStateMap => {
      return expandedStates[tableId] || {};
    },
    [expandedStates],
  );

  // Clear all expanded states (used for logout)
  const clearAllExpandedStates = () => {
    setExpandedStates({});
  };

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = React.useMemo(
    () => ({
      expandedState: expandedStates,
      setExpandedState,
      getExpandedState,
      clearAllExpandedStates,
    }),
    [expandedStates, getExpandedState],
  );

  return (
    <TableExpandedStateContext.Provider value={contextValue}>
      {children}
    </TableExpandedStateContext.Provider>
  );
}

// Custom hook to use the expanded state context
export function useTableExpandedState() {
  const context = useContext(TableExpandedStateContext);
  if (context === undefined) {
    throw new Error(
      'useTableExpandedState must be used within a TableExpandedStateProvider',
    );
  }
  return context;
}
