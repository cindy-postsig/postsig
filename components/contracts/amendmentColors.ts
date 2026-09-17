/**
 * Shared color constants for amendment UI components
 * Used across AmendmentAccordion and CompactAmendmentPopover
 */

export const AMENDMENT_COLORS = {
  // Trigger badge/button colors
  trigger: {
    background: 'bg-blue-50',
    backgroundHover: 'hover:bg-blue-100',
    border: 'border-blue-200',
    text: 'text-blue-800',
    darkBackground: 'dark:bg-blue-500/20',
    darkBorder: 'dark:border-blue-500/30',
    darkText: 'dark:text-blue-50',
  },

  // Amendment item card colors
  item: {
    // Current contract (the one being viewed)
    current: {
      background: 'bg-primary/7',
      border: 'dark:border-primary/10',
    },
    // Related contracts (parents/children/siblings)
    related: {
      background: 'bg-card',
      border: 'border-primary/20 dark:border-primary/10',
    },
  },

  // Content area border (used in accordion)
  contentBorder: {
    border: 'border-blue-200',
    darkBorder: 'dark:border-blue-300/50',
  },
} as const;
