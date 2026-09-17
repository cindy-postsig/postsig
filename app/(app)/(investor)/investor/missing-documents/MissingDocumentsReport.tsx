'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import VendorIcon from '@/components/vendors/VendorIcon';
import { useMode } from '@/contexts/ModeContext';
import type { MissingDocumentsResult } from '@/lib/v2/inv/types';

interface MissingDocumentsReportProps {
  data: MissingDocumentsResult;
}

export function MissingDocumentsReport({ data }: MissingDocumentsReportProps) {
  const { selectedFunds } = useMode();

  const filteredCompanies = useMemo(() => {
    if (selectedFunds.includes('all') || selectedFunds.length === 0) {
      return data.companies;
    }

    const numericFundIds = selectedFunds.filter(
      (id): id is number => typeof id === 'number',
    );

    return data.companies.filter((company) =>
      numericFundIds.some((fundId) => company.fundIds.includes(fundId)),
    );
  }, [data.companies, selectedFunds]);

  const companiesWithMissing = filteredCompanies.filter(
    (c) => c.missingCount > 0,
  );
  const totalMissing = companiesWithMissing.reduce(
    (sum, c) => sum + c.missingCount,
    0,
  );

  return (
    <div className="pb-24">
      <div className="mb-6">
        <h1 className="font-normal">Missing Documents Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalMissing} missing {totalMissing === 1 ? 'document' : 'documents'}{' '}
          across {companiesWithMissing.length}{' '}
          {companiesWithMissing.length === 1 ? 'company' : 'companies'}
        </p>
      </div>

      <div className="overflow-hidden rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Missing Documents</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCompanies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No companies with document requirements found.
                </TableCell>
              </TableRow>
            ) : (
              filteredCompanies.map((company) => (
                <TableRow key={company.companyId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <VendorIcon
                        name={company.companyName}
                        width={36}
                        height={36}
                      />
                      <span className="font-medium text-sm">
                        {company.companyName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {company.fundName ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {company.missingCount === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {company.missingDocTypes.map((doc) => (
                          <Badge
                            key={doc.definedName}
                            size="sm"
                            className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {doc.definedName}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {company.receivedDocTypes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {company.receivedDocTypes.map((name) => (
                          <Badge
                            key={name}
                            variant="secondary"
                            size="sm"
                            className="gap-1 text-emerald-700 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {company.missingCount === 0 ? (
                      <span className="font-medium text-sm text-emerald-600 dark:text-emerald-400">
                        Complete
                      </span>
                    ) : (
                      <span className="font-medium text-sm text-destructive">
                        {company.totalExpected - company.missingCount} of{' '}
                        {company.totalExpected}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/investor/company/${company.companyPublicId}?view=documents`}
                      >
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
