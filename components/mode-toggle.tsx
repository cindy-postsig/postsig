'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { CheckIcon } from '@radix-ui/react-icons';

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const styles = 'flex items-center justify-between';

  return (
    <div>
      <DropdownMenuItem onClick={() => setTheme('light')} className={styles}>
        Light {theme === 'light' && <CheckIcon />}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('dark')} className={styles}>
        Dark {theme === 'dark' && <CheckIcon />}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('system')} className={styles}>
        System {theme === 'system' && <CheckIcon />}
      </DropdownMenuItem>
    </div>
  );
}
