import React from 'react';

import { cn } from '@/lib/utils';

export const DocuSignIcon = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'img'>) => (
  <img
    src="/docusign_black.svg"
    alt="DocuSign Logo"
    className={cn('dark:invert', className)}
    {...props}
  />
);
