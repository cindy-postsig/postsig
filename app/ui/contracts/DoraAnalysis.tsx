'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChevronRightIcon } from '@radix-ui/react-icons';
import { toast } from '@/components/ui/use-toast';
import { calculateDoraScore } from '@/app/lib/contracts/dora';
import { DoraDetailedCategoriesGrid, DoraScoreIndicator } from './dora-score';
import { useAbility } from '@/components/providers/AbilityProvider';

interface DoraAnalysisProps {
  contract: any;
  isSidePanelOpen?: boolean;
  isPostSig?: boolean;
}

export default function DoraAnalysis({
  contract,
  isSidePanelOpen = false,
  isPostSig = false,
}: DoraAnalysisProps) {
  const { score, details } = calculateDoraScore(contract);
  const router = useRouter();
  const ability = useAbility();
  const canManageContracts = ability.can('manage', 'Contract');
  const [isUpdating, setIsUpdating] = useState(false);
  const [vendorStatus, setVendorStatus] = useState({
    isIctProvider: contract.vendors?.ict_provider === true,
    isIctProviderUndefined:
      contract.vendors?.ict_provider === null ||
      contract.vendors?.ict_provider === undefined,
    isNotIctProvider: contract.vendors?.ict_provider === false,
  });

  const handleUpdateIctStatus = async (isIctProvider: boolean) => {
    if (!contract.vendors?.id) return;

    try {
      setIsUpdating(true);

      const response = await fetch('/api/vendors/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorIds: [contract.vendors.id],
          isIctProvider: isIctProvider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to update ICT provider status',
        );
      }

      setVendorStatus({
        isIctProvider: isIctProvider,
        isIctProviderUndefined: false,
        isNotIctProvider: !isIctProvider,
      });
      toast({
        title: 'ICT Provider Status Updated',
        description: `Successfully updated ${contract.vendors.name} as ${isIctProvider ? 'an ICT provider' : 'not an ICT provider'}.`,
      });

      // Refresh the page to ensure all data is updated
      router.refresh();
    } catch (error) {
      console.error('Failed to update ICT status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update ICT provider status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>DORA Analysis Score</CardTitle>
        </CardHeader>
        <CardContent>
          {vendorStatus.isIctProviderUndefined && (
            <Alert className="mb-6">
              <AlertTitle>Confirm ICT Vendor</AlertTitle>
              <AlertDescription className="max-w-4xl font-sans-neue">
                Before analyzing DORA compliance, please confirm if this vendor
                is an ICT (Information and Communication Technology) service
                provider. DORA regulations apply specifically to ICT service
                providers.
              </AlertDescription>
              <div className="mt-4 flex">
                <Button
                  size={'sm'}
                  onClick={() => handleUpdateIctStatus(true)}
                  disabled={isUpdating || !canManageContracts}
                  className="mr-2"
                >
                  {isUpdating ? 'Updating...' : 'Confirm as ICT Provider'}
                </Button>
                <Button
                  variant="secondary"
                  size={'sm'}
                  onClick={() => handleUpdateIctStatus(false)}
                  disabled={isUpdating || !canManageContracts}
                >
                  {isUpdating ? 'Updating...' : 'Not an ICT Provider'}
                </Button>
              </div>
            </Alert>
          )}
          {vendorStatus.isNotIctProvider && (
            <Alert className="mb-6">
              <AlertTitle>Not an ICT Provider</AlertTitle>
              <AlertDescription className="max-w-4xl font-sans-neue">
                This vendor is not marked as an ICT (Information and
                Communication Technology) service provider. DORA analysis is
                primarily applicable to ICT service providers.
              </AlertDescription>
              <div className="mt-4 flex">
                <Button
                  size={'sm'}
                  onClick={() => handleUpdateIctStatus(true)}
                  disabled={isUpdating || !canManageContracts}
                  className="mr-2"
                >
                  {isUpdating ? 'Updating...' : 'Mark as ICT Provider'}
                </Button>
              </div>
            </Alert>
          )}
          <div
            className={`${vendorStatus.isIctProviderUndefined || vendorStatus.isNotIctProvider ? 'opacity-50' : ''}`}
          >
            <div className="mb-4 flex items-center">
              <DoraScoreIndicator
                score={score}
                size="lg"
                details={details}
                showTooltip={false}
              />
            </div>
            <p className="mb-6 font-serif text-lg">
              The Digital Operational Resilience Act (DORA) score measures how
              well this contract addresses key operational resilience
              requirements.
            </p>

            <div>
              <DoraDetailedCategoriesGrid
                details={details}
                contract={contract}
                isSidePanelOpen={isSidePanelOpen}
              />
            </div>
          </div>

          {isPostSig && (
            <div className="mt-4 flex">
              <Link
                href={'/reports/dora'}
                className="mt-2 flex w-auto items-center border-b border-b-transparent text-[0.85rem] leading-none text-foreground hover:border-b-foreground/50"
              >
                See DORA report for all vendors
                <ChevronRightIcon width={14} height={14} />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
