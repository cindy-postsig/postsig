'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'contract-sidebar-width';
const DEFAULT_SIDEBAR_SIZE = 25; // 25% of viewport
const MIN_SIDEBAR_SIZE = 15; // 15% minimum
const MAX_SIDEBAR_SIZE = 50; // 50% maximum

export function useResizableSidebar() {
  const [sidebarSize, setSidebarSize] = useState<number>(DEFAULT_SIDEBAR_SIZE);

  // Load saved size from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedSize = parseFloat(saved);
        if (
          !isNaN(parsedSize) &&
          parsedSize >= MIN_SIDEBAR_SIZE &&
          parsedSize <= MAX_SIDEBAR_SIZE
        ) {
          setSidebarSize(parsedSize);
        }
      }
    }
  }, []);

  // Save size to sessionStorage when it changes
  const handleResize = useCallback((size: number) => {
    setSidebarSize(size);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, size.toString());
    }
  }, []);

  // Reset to default size
  const resetSize = useCallback(() => {
    setSidebarSize(DEFAULT_SIDEBAR_SIZE);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    sidebarSize,
    handleResize,
    resetSize,
    minSize: MIN_SIDEBAR_SIZE,
    maxSize: MAX_SIDEBAR_SIZE,
  };
}
