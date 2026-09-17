'use client';

import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useSettingsBasePath } from '@/hooks/useSettingsBasePath';

interface GroupBreadcrumbProps {
  groupName: string;
}

export function GroupBreadcrumb({ groupName }: GroupBreadcrumbProps) {
  const settingsBasePath = useSettingsBasePath();

  return (
    <Breadcrumb className="mb-2">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              href={`${settingsBasePath}/groups`}
              className="text-muted-foreground hover:text-foreground"
            >
              Groups
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{groupName}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
