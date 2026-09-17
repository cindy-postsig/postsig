import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getUserMetadata } from '@/data/users';
import { isAssignmentsEnabled } from '@/lib/v2/assignments/flag';
import { AssignmentsPage } from '@/components/assignments/AssignmentsPage';
import { ASSIGNMENTS_SIDEBAR_ID } from '@/lib/v2/assignments/layout';
import { loadAssignmentsPage } from '@/lib/v2/assignments/service';
import { getOrgHierarchyLevelOrder } from '@/lib/v2/org-units/sync';
import {
  panelLayoutCookieName,
  parsePanelLayout,
} from '@/lib/panel-layout-cookie';
import { timed } from '@/utils/logging/timed';

export default async function AssignmentsRoute({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const user = await timed('assignments.getUserMetadata', getUserMetadata);
  if (!user) return null;

  if (
    !(await timed('assignments.isAssignmentsEnabled', () =>
      isAssignmentsEnabled(user),
    ))
  )
    notFound();

  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const defaultLayout = parsePanelLayout(
    cookieStore.get(panelLayoutCookieName(ASSIGNMENTS_SIDEBAR_ID))?.value,
    2,
  );
  // The org's own levels, in its own order: the columns the Users table shows,
  // and why an org with only Business Groups sees only that level.
  const [payload, pathLevels] = await Promise.all([
    timed('assignments.loadAssignmentsPage', () =>
      loadAssignmentsPage(user, { month: params?.month }),
    ),
    timed('assignments.getOrgHierarchyLevelOrder', () =>
      getOrgHierarchyLevelOrder(user.organizationId),
    ),
  ]);

  return (
    <AssignmentsPage
      initialPayload={payload}
      pathLevels={pathLevels}
      baseCurrency={user.baseCurrency}
      dateFormat={user.dateFormat}
      defaultLayout={defaultLayout}
    />
  );
}
