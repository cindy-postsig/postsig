import { CalendarClient } from './CalendarClient';
import { getCalendarData } from '@/lib/v2/calendar/service';
import {
  contractsToChainContracts,
  type ContractRowInput,
} from '@/lib/contracts/productLineageResolution';
import { resolveRemovedProductsAcrossChains } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { CALENDAR_LIST_COLUMNS as columns } from '@/components/contracts/listViewDefaults';

export async function CalendarServer({
  view,
}: {
  view: 'month' | 'quarter' | 'year';
}) {
  const { events, fiscalYearStartMonth, userMetadata } =
    await getCalendarData();

  if (!userMetadata) {
    return null;
  }

  if (events.length === 0) {
    return null;
  }

  // Confirmed cancellations (PSK-1830): the calendar is forward-looking, so
  // struck products are excluded from its events. Serialized as a plain
  // record — Map/Set do not cross the RSC boundary.
  const removedByContract = await resolveRemovedProductsAcrossChains({
    organizationId: userMetadata.organizationId,
    chainContracts: contractsToChainContracts(
      events.map((e) => e.contract) as unknown as ContractRowInput[],
    ),
  });
  const removedProductsByContract = Object.fromEntries(
    [...removedByContract].map(([id, ids]) => [id, [...ids]]),
  );

  return (
    <CalendarClient
      initialData={events}
      fiscalYearStartMonth={fiscalYearStartMonth}
      initialView={view}
      columns={columns}
      userMetadata={userMetadata}
      removedProductsByContract={removedProductsByContract}
    />
  );
}
