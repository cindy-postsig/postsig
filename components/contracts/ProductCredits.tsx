'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DotsHorizontalIcon, Pencil2Icon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { useEdit } from '@/app/ui/contracts/edit/EditContext';
import { useHierarchy } from '@/contexts/HierarchyContext';
import { formatCurrencyFull } from '@/app/lib/utils';
import { getProductYearLabel } from '@/app/lib/budget';
import { contractCredits, creditsByYear } from '@/lib/v2/credits';
import logger from '@/utils/pino';
import type { ContractCredit, RawContractCreditRow } from '@/lib/v2/credits';
import type { DateEntry } from '@/lib/v2/products/types';

interface ProductCreditsContractData {
  id: number;
  currency?: string | null;
  term_start_date?: DateEntry[];
  contract_product_credits?: RawContractCreditRow[] | null;
}

type ProductCreditsProps = {
  data: ProductCreditsContractData;
};

/**
 * Credit lines on an invoice, listed below Products Licensed.
 *
 * Deliberately its own card with its own total: a credit reduces what is owed,
 * but the products total above stays products plus sales tax, and whether a
 * credit offsets the reconciliation figure is a separate decision. Renders
 * nothing at all when the contract has no credits, so it is invisible on every
 * contract that predates this.
 */
export default function ProductCredits({ data }: ProductCreditsProps) {
  const credits = useMemo(() => contractCredits(data), [data]);

  if (credits.length === 0) {
    return <></>;
  }

  return <ProductCreditsContent data={data} credits={credits} />;
}

function ProductCreditsContent({
  data,
  credits,
}: {
  data: ProductCreditsContractData;
  credits: ContractCredit[];
}) {
  const [isCreditEditMode, setIsCreditEditMode] = useState(false);
  const edit = useEdit();
  const { toast } = useToast();
  const { fiscalYearStartMonth } = useHierarchy();

  const canEdit = edit?.canEdit ?? false;
  const isEditMode = (edit?.isEditMode ?? false) || isCreditEditMode;

  const currency = data.currency ?? undefined;
  const byYear = useMemo(() => creditsByYear(credits), [credits]);
  const sortedYears = useMemo(
    () => Object.keys(byYear).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
    [byYear],
  );
  // Only Exchange Agreement products carry a code, so the column stays hidden
  // everywhere else rather than showing an empty column.
  const hasAnyProductCode = credits.some((credit) => !!credit.productCode);
  const totalColumns = 2 + (hasAnyProductCode ? 1 : 0) + 1;

  /** The amount on screen, which in edit mode is the pending value. */
  const displayAmount = (credit: ContractCredit) =>
    (edit?.getFieldValue(
      'contract_product_credits',
      credit.id,
      'amount',
      credit.amount,
    ) as number | null) ?? credit.amount;

  const total = credits.reduce(
    (sum, credit) => sum + (displayAmount(credit) || 0),
    0,
  );

  const handleSave = async () => {
    if (!edit) return;
    try {
      const result = await edit.saveAllChanges();
      if (result.success) {
        setIsCreditEditMode(false);
      } else {
        logger.error({ error: result.error }, 'Failed to save credit edits');
        toast(
          generateToastError(
            result.error || 'Failed to save changes',
            'Save failed',
          ),
        );
      }
    } catch (error) {
      logger.error({ error }, 'Unexpected error saving credit edits');
      toast(
        generateToastError(
          'An unexpected error occurred while saving',
          'Save failed',
        ),
      );
    }
  };

  const handleCancel = () => {
    edit?.clearAllChanges();
    setIsCreditEditMode(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Product Credits</CardTitle>
        {canEdit && !isEditMode && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-sm outline-none hover:bg-gray-700/10">
              <DotsHorizontalIcon width={18} height={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsCreditEditMode(true)}>
                <Pencil2Icon className="mr-2 h-4 w-4" />
                <span>Edit</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent>
        <Table stickyHeader className="[&>thead]:bg-card">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-1/4 px-2 py-1 align-bottom" />
              <TableHead className="w-2/5 px-2 py-1 align-bottom">
                Product
              </TableHead>
              {hasAnyProductCode && (
                <TableHead className="w-32 px-2 py-1 align-bottom">
                  Product Code
                </TableHead>
              )}
              <TableHead className="w-32 px-2 py-1 text-right align-bottom">
                Credit
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedYears.map((year) => {
              const creditsInYear = byYear[year];
              return creditsInYear.map((credit, index) => (
                <TableRow
                  key={credit.id}
                  className="border-b-0 hover:bg-transparent"
                >
                  {index === 0 && (
                    <TableCell
                      rowSpan={creditsInYear.length}
                      className="w-1/4 border-b-0 px-2 py-2 align-top"
                    >
                      <p className="font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                        {getProductYearLabel(
                          parseInt(year, 10),
                          data.term_start_date,
                          fiscalYearStartMonth || 1,
                        )}
                      </p>
                    </TableCell>
                  )}
                  <TableCell className="w-2/5 border-b border-dashed border-b-foreground/10 px-2 py-2 align-top">
                    <div className="font-sans text-[.9rem] tracking-[0.02rem]">
                      {credit.name}
                    </div>
                  </TableCell>
                  {hasAnyProductCode && (
                    <TableCell className="w-32 border-b border-dashed border-b-foreground/10 px-2 py-2 align-top font-label text-sm">
                      {credit.productCode || '-'}
                    </TableCell>
                  )}
                  <TableCell className="w-32 border-b border-dashed border-b-foreground/10 px-2 py-2 text-right align-top">
                    {isEditMode ? (
                      <div className="flex justify-end">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={displayAmount(credit) ?? ''}
                          onChange={(e) => {
                            const trimmed = e.target.value.trim();
                            const parsed = parseFloat(trimmed);
                            const newValue =
                              trimmed === '' || Number.isNaN(parsed)
                                ? null
                                : parsed;
                            edit?.setFieldValue(
                              'contract_product_credits',
                              credit.id,
                              'amount',
                              credit.amount,
                              newValue,
                              {
                                productId: credit.productId,
                                productName: credit.name,
                                year: credit.year,
                              },
                            );
                          }}
                          className={`h-7 w-28 text-right text-sm ${
                            edit?.isFieldModified(
                              'contract_product_credits',
                              credit.id,
                              'amount',
                            )
                              ? 'border-blue-500'
                              : ''
                          }`}
                        />
                      </div>
                    ) : (
                      <div className="font-label text-sm">
                        {/* Unsigned: the column and card already say Credit. */}
                        {formatCurrencyFull(displayAmount(credit), currency)}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ));
            })}
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={totalColumns}
                className="border-b-0 px-2 py-8"
              >
                <div className="flex flex-col items-end gap-1">
                  <div className="grid grid-cols-[auto_minmax(100px,auto)] items-center gap-x-4 gap-y-1 font-label">
                    <span className="text-xs uppercase tracking-wide">
                      Total Credits
                    </span>
                    <span className="text-right text-base tabular-nums">
                      {formatCurrencyFull(total, currency)}
                    </span>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {isCreditEditMode && (
          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
            <span className="mr-auto text-sm text-muted-foreground">
              {edit?.editedFieldCount ?? 0} field(s) modified
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={edit?.isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!edit?.hasChanges || edit?.isSaving}
            >
              {edit?.isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
