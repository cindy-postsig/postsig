'use client';

import { useDiscussionVisibility } from '@/app/ui/contracts/toggleDiscussion';
import { usePdfVisibility } from '@/app/ui/contracts/togglePdf';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { panelLayoutCookieStorage } from '@/lib/panel-layout-cookie';
import { useEffect, useRef } from 'react';
import { ImperativePanelHandle } from 'react-resizable-panels';

interface ContractLayoutWrapperProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  defaultLayout?: number[];
}

export default function ContractLayoutWrapper({
  sidebar,
  children,
  defaultLayout,
}: ContractLayoutWrapperProps) {
  const { isPdfOpen } = usePdfVisibility()!;
  const { isDiscussionOpen } = useDiscussionVisibility()!;
  const isSidePanelOpen = isPdfOpen || isDiscussionOpen;

  const sidebarRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    if (isSidePanelOpen) {
      sidebarRef.current?.collapse();
    } else {
      sidebarRef.current?.expand();
    }
  }, [isSidePanelOpen]);

  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="contract-sidebar"
      storage={panelLayoutCookieStorage}
      className="h-full"
    >
      <ResizablePanel
        ref={sidebarRef}
        defaultSize={defaultLayout?.[0] ?? 15}
        minSize={15}
        maxSize={50}
        collapsible
        collapsedSize={0}
        className="min-w-0"
      >
        {sidebar}
      </ResizablePanel>

      <ResizableHandle className={isSidePanelOpen ? 'hidden' : ''} />

      <ResizablePanel
        defaultSize={defaultLayout?.[1] ?? 85}
        className="min-w-0"
      >
        {children}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
