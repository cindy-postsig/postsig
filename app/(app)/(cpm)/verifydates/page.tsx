// @ts-nocheck
import { createClient } from '@/utils/supabase/service_server';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { createServerClient } from '@supabase/ssr';
import { Database } from '@/database.types';

type DateEntry = {
  date: string;
  updated_at: string;
  updated_by: string;
};

type LocalContract = {
  id: number;
  subscription_term: string | null;
  status: string | null;
  vendors: { name: string } | null;
  term_start_date: string | DateEntry[];
  term_end_date: string | DateEntry[];
  cancel_date: string | DateEntry[];
};

type ProdContract = {
  id: number;
  vendors: { name: string } | null;
  current_term_start_date: string | null;
  current_term_end_date: string | null;
  current_cancel_by_date: string | null;
};

async function getLocalContractsData() {
  const supabase = createClient();
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select(
      `
      id,
      subscription_term,
      status,
      term_start_date,
      term_end_date,
      cancel_date,
      vendors (
        name
      )
    `,
    )
    .order('id');

  if (error) {
    console.error('Error fetching local contracts:', error);
    return [];
  }
  return contracts;
}

async function getProdContractsData() {
  const supabaseProd = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_PROD_URL!,
    process.env.SUPABASE_PROD_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return '';
        },
        set(name: string, value: string, options: any) {},
        remove(name: string, options: any) {},
      },
    },
  );

  const { data: contracts, error } = await supabaseProd
    .from('contracts')
    .select(
      `
      id,
      current_term_start_date,
      current_term_end_date,
      current_cancel_by_date,
      vendors (
        name
      )
    `,
    )
    .order('id');

  if (error) {
    console.error('Error fetching prod contracts:', error);
    return [];
  }
  return contracts;
}

export default async function ContractDatesPage() {
  const [localContracts, prodContracts] = await Promise.all([
    getLocalContractsData(),
    getProdContractsData(),
  ]);

  const formatDate = (dateStr: string | null) => {
    try {
      if (!dateStr) return 'N/A';
      const date = new Date(dateStr);
      if (isNaN(date.getTime()) || date.getFullYear() < 1970) {
        return 'N/A';
      }
      return format(date, 'yyyy-MM-dd');
    } catch {
      return 'N/A';
    }
  };

  const getOriginalEndDate = (
    dateField: string | DateEntry[] | null,
  ): string => {
    try {
      if (!dateField) return '';

      let dates: DateEntry[];
      if (typeof dateField === 'string') {
        dates = JSON.parse(dateField);
      } else {
        dates = dateField;
      }

      if (!Array.isArray(dates) || dates.length === 0) return '';

      return dates[dates.length - 1]?.date || '';
    } catch (e) {
      console.error('Error getting original end date:', e);
      return '';
    }
  };

  const isDateInFuture = (dateStr: string): boolean => {
    try {
      if (!dateStr) return false;

      const date = new Date(dateStr);
      if (isNaN(date.getTime()) || date.getFullYear() < 1970) {
        return false;
      }
      return date > new Date();
    } catch {
      return false;
    }
  };

  const parseDates = (
    dateField: string | DateEntry[] | null,
  ): { latest: string; original: string } => {
    try {
      if (!dateField) {
        return { latest: 'N/A', original: 'N/A' };
      }

      let dates: DateEntry[];

      if (typeof dateField === 'string') {
        dates = JSON.parse(dateField);
      } else if (Array.isArray(dateField)) {
        dates = dateField;
      } else {
        throw new Error('Invalid date field format');
      }

      if (!Array.isArray(dates) || dates.length === 0) {
        return { latest: 'N/A', original: 'N/A' };
      }

      // If there's only one date, use it for both latest and original
      if (dates.length === 1) {
        return {
          latest: formatDate(dates[0].date),
          original: formatDate(dates[0].date),
        };
      }

      return {
        latest: formatDate(dates[0].date),
        original: formatDate(dates[dates.length - 1].date),
      };
    } catch (e) {
      console.error('Error parsing dates:', e);
      return { latest: 'N/A', original: 'N/A' };
    }
  };

  // Create a map of prod contracts for easy lookup
  const prodContractsMap = new Map(
    prodContracts.map((contract) => [contract.id, contract]),
  );

  return (
    <div className="mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Contract Dates Comparison (Local vs Prod)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Contract ID</th>
                  <th className="p-2 text-left">Vendor</th>
                  <th className="p-2 text-left">Term</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="border-r p-2 text-left" colSpan={3}>
                    Original Dates (Local)
                  </th>
                  <th className="border-r p-2 text-left" colSpan={3}>
                    New Dates (Local)
                  </th>
                  <th className="p-2 text-left" colSpan={3}>
                    Production Dates
                  </th>
                </tr>
                <tr className="border-b text-sm text-gray-600">
                  <th className="p-2 text-left"></th>
                  <th className="p-2 text-left"></th>
                  <th className="p-2 text-left"></th>
                  <th className="p-2 text-left"></th>
                  <th className="p-2 text-left">Start</th>
                  <th className="p-2 text-left">End</th>
                  <th className="border-r p-2 text-left">Cancel</th>
                  <th className="p-2 text-left">Start</th>
                  <th className="p-2 text-left">End</th>
                  <th className="border-r p-2 text-left">Cancel</th>
                  <th className="p-2 text-left">Start</th>
                  <th className="p-2 text-left">End</th>
                  <th className="p-2 text-left">Cancel</th>
                </tr>
              </thead>
              <tbody>
                {localContracts.map((localContract: LocalContract) => {
                  const startDates = parseDates(localContract.term_start_date);
                  const endDates = parseDates(localContract.term_end_date);
                  const cancelDates = parseDates(localContract.cancel_date);

                  const originalEndDate = getOriginalEndDate(
                    localContract.term_end_date,
                  );
                  const isEndDateFuture = isDateInFuture(originalEndDate);

                  // Get corresponding prod contract
                  const prodContract = prodContractsMap.get(
                    localContract.id,
                  ) as ProdContract | undefined;

                  return (
                    <tr
                      key={localContract.id}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="p-2">{localContract.id}</td>
                      <td className="p-2">
                        {localContract.vendors?.name || 'Unknown'}
                      </td>
                      <td className="p-2">
                        {localContract.subscription_term || 'N/A'}
                      </td>
                      <td className="p-2">{localContract.status || 'N/A'}</td>
                      {/* Original Local Dates */}
                      <td className="whitespace-nowrap p-2">
                        {startDates.original}
                      </td>
                      <td className="whitespace-nowrap p-2">
                        {endDates.original}
                      </td>
                      <td className="whitespace-nowrap border-r p-2">
                        {cancelDates.original}
                      </td>
                      {/* New Local Dates */}
                      <td
                        className={`font-medium whitespace-nowrap p-2 ${
                          !isEndDateFuture &&
                          startDates.latest ===
                            formatDate(prodContract?.current_term_start_date)
                            ? 'text-blue-600'
                            : ''
                        }`}
                      >
                        {!isEndDateFuture && startDates.latest !== 'N/A'
                          ? startDates.latest
                          : isEndDateFuture
                            ? 'Not renewed'
                            : 'No renewal data'}
                      </td>
                      <td
                        className={`font-medium whitespace-nowrap p-2 ${
                          !isEndDateFuture &&
                          endDates.latest ===
                            formatDate(prodContract?.current_term_end_date)
                            ? 'text-blue-600'
                            : ''
                        }`}
                      >
                        {!isEndDateFuture ? endDates.latest : ''}
                      </td>
                      <td
                        className={`font-medium whitespace-nowrap border-r p-2 ${
                          !isEndDateFuture &&
                          cancelDates.latest ===
                            formatDate(prodContract?.current_cancel_by_date)
                            ? 'text-blue-600'
                            : ''
                        }`}
                      >
                        {!isEndDateFuture ? cancelDates.latest : ''}
                      </td>
                      {/* Production Dates */}
                      <td className="font-medium whitespace-nowrap p-2">
                        {formatDate(prodContract?.current_term_start_date)}
                      </td>
                      <td className="font-medium whitespace-nowrap p-2">
                        {formatDate(prodContract?.current_term_end_date)}
                      </td>
                      <td className="font-medium whitespace-nowrap p-2">
                        {formatDate(prodContract?.current_cancel_by_date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
