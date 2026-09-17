'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { formatCurrency } from '@/app/lib/utils';
import { SummaryCard } from '@/components/cards/SummaryCard';
import {
  SeatDetailRow,
  SeatExpanderCell,
  hasSeatDetail,
} from '@/components/assignments/SeatDetail';
import { getCountryName } from '@/constants/countries';
import { SeatStatusBadge } from '@/components/seats/SeatStatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { unitPathOf, unitPaths } from '@/lib/v2/assignments/scope';
import type {
  AssignmentSeat,
  AssignmentUser,
  AssignmentsPayload,
} from '@/lib/v2/assignments/types';
import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import { LEVEL_LABEL } from '@/lib/v2/assignments/levels';
import { HrStatusBadge } from './HrStatusBadge';
import { PLACEHOLDER } from './placeholders';

export function UserProfilePanel({
  user,
  payload,
  pathLevels,
  baseCurrency,
  dateFormat,
}: {
  user: AssignmentUser;
  payload: AssignmentsPayload;
  pathLevels: readonly OrgUnitTreeLevel[];
  baseCurrency: string;
  dateFormat: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [hrOpen, setHrOpen] = useState(false);
  const pathByLevel = useMemo(
    () => unitPathOf(unitPaths(payload.nodes), user.orgUnitId).pathByLevel,
    [payload.nodes, user.orgUnitId],
  );
  const seats = user.seatIds
    .map((id) => payload.seats[id])
    .filter((seat): seat is AssignmentSeat => seat !== undefined);
  const inactiveCount = seats.filter((seat) => seat.underused).length;
  const countryName = user.country
    ? (getCountryName(user.country) ?? user.country)
    : null;
  const fields: { label: string; value: string | null }[] = [
    ...pathLevels.map((level) => ({
      label: LEVEL_LABEL[level],
      value: pathByLevel[level] ?? null,
    })),
    { label: 'Cost centre', value: user.costCenter },
    {
      label: 'Location',
      value: [user.region, countryName].filter(Boolean).join(' · '),
    },
  ];

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-medium font-sans text-lg leading-none">
            {user.name}
          </h2>
          <HrStatusBadge status={user.status} />
        </div>
        <p className="mt-1 font-sans-neue text-sm text-muted-foreground">
          {[user.email, user.employeeId].filter(Boolean).join(' · ') ||
            PLACEHOLDER}
        </p>
        <button
          type="button"
          aria-expanded={hrOpen}
          onClick={() => setHrOpen((open) => !open)}
          className="mt-3 flex items-center gap-1 font-label text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              hrOpen && 'rotate-90',
            )}
          />
          HR structure
        </button>
        {hrOpen && (
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((field) => (
              <Field
                key={field.label}
                label={field.label}
                value={field.value}
              />
            ))}
          </dl>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          bgColor="from-gray-700/5 to-gray-700/15"
          size="sm"
          title="Assignments"
          value={String(seats.length)}
        />
        <SummaryCard
          bgColor="from-gray-700/5 to-gray-700/15"
          size="sm"
          title="Monthly cost"
          value={formatCurrency(user.monthlyCost, baseCurrency, true)}
          description={payload.window.label}
        />
        <SummaryCard
          bgColor="from-gray-700/5 to-gray-700/15"
          size="sm"
          title="Inactive"
          value={String(inactiveCount)}
        />
      </div>

      <section className="rounded-lg border border-border">
        {seats.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            This person holds no seats.
          </p>
        ) : (
          <>
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-2" />
                  <TableHead>Vendor</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seats.map((seat) => {
                  const open = expanded === seat.id;
                  const toggle = () => setExpanded(open ? null : seat.id);
                  return (
                    <Fragment key={seat.id}>
                      <TableRow
                        className={
                          hasSeatDetail(seat) ? 'cursor-pointer' : undefined
                        }
                        onClick={hasSeatDetail(seat) ? toggle : undefined}
                      >
                        <SeatExpanderCell
                          seat={seat}
                          open={open}
                          onToggle={toggle}
                        />
                        <TableCell className="font-medium">
                          {seat.vendorName}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium block">
                            {seat.productName}
                          </span>
                          {seat.deliveryMethods.length > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              {seat.deliveryMethods.join(' · ')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {PLACEHOLDER}
                        </TableCell>
                        <TableCell>
                          {seat.assignedDate
                            ? formatDate(seat.assignedDate, dateFormat)
                            : PLACEHOLDER}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {PLACEHOLDER}
                        </TableCell>
                        <TableCell>
                          <SeatStatusBadge reasons={seat.inactiveReasons} />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(seat.monthlyCost, baseCurrency, true)}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <SeatDetailRow
                          seat={seat}
                          colSpan={8}
                          baseCurrency={baseCurrency}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </section>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">
        {value && value.trim() !== '' ? (
          value
        ) : (
          <span className="text-muted-foreground">{PLACEHOLDER}</span>
        )}
      </dd>
    </div>
  );
}
