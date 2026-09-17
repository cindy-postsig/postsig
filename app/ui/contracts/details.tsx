// legacy component - not used anymore
// @ts-nocheck
'use client';

import Tab from '@/app/ui/Tab';
import TabRowWrapper from '@/app/ui/contracts/TabRowWrapper';
import Label1 from '@/components/Label1';
import { Database } from '@/database.types';
import { formatNumberOfMonths } from '@/app/lib/utils';
import { getMissingFields } from '@/lib/v2/reports/transforms/missing-clauses';
import ProductsLicensed from '@/components/contracts/ProductsLicensed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TermCard from '@/components/contracts/TermCard';
import _ from 'lodash';
import { useState, useEffect, useContext, memo } from 'react';
import { fetchContractActivity } from '@/app/lib/contracts/actions';
import { parseISO, format, startOfDay } from 'date-fns';
import ContractOwner from './owner';
import { ActiveUsers } from './active-users';
import { usePdfVisibility } from '@/app/ui/contracts/togglePdf';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import DoraAnalysis from './DoraAnalysis';
import AuditLog from './AuditLog';
import { ContractActivity as Activity } from '@/lib/v2';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserContext } from '@/app/userProvider';
import { contractTypes, isInvoiceType } from '@/app/lib/constants';
import Link from 'next/link';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Suspense } from 'react';
import { ErrorBoundary } from 'next/dist/client/components/error-boundary';
import { postsigAdminRoles, userRoles } from '@/constants/data';
import NoteCard from '@/components/contracts/NoteCard';
import { Alert } from '@/components/ui/alert';
import StatusDropdown from '@/components/contracts/StatusDropdown';
import { useContractStatusUpdate } from '@/hooks/useContractStatusUpdate';
import { Badge } from '@/components/ui/badge';
import { Dates, VendorProductUser } from '@/constants/types';
import ContractTags from './ContractTags';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  CircleBackslashIcon,
  DotsHorizontalIcon,
  ReaderIcon,
} from '@radix-ui/react-icons';
import { exportCSV } from '@/app/lib/actions/contract';
import { handleDownload } from '@/app/lib/utils';
import { RenewedIcon } from '@/components/contracts/icons';
import RenewStatusForm from './renew-status';
import Comments from '@/components/contracts/comments/Comments';
import { Citation } from '@/constants/types';
import CitationBadge from '@/components/contracts/CitationBadge';
import { fetchContractCitationsByUserRoles } from '@/data/superuser/contracts';
import logger from '@/utils/pino';
import { calculateLifetimeContractValue } from '@/app/lib/budget/lifetimeValueCalculator';
import { useAttachmentStorage } from '@/hooks/useAttachmentStorage';
import AmendedClausesCard from './AmendedClausesCard';

interface AssetClass {
  id: number;
  name: string;
}

export default memo(function Details({
  contract,
  documentsWithSignedUrls,
  activities,
}: {
  contract: any;
  documentsWithSignedUrls?: any[];
  activities?: Activity[];
}) {
  const context = usePdfVisibility();
  if (!context) {
    throw new Error(
      'usePdfVisibility must be used within a PdfVisibilityProvider',
    );
  }
  const { togglePdf, isPdfOpen } = context;
  const [activityData, setActivityData] = useState<any>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const userContext = useContext(UserContext);
  const userRole = userContext?.userMetadata?.userRole;
  const userMetadata = userContext?.userMetadata;
  const isAdmin =
    userRole === userRoles.clientAdmin ||
    userRole === userRoles.clientSupervisor ||
    userRole === userRoles.postsigAdmin;
  const isPostSig = userMetadata?.userProfile?.email?.includes('@postsig.com');
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const initialView =
    viewParam && ['overview', 'owner', 'dora', 'audit'].includes(viewParam)
      ? viewParam
      : 'overview';
  const [currentView, setCurrentView] = useState<string>(initialView);
  const canExportCsv = useCanExportCsv('cpm');
  const isExportDisabled =
    contract.ai_extraction_status === 'h_failed' || contract.status_id !== 4;
  // documentsWithSignedUrls is now passed as a prop

  const { updateContractStatus, isLoading } = useContractStatusUpdate({
    onSuccess: () => {
      // Refresh the page or update the contract data
      router.refresh();
    },
  });

  const lifetimeContractValue = calculateLifetimeContractValue(
    contract,
    userMetadata?.organizationFY,
  );

  useEffect(() => {
    const loadCitations = async () => {
      try {
        const citationsData = await fetchContractCitationsByUserRoles({
          contractId: contract.id,
          userMetadata: {
            userId: userMetadata?.userId,
            userRole: userMetadata?.userRole,
            organizationId: userMetadata?.organizationId,
          },
        });
        setCitations(citationsData);
      } catch (error) {
        logger.error({ error }, 'Error loading citations');
      }
    };
    loadCitations();
  }, [contract.id]);

  const fetchActivity = async () => {
    try {
      const data = await fetchContractActivity(contract.id);
      setActivityData(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      setError(error);
      setActivityData(null);
    }
  };

  function generateComponents(
    key: string,
    data: any,
    title: string,
    index: any,
    contractId: number,
    on: boolean,
  ) {
    switch (key) {
      case 'missing_fields':
        return (
          <>
            {Boolean(data.length) && (
              <div className="mb-4">
                <Card className="bg-gray-700/5 dark:bg-secondary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Contract Omissions ({data.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 font-serif">
                      Consider addressing these in future negotiations.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {data.map((field: string, index: number) => (
                        <Badge
                          key={index}
                          variant={'outline'}
                          className="whitespace-nowrap"
                        >
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        );

      case 'status':
        // Check if term_end_date exists and is in the past
        const cancelDate = contract.cancel_date?.[0]?.date;
        const endDate = contract.term_end_date?.[0]?.date;

        const hasCancelDatePassed =
          cancelDate && new Date(cancelDate) < new Date();
        const hasEndDatePassed = endDate && new Date(endDate) < new Date();
        const dateHasPassed =
          hasCancelDatePassed || (!cancelDate && hasEndDatePassed);

        return (
          ((contract.status === 'unconfirmed' && dateHasPassed) ||
            contract.status === 'inactive') && (
            <div className="mb-8">
              <Alert
                variant={'destructive'}
                className="flex items-center justify-between gap-2 bg-pink-100/30 py-4 font-sans text-sm tracking-wide dark:bg-pink-950/10"
              >
                <span>
                  {contract.status === 'inactive' ? (
                    <span>
                      This contract has been <strong>archived</strong>.
                    </span>
                  ) : hasCancelDatePassed ? (
                    <span>
                      The <strong>cancellation date</strong> has passed. Is this
                      contract still active?
                    </span>
                  ) : (
                    <span>
                      The <strong>term end date</strong> has passed. Is this
                      contract still active?
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-right font-sans text-xs leading-tight">
                    Contract Status
                  </span>
                  <StatusDropdown
                    currentStatus={contract.status}
                    onStatusUpdate={(newStatus) =>
                      updateContractStatus(
                        contract.id,
                        newStatus,
                        contract.vendors.name,
                        contract.term_end_date?.[0]?.date,
                        contract.status,
                      )
                    }
                    isLoading={isLoading}
                    isDuplicate={contract.is_duplicate}
                  />
                </div>
              </Alert>
            </div>
          )
        );
      case 'keyTerms':
        return (
          <>
            <TabRowWrapper
              cellWidth={3}
              key={index}
              title={title}
              components={
                data &&
                data.map((label: any, index: number) => {
                  return (
                    <Label1
                      key={index}
                      title={label.title}
                      text={
                        <div className="flex items-center gap-2">
                          <span>{label.text}</span>
                          {label.showRenewedIcon && (
                            <RenewedIcon
                              dateType={label.dateType}
                              originalDate={label.originalDate}
                            />
                          )}
                        </div>
                      }
                      on={label.on}
                    />
                  );
                })
              }
            />
          </>
        );
      case 'asset_classes':
        return (
          <div>
            <Card key={index} className="mb-4 flex items-start bg-gray-700/5">
              <CardHeader className="min-w-40 px-5 py-4">
                <CardTitle className="flex h-6 items-center text-sm">
                  Asset Classes
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <div className="flex flex-wrap gap-1">
                  {data.map((assetClass: any) => (
                    <Badge
                      key={assetClass.id}
                      variant={'secondary'}
                      className="whitespace-nowrap"
                    >
                      {assetClass.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'tags':
        return (
          <div>
            <Card key={index} className="mb-4 flex items-start bg-gray-700/5">
              <CardHeader className="min-w-40 px-5 py-4">
                <CardTitle className="flex h-6 items-center text-sm">
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <div className="flex flex-wrap gap-1">
                  <ContractTags contractId={contractId} />
                </div>
              </CardContent>
            </Card>
          </div>
        );
      case 'notes':
        return (
          <Card key={index} className="mb-4 bg-psblue/5 dark:bg-psblue/10">
            <NoteCard title={'PostSig Notes'} text={data} />
          </Card>
        );
      case 'summary':
        return (
          <div className="mb-4">
            <Card key={index}>
              <TermCard
                contractId={contractId}
                title={'Summary'}
                text={data}
                on={on}
                citations={citations.find((c) => c.id === key)}
              />
            </Card>
          </div>
        );
      case 'productsLicensed':
        return (
          <ProductsLicensed
            data={data}
            citations={citations.find((c) => c.id === 'products_list')}
          />
        );

      case 'payment':
        const nonEmptyPaymentData = data.filter(
          (item: any) => item.text && item.text.trim() !== '',
        );

        if (nonEmptyPaymentData.length === 0) return null;

        return (
          <div className="mb-4 mt-4">
            <Card key={index}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`space-y-4 ${contract.status_id !== 4 ? 'opacity-20' : ''}`}
                >
                  <div className="divide-y divide-foreground/10">
                    {nonEmptyPaymentData.map((item: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-4 gap-8 py-2">
                        <div className="col-span-1 pt-[.4rem] font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                          <div className="flex items-center gap-2">
                            {item.title}
                          </div>
                        </div>
                        <div
                          className={`${!isPdfOpen && 'text-lg'} col-span-3 font-serif`}
                        >
                          {item.text.charAt(0).toUpperCase() +
                            item.text.slice(1)}
                          <CitationBadge
                            citation={citations.find((c) => c.id === item.key)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      case 'permissionsAndScopeOfUse':
        return data.some(
          (item: any) =>
            ((item.text && item.text.trim() !== '') || item.jsx) && item.on,
        ) ? (
          <div className="mb-4 mt-4">
            <Card key={index}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`space-y-4 ${contract.status_id !== 4 ? 'opacity-20' : ''}`}
                >
                  <div className="divide-y divide-foreground/10">
                    {data
                      .filter(
                        (item: any) =>
                          (item.text && item.text.trim() !== '') || item.jsx,
                      )
                      .map((item: any, idx: number) => (
                        <div key={idx} className="grid grid-cols-4 gap-8 py-2">
                          <div className="col-span-1 pt-[.4rem] font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                            <div className="flex items-center gap-2">
                              {item.title}
                              {item.isLegacy && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 text-[0.7rem]"
                                >
                                  Legacy
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div
                            className={`${!isPdfOpen && 'pr-10 text-lg'} col-span-3 font-serif`}
                          >
                            {item.jsx || (
                              <>
                                {item.text}
                                <CitationBadge
                                  citation={citations.find(
                                    (c) => c.id === item.key,
                                  )}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null;
      case 'terms':
        return (
          <>
            <TabRowWrapper
              cellWidth={2}
              key={index}
              title={title}
              components={
                data &&
                data.map((label: any, index: number) => {
                  if (label.key === 'amended_clauses') {
                    return (
                      <AmendedClausesCard
                        amendedClauses={label.text}
                        title="Amended Clauses"
                        key={index}
                      />
                    );
                  }
                  return (
                    <Card key={index} className="h-full">
                      <TermCard
                        contractId={contractId}
                        title={label.title}
                        text={label.text}
                        on={label.on}
                        citations={_.find(citations, { id: label.key })}
                      />
                    </Card>
                  );
                })
              }
            />
          </>
        );
      default:
        break;
    }
  }
  function formatLabelsData(
    contract: Database['public']['Tables']['contracts']['Row'] & {
      asset_classes: AssetClass[];
      vendor_products_users: VendorProductUser[];
    },
  ) {
    const today = new Date();

    if (contract.status_id !== 4) {
      return {
        overview: [
          {
            key: 'keyTerms',
            title: 'Key Terms',
            data: [
              { title: 'Start Date', text: 'Pending', on: false },
              { title: 'End Date', text: 'Pending', on: false },
              { title: 'Cancel By Date', text: 'Pending', on: false },
              { title: 'Subscription Term', text: 'Pending', on: false },
              { title: 'Renewal Type', text: 'Pending', on: false },
              { title: 'Multi-Year Agreement', text: 'Pending', on: false },
            ],
          },
          {
            key: 'summary',
            title: 'PostSig Summary',
            data: contract.summary,
            on: true,
          },
          {
            key: 'productsLicensed',
            title: 'Products Licensed',
            data: contract,
          },
          {
            key: 'payment',
            title: 'Payment Details',
            data: [
              { title: 'Billing Frequency', text: 'Pending', on: false },
              { title: 'Currency', text: 'Pending', on: false },
              { title: 'Payment Terms', text: 'Pending', on: false },
              { title: 'Cancellation Process', text: 'Pending', on: false },
            ],
          },
          {
            key: 'permissionsAndScopeOfUse',
            title: 'Permissions and Scope of Use',
            data: [
              { title: 'End Users', text: 'Pending', on: false },
              { title: 'Number of Users', text: 'Pending', on: false },
              { title: 'Market Data Types', text: 'Pending', on: false },
              { title: 'User Type', text: 'Pending', on: false },
              { title: 'Exclusivity Terms', text: 'Pending', on: false },
              { title: 'Distribution Rights', text: 'Pending', on: false },
              { title: 'Geographic Restrictions', text: 'Pending', on: false },
              { title: 'Derivative Works', text: 'Pending', on: false },
              { title: 'Activities', text: 'Pending', on: false },
            ],
          },
          {
            key: 'terms',
            title: 'Additional Terms',
            data: [
              { title: 'Marketing Rights', text: 'Pending', on: false },
              { title: 'Suspension of Service', text: 'Pending', on: false },
            ],
          },
        ],
      };
    }

    const termStartDates = contract.term_start_date as Dates[] | [{ date: '' }];
    const termEndDates = contract.term_end_date as Dates[] | [{ date: '' }];

    const lastStartDate =
      termStartDates && termStartDates.length > 0
        ? termStartDates[termStartDates.length - 1].date
        : null;
    const lastEndDate =
      termEndDates && termEndDates.length > 0
        ? termEndDates[termEndDates.length - 1].date
        : null;

    const renewed =
      lastEndDate && termEndDates.length > 1
        ? contract.status === 'active'
        : false;

    const paymentData = [
      {
        key: 'billing_frequency',
        title: 'Billing Frequency',
        text: contract.billing_frequency || '',
        on: contract.billing_frequency,
      },
      {
        key: 'currency',
        title: 'Currency',
        text: contract.currency?.toUpperCase(),
        on: contract.currency,
      },
      {
        key: 'payment_terms',
        title: 'Payment Terms',
        text: contract.payment_terms || '',
        on: contract.payment_terms,
      },
      ...(contract.renewal_period || contract.legacy_renewal_period
        ? [
            {
              key: 'renewal_period',
              title: 'Renewal Period',
              text:
                formatNumberOfMonths(contract.renewal_period) ||
                contract.legacy_renewal_period ||
                'N/A',
              on: true,
            },
          ]
        : []),
      {
        key: 'cancellation_process',
        title: 'Cancellation Process',
        text: contract.cancellation_process || '',
        on: contract.cancellation_process,
      },
    ];

    const permissionsAndScopeOfUseData = [
      {
        key: 'end_users',
        title: 'End Users',
        text: contract.end_users ?? '',
        on: Boolean(contract.end_users),
      },
      {
        key: 'number_of_users',
        title: 'Number of Users',
        jsx:
          contract.vendor_products_users.length > 0 ? (
            <div className="flex flex-col items-start gap-2 py-1">
              {contract.vendor_products_users.map((vpu, idx) => (
                <Badge
                  key={idx}
                  variant={'outline'}
                  className="font-sans text-sm"
                >
                  {vpu.number_of_users} Users
                  <span className="ml-2 border-l pl-2">
                    {vpu.vendor_products
                      ? vpu.vendor_products.name
                      : 'All Products'}
                  </span>
                </Badge>
              ))}
            </div>
          ) : contract.number_of_users ? (
            <div className="vpu-item mb-2">{contract.number_of_users}</div>
          ) : null,
        on: Boolean(
          contract.vendor_products_users.length > 0 || contract.number_of_users,
        ),
      },
      {
        key: 'ai_training_restrictions',
        title: 'AI Training Restrictions',
        text: contract.ai_training_restrictions ?? '',
        on: Boolean(contract.ai_training_restrictions),
      },
      {
        key: 'market_data_types',
        title: 'Market Data Types',
        text: contract.market_data_types ?? '',
        on: Boolean(contract.market_data_types),
      },
      {
        key: 'internal_external_users',
        title: 'User Type',
        text: contract.internal_external_users ?? '',
        on: Boolean(contract.internal_external_users),
      },
      {
        key: 'exclusivity_terms',
        title: 'Exclusivity Terms',
        text: contract.exclusivity_terms ?? '',
        on: Boolean(contract.exclusivity_terms),
      },
      {
        key: 'distribution_rights',
        title: 'Distribution Rights',
        text: contract.distribution_rights ?? '',
        on: Boolean(contract.distribution_rights),
      },
      {
        key: 'geo_restrictions',
        title: 'Geographic Restrictions',
        text: contract.geo_restrictions ?? '',
        on: Boolean(contract.geo_restrictions),
      },
      {
        key: 'derivative_works',
        title: 'Derivative Works',
        text: contract.derivative_works ?? '',
        on: Boolean(contract.derivative_works),
      },
      {
        key: 'activities',
        title: 'Activities',
        text: contract.activities ?? '',
        on: Boolean(contract.activities),
      },
    ];

    const newFields = [
      'end_users',
      'number_of_users',
      'market_data_types',
      'internal_external_users',
      'derivative_works',
      'activities',
    ] as const;

    const hasPermissionsData = newFields.some((field) => {
      const value = contract[field];
      return typeof value === 'string' && value.trim() !== '';
    });

    const finalPermissionsAndScopeOfUseData = [
      ...permissionsAndScopeOfUseData,
      // Only add legacy fields if there's no data in the new fields
      ...(!hasPermissionsData && contract.permissions
        ? [
            {
              key: 'permissions',
              title: 'Permissions',
              text: contract.permissions,
              on: true,
              isLegacy: true,
            },
          ]
        : []),
      ...(!hasPermissionsData && contract.scope_of_use
        ? [
            {
              key: 'scope_of_use',
              title: 'Scope of Use',
              text: contract.scope_of_use,
              on: true,
              isLegacy: true,
            },
          ]
        : []),
    ];

    // Define all possible term fields with corresponding metadata
    const possibleTerms = [
      {
        key: 'marketing_rights',
        title: 'Marketing Rights',
        value: contract.marketing_rights,
      },
      {
        key: 'suspension_of_service',
        title: 'Suspension of Service',
        value: contract.suspension_of_service,
      },
      {
        key: 'data_disposal_tnc',
        title: 'Data Disposal Terms and Conditions',
        value: contract.data_disposal_tnc,
      },
      {
        key: 'audit_requirements',
        title: 'Audit Requirements',
        value: contract.audit_requirements,
      },
      {
        key: 'service_level_agreements',
        title: 'Service Level Agreements',
        value: contract.service_level_agreements,
      },
      {
        key: 'cost_mitigation',
        title: 'Incident Related Cost Mitigation',
        value: contract.cost_mitigation,
      },
      {
        key: 'arbitration_and_conflict_resolution',
        title: 'Arbitration and Conflict Resolution',
        value: contract.arbitration_and_conflict_resolution,
      },
      {
        key: 'security_awareness',
        title: 'Security Awareness and Training',
        value: contract.security_awareness,
      },
      {
        key: 'amended_clauses',
        title: 'Amended Clauses',
        value: _.get(contract, ['other_attributes', 'amended_clauses'], []),
      },
    ];

    // Filter to only include terms that have a value and map to the expected format
    const termsData = possibleTerms
      .filter((term) => Boolean(term.value))
      .map((term) => ({
        key: term.key,
        title: term.title,
        text: term.value,
        on: true,
      }));

    const overview = [
      {
        key: 'status',
        title: 'Contract Status',
        data: contract,
        on: contract.status,
      },
      {
        key: 'keyTerms',
        title: 'Key Terms',
        data: [
          {
            key: 'term_start_date',
            title: 'Start Date',
            text:
              (contract.term_start_date as Dates[] | null)?.[0]?.date || 'N/A',
            on: contract.term_start_date as Dates[] | null,
            showRenewedIcon: renewed,
            originalDate: lastStartDate,
            dateType: 'start',
          },
          {
            key: 'execution_date',
            title: 'End Date',
            text:
              (contract.term_end_date as Dates[] | null)?.[0]?.date || 'N/A',
            on: contract.term_end_date as Dates[] | null,
            showRenewedIcon: renewed,
            originalDate: lastEndDate,
            dateType: 'end',
          },
          {
            key: 'cancel_by_date',
            title: 'Cancel By Date',
            text: (contract.cancel_date as Dates[] | null)?.[0]?.date || 'N/A',
            on: contract,
          },
          {
            key: 'subscription_term',
            title: 'Subscription Term',
            text: contract.subscription_term
              ? formatNumberOfMonths(contract.subscription_term)
              : 'N/A',
            on: contract.subscription_term,
          },
          {
            key: 'renewal_type',
            title: 'Renewal Type',
            text: contract.renewal_type || 'N/A',
            on: !_.isNull(contract.renewal_type),
          },
          {
            key: 'multi_year',
            title: 'Multi-Year Agreement',
            text: !_.isNull(contract.multi_year)
              ? contract.multi_year
                ? 'Yes'
                : 'No'
              : 'N/A',
            on: !_.isNull(contract.multi_year),
          },
          //   key: 'lifetime_value',
          //   title: 'Lifetime Contract Value',
          //   text:
          //     contract.status_id === 4
          //       ? formatCurrency(
          //           lifetimeContractValue,
          //           contract.currency || 'USD',
          //         )
          //       : 'N/A',
          //   on: contract.status_id === 4 && lifetimeContractValue > 0,
          // },
        ],
      },
      {
        key: 'notes',
        title: 'PostSig Notes',
        data: contract.postsig_notes,
        on: contract.postsig_notes,
      },
      {
        key: 'missing_fields',
        title: 'Missing Fields',
        data: getMissingFields(
          contract,
          userMetadata?.organizationMissingClauseSettings?.settings,
        ),
      },
      {
        key: 'asset_classes',
        title: 'Asset Classes',
        data: contract.asset_classes,
        on: contract.asset_classes,
      },
      {
        key: 'tags',
        title: 'Tags',
        data: contract.id,
        on: true,
      },
      {
        key: 'summary',
        title: 'PostSig Summary',
        data: contract.summary,
        on: contract.summary,
      },
      {
        key: 'productsLicensed',
        title: 'Products Licensed',
        data: contract,
      },
      // Only include payment section if there's at least one payment field with data
      ...(paymentData.some((item) => item.on)
        ? [
            {
              key: 'payment',
              title: 'Payment Details',
              data: paymentData,
            },
          ]
        : []),
      // Only include permissions section if there's at least one field with data
      ...(finalPermissionsAndScopeOfUseData.some((item) => item.on)
        ? [
            {
              key: 'permissionsAndScopeOfUse',
              title: 'Permissions and Scope of Use',
              data: finalPermissionsAndScopeOfUseData,
            },
          ]
        : []),
      // Only include terms section if there's at least one term with data
      ...(termsData.length > 0
        ? [
            {
              key: 'terms',
              title: 'Fees & Services, Year 1',
              data: termsData,
            },
          ]
        : []),
      {
        title: 'Additional Details',
        data: [
          {
            key: 'execution_date',
            title: 'Execution Date',
            text: contract.execution_date,
          },
          { key: 'currency', title: 'Currency', text: contract.currency },
          {
            key: 'geo_restrictions',
            title: 'Geographic Restrictions',
            text: contract.geo_restrictions,
          },
          { key: 'redistribution', title: 'Redistribution', text: '' },
        ],
      },
    ];

    return { overview };
  }
  // Format currency for display
  const formatCurrency = (value: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const labelsData: any = formatLabelsData(contract);

  function generateTabContent(
    tabKey: any,
    labelsData: any,
    contractId: number,
  ) {
    return (
      <div className="">
        {labelsData[tabKey].map(
          (
            {
              title,
              data,
              key,
              on,
            }: { title: any; data: any; key: string; on: boolean },
            index: any,
          ) => (
            <div key={`${key}-${title}-${index}`}>
              {data &&
                generateComponents(key, data, title, index, contractId, on)}
            </div>
          ),
        )}
      </div>
    );
  }

  function formatActivityData(activity: any) {
    return activity.map((item: any) => {
      const { user_name, activity_type, activity_data, created_at } = item;
      const { recipient, termTitle, message } = JSON.parse(activity_data);

      return {
        user: user_name,
        activity_type,
        termTitle,
        recipient,
        message,
        timestamp: format(parseISO(created_at), 'PPP'),
      };
    });
  }
  function generateActivityContent(activityData: any) {
    return (
      <div className="flex flex-col gap-4">
        {activityData.map((item: any, index: any) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-md bg-white p-4 shadow-[1px_1px_4px_0px_rgba(0,0,0,0.05)]"
          >
            <div className="text-sm text-gray-500">
              <strong>{item.user}</strong> {item.activity_type}{' '}
              <strong>{item.termTitle}</strong> with {item.recipient}
            </div>
            {item.message && (
              <div className="font-serif text-lg">
                &quot;{item.message}&quot;
              </div>
            )}
            <div className="text-sm text-gray-500">{item.timestamp}</div>
          </div>
        ))}
      </div>
    );
  }
  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      content: generateTabContent('overview', labelsData, contract.id),
    },
    {
      key: 'owner',
      label: 'Contract Owner',
      content: (
        <div className="space-y-4">
          <ContractOwner contract={contract} disabled={!isAdmin} />
          <ActiveUsers
            contract={{
              id: contract.id,
              vendor_products_users: contract.vendor_products_users,
              vendor_products: contract.vendor_products_details
                .filter(
                  (detail: {
                    vendor_products: Database['public']['Tables']['vendor_products']['Row'];
                  }) => detail.vendor_products,
                )
                .map(
                  (detail: {
                    vendor_products: Database['public']['Tables']['vendor_products']['Row'];
                  }) => detail.vendor_products,
                ),
            }}
            disabled={!isAdmin}
          />
        </div>
      ),
    },
    {
      key: 'dora',
      label: 'DORA Analysis',
      content: (
        <DoraAnalysis
          contract={contract}
          isPdfOpen={isPdfOpen}
          isPostSig={isPostSig}
        />
      ),
    },
    {
      key: 'log',
      label: 'Audit Log',
      content: (
        <AuditLog
          activities={activities || []}
          contractId={contract.id}
          vendorName={contract.vendors?.name}
        />
      ),
    },
    // {
    //   label: 'Associated Docs',
    //   content: <div>This is the content for Tab 3.</div>,
    // },
    // {
    //   label: 'Activity',
    //   onClick: fetchActivity,
    //   content: error ? (
    //     <div>Error loading activity data.</div>
    //   ) : activityData ? (
    //     generateActivityContent(formatActivityData(activityData))
    //   ) : (
    //     <div>Loading...</div>
    //   ),
    // },
  ];

  return (
    <div
      id="detailsPane"
      className={`${isPdfOpen ? 'w-1/2 border-r' : 'w-full'} scrollbar-track-gray/20 scrollbar-thumb-gray top-0 z-10 h-[calc(100vh-5rem)] overflow-y-auto pb-8 scrollbar-thin`}
    >
      <div
        id="detailsPaneHeader"
        className="mx-auto flex max-w-7xl items-start px-6 py-12"
      >
        <div className="flex min-w-[72px] flex-grow items-center gap-6">
          {contract.ai_extraction_status === 'h_success' ? (
            <div className="flex items-center">
              <ErrorBoundary
                errorComponent={() => (
                  <div className="h-[72px] w-[72px] rounded-sm border bg-gray-700/10" />
                )}
              >
                <Suspense
                  fallback={
                    <div
                      style={{
                        display: 'flex',
                        position: 'relative',
                        width: 72,
                        height: 72,
                        fontSize: 72 / 2,
                      }}
                      className="rounded-sm"
                    ></div>
                  }
                >
                  <Link
                    href={
                      contract.ai_extraction_status === 'h_success'
                        ? `/vendors/${contract.vendors.id}`
                        : ''
                    }
                    className="flex items-center"
                  >
                    <VendorIcon
                      name={contract.vendors?.name ?? ''}
                      domain={contract.vendors?.domain ?? ''}
                      width={72}
                      height={72}
                    />
                  </Link>
                </Suspense>
              </ErrorBoundary>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                position: 'relative',
                width: 72,
                height: 72,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              className="rounded-sm border bg-gray-700/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
                viewBox="0 0 72 72"
                fill="none"
                stroke="currentColor"
                strokeWidth=".5"
                className="text-neutral-400"
              >
                <line x1="0" y1="0" x2="72" y2="72"></line>{' '}
                <line x1="72" y1="0" x2="0" y2="72"></line>{' '}
              </svg>
            </div>
          )}
          <h1
            className={`${isPdfOpen && 'text-4xl'} flex flex-col items-start gap-3 font-serif leading-none transition-all duration-300 ease-in-out`}
          >
            <Link
              href={
                contract.ai_extraction_status === 'h_success'
                  ? `/vendors/${contract.vendors.id}`
                  : ''
              }
              className="-mt-1"
            >
              {contract?.vendors?.name || 'Contract Error'}
            </Link>

            {contract.ai_extraction_status === 'h_success' ? (
              <div className="font-normal flex gap-2 text-xs text-gray-700">
                {contract?.contract_types && (
                  <div className="relative inline-flex items-center">
                    <Badge variant={'outline'}>
                      {contract.contract_types.name}
                    </Badge>
                    <CitationBadge
                      citation={citations.find((c) => c.id === 'contract_type')}
                      className="relative -top-[15px] -ml-1"
                    />
                  </div>
                )}
                {contract.all_parties_signed === 'No' &&
                  !isInvoiceType(contract.contract_types.id) &&
                  contract.contract_types.id !== contractTypes.TOS && (
                    <Badge variant={'secondary'}>Not Executed</Badge>
                  )}
                {contract.will_not_renew && (
                  <Badge variant={'secondary'}>Will Not Renew</Badge>
                )}
              </div>
            ) : (
              <Badge variant={'outline'}>{contract.file_name}</Badge>
            )}
          </h1>
        </div>
        <div className="flex justify-center gap-3">
          <Button
            variant={'outline'}
            onClick={togglePdf}
            className={`h-10 w-10 ${isPdfOpen && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'}`}
          >
            <ReaderIcon width={18} height={18} />
          </Button>
          {userRole && postsigAdminRoles.includes(userRole) && (
            <Link
              href={`/ext/contracts/${contract.id}/`}
              target="_blank"
              className="flex items-center gap-2 rounded-sm border border-black border-opacity-50 bg-yellow px-5 py-2"
            >
              Extract
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-10 w-10 items-center justify-center rounded-sm outline-none hover:bg-gray-700/10">
              <DotsHorizontalIcon width={20} height={20} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 font-label">
              <DropdownMenuItem
                asChild
                disabled={
                  isExportDisabled || !documentsWithSignedUrls?.[0]?.signedUrl
                }
              >
                <a
                  href={documentsWithSignedUrls?.[0]?.signedUrl || '#'}
                  className="block w-full px-4 py-2 font-label text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                  download={
                    documentsWithSignedUrls?.[0]?.file_path?.split('/').pop() ||
                    contract?.vendors?.name?.replace(/[^a-zA-Z0-9]/g, '_') +
                      '.pdf'
                  }
                >
                  Download PDF
                </a>
              </DropdownMenuItem>
              {canExportCsv && (
                <DropdownMenuItem
                  asChild
                  disabled={isExportDisabled}
                  className={
                    isExportDisabled ? 'cursor-not-allowed opacity-50' : ''
                  }
                >
                  <a
                    href="#"
                    className="block w-full px-4 py-2 font-label text-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      if (isExportDisabled) return;
                      exportCSV({
                        id: contract.id,
                        fiscalYearStartMonth: userMetadata?.organizationFY || 1,
                      })
                        .then((blob: any) => {
                          if (blob) {
                            handleDownload(blob, `contract-${contract.id}.csv`);
                          } else {
                            console.error('Export failed: No blob returned');
                          }
                        })
                        .catch((err) => console.error('Export failed:', err));
                    }}
                  >
                    Export as CSV
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="w-full"
                disabled={contract.status !== 'active'}
              >
                <CircleBackslashIcon className="h-4 w-4" />

                <span className="flex w-full flex-row justify-between pt-[1px]">
                  <div>Will Not Renew</div>
                  <RenewStatusForm contract={contract} />
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  updateContractStatus(
                    contract.id,
                    'inactive',
                    contract.vendors.name,
                    contract.term_end_date?.[0]?.date,
                    contract.status,
                  )
                }
                disabled={isLoading}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <g clipPath="url(#clip0_4467_5596)">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10.875 1.125H1.125V2.7H10.875V1.125ZM0 0V3.75H12V0H0Z"
                      fill="currentColor"
                    />
                    <rect
                      x="3.75"
                      y="5.475"
                      width="4.35"
                      height="1.125"
                      fill="currentColor"
                    />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M0.525 3.75H1.65V10.875H10.35V3.75H11.475V12H0.525V3.75Z"
                      fill="currentColor"
                    />
                  </g>
                </svg>
                <span className="pt-[1px]">
                  {isLoading ? 'Archiving...' : 'Archive'}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="">
        <Tab
          tabs={tabs}
          defaultTab={initialView}
          onViewChange={setCurrentView}
          footerComponent={
            userMetadata && (
              <Comments contractId={contract.id} user={userMetadata} />
            )
          }
          showFooterOnTab="overview"
          useUrlState={true}
          urlParamName="view"
        />
      </div>
    </div>
  );
});
