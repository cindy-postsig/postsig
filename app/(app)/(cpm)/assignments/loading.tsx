import { cookies } from 'next/headers';
import Loading from '@/components/Loading';
import { Input } from '@/components/ui/input';
import {
  panelLayoutCookieName,
  parsePanelLayout,
} from '@/lib/panel-layout-cookie';
import {
  ASSIGNMENTS_DEFAULT_LAYOUT,
  ASSIGNMENTS_SIDEBAR_ID,
} from '@/lib/v2/assignments/layout';

// Sized like the resizable rail it stands in for, so the page streaming in
// does not shift the content column.
export default async function AssignmentsLoading() {
  const cookieStore = await cookies();
  const layout =
    parsePanelLayout(
      cookieStore.get(panelLayoutCookieName(ASSIGNMENTS_SIDEBAR_ID))?.value,
      2,
    ) ?? ASSIGNMENTS_DEFAULT_LAYOUT;

  return (
    <div className="flex">
      <div
        className="min-h-[calc(100vh-3.5rem)] shrink-0 border-r border-border"
        style={{ width: `${layout[0]}%` }}
      >
        <div className="sticky top-14 flex flex-col gap-3 pt-4">
          <p className="px-4 font-label text-xs uppercase tracking-wide text-muted-foreground">
            HR structure
          </p>
          <div className="px-2">
            <Input
              disabled
              placeholder="Jump to level or user"
              aria-label="Jump to level or user"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 px-6 pt-6 2xl:px-8 2xl:pt-8">
        <p className="font-label text-xs uppercase tracking-wide text-muted-foreground">
          Inventory management
        </p>
        <h1 className="mt-1 font-serif leading-none">Assignments</h1>
        <div className="flex w-full items-center justify-center p-12">
          <Loading />
        </div>
      </div>
    </div>
  );
}
