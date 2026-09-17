'use client';

import { useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LayoutGrid } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Portal } from '@radix-ui/react-portal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMode, type AppMode } from '@/contexts/ModeContext';
import { UserContext } from '@/app/userProvider';
import { cn } from '@/lib/utils';
import { setLastActiveModule } from '@/lib/module-persistence';

interface ModeOption {
  mode: AppMode;
  label: string;
  href: string;
  moduleCode: string;
}

const modeOptions: ModeOption[] = [
  {
    mode: 'contracts',
    label: 'PostSig CPM',
    href: '/dashboard',
    moduleCode: 'cpm',
  },
  {
    mode: 'venture',
    label: 'PostSig Investor',
    href: '/investor',
    moduleCode: 'investor',
  },
];

export function ModeSwitcher() {
  const router = useRouter();
  const { mode } = useMode();
  const userContext = useContext(UserContext);
  const appModules = userContext?.userMetadata?.appModules;

  // Filter mode options based on user's accessible modules
  const availableOptions = useMemo(() => {
    if (!appModules || appModules.length === 0) {
      // Fallback: show all options if no module access info
      return modeOptions;
    }

    return modeOptions.filter((option) =>
      appModules.some((m) => m.code === option.moduleCode),
    );
  }, [appModules]);

  const handleModeChange = (selectedMode: ModeOption) => {
    if (selectedMode.mode !== mode) {
      setLastActiveModule(selectedMode.mode);
      router.push(selectedMode.href);
    }
  };

  // Don't render the switcher if user only has access to one module
  if (availableOptions.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md',
                  'text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-ring/15',
                )}
              >
                <LayoutGrid className="h-[18px] w-[18px]" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <Portal>
            <TooltipContent side="right">
              <p>Switch Mode</p>
            </TooltipContent>
          </Portal>
        </Tooltip>
      </TooltipProvider>

      <Portal>
        <DropdownMenuContent side="right" align="end" className="w-40">
          {availableOptions.map((option) => (
            <DropdownMenuItem
              key={option.mode}
              onClick={() => handleModeChange(option)}
              className="flex items-center justify-between"
            >
              {option.label}
              {option.mode === mode && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </Portal>
    </DropdownMenu>
  );
}
