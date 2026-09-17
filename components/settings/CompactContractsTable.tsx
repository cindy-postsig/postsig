'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink, MoreHorizontal, FileText } from 'lucide-react';
import VendorIcon from '@/components/vendors/VendorIcon';
import { formatCurrency } from '@/app/lib/utils';

interface Contract {
  id: string;
  vendorName: string;
  vendorDomain?: string;
  product: string;
  annualCost: number;
  currency: string;
}

interface CompactContractsTableProps {
  contracts: Contract[];
  onRevokeAccess: (contractId: string) => void;
}

export function CompactContractsTable({
  contracts,
  onRevokeAccess,
}: CompactContractsTableProps) {
  const handleOpenContract = (contractId: string) => {
    // Open contract in new window
    window.open(`/contracts/${contractId}`, '_blank');
  };

  if (contracts.length === 0) {
    return (
      <div className="rounded border p-8 text-center">
        <p className="text-xs text-muted-foreground">No contracts assigned</p>
      </div>
    );
  }

  return (
    <Table stickyHeader scrollClassName="rounded border">
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/2 py-3 text-xs">Vendor & Product</TableHead>
          <TableHead className="py-3 text-right text-xs">Annual Cost</TableHead>
          <TableHead className="py-3 text-right text-xs">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contracts.map((contract) => (
          <TableRow key={contract.id} className="font-sans">
            <TableCell className="bg-card">
              <div className="flex items-center gap-3">
                <VendorIcon
                  name={contract.vendorName}
                  domain={contract.vendorDomain}
                  width={32}
                  height={32}
                />
                <div>
                  <div className="font-medium text-sm">
                    {contract.vendorName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {contract.product}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell className="bg-card text-right">
              <div className="font-medium">
                {formatCurrency(contract.annualCost, contract.currency)}
              </div>
            </TableCell>
            <TableCell className="bg-card">
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenContract(contract.id)}
                    className="text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onRevokeAccess(contract.id)}
                      >
                        Revoke Access
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
