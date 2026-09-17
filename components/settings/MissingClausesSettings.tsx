'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '../ui/badge';
import { useAbility } from '@/components/providers/AbilityProvider';

// Clause options organized by categories with friendly descriptions
const CLAUSE_CATEGORIES = [
  {
    category: 'Key Terms',
    clauses: [
      {
        id: 'term_start_date',
        label: 'Start Date',
        description: 'The date when the contract or subscription period begins',
      },
      {
        id: 'term_end_date',
        label: 'End Date',
        description: 'The date when the contract or subscription period ends',
      },
      {
        id: 'cancel_by_date',
        label: 'Cancel By Date',
        description:
          'Deadline by which you must notify vendor to cancel contract',
      },
      {
        id: 'subscription_term',
        label: 'Subscription Term',
        description: 'Duration of the contract or subscription',
      },
      {
        id: 'renewal_type',
        label: 'Renewal Type',
        description:
          'Whether the contract renews automatically or requires action',
      },
      {
        id: 'execution_date',
        label: 'Execution Date',
        description: 'The date when the contract was officially executed',
      },
    ],
  },
  {
    category: 'Payment Details',
    clauses: [
      {
        id: 'billing_frequency',
        label: 'Billing Frequency',
        description:
          "How often you'll be billed (monthly, quarterly, annually)",
      },
      {
        id: 'currency',
        label: 'Currency',
        description:
          'The currency used for all monetary values in the contract',
      },
      {
        id: 'payment_terms',
        label: 'Payment Terms',
        description: 'Payment schedules, penalties, and methods of payment',
      },
      {
        id: 'renewal_period',
        label: 'Renewal Period',
        description:
          'The period for which the contract is renewed after expiration',
      },
      {
        id: 'cancellation_process',
        label: 'Cancellation Process',
        description: 'Steps required to cancel the contract properly',
      },
    ],
  },
  {
    category: 'Permissions & Scope of Use',
    clauses: [
      {
        id: 'end_users',
        label: 'End Users',
        description: 'Defines who the end users of the product can be',
      },
      {
        id: 'ai_training_restrictions',
        label: 'AI Training Restrictions',
        description: 'Limitations on using vendor data for training AI models',
      },
      {
        id: 'market_data_types',
        label: 'Market Data Types',
        description: 'Types of market data covered by the agreement',
      },
      {
        id: 'internal_external_users',
        label: 'User Type',
        description:
          'Defines who can access the product (employees, contractors, clients)',
      },
      {
        id: 'exclusivity_terms',
        label: 'Exclusivity Terms',
        description: 'Whether the agreement is exclusive and its terms',
      },
      {
        id: 'distribution_rights',
        label: 'Distribution Rights',
        description:
          'Defines your rights as they relate to distribution of the product or data',
      },
      {
        id: 'geo_restrictions',
        label: 'Geographic Restrictions',
        description:
          'Specifies regions where the product can or cannot be used',
      },
      {
        id: 'derivative_works',
        label: 'Derivative Works',
        description:
          'Outlines rights to modify or create works based on the product',
      },
      {
        id: 'activities',
        label: 'Allowed Activities',
        description:
          'Specifies what users are permitted to do with the product',
      },
    ],
  },
  {
    category: 'Additional Terms',
    clauses: [
      {
        id: 'marketing_rights',
        label: 'Marketing Rights',
        description:
          'Specifies if/how vendor can use your name in their marketing',
      },
      {
        id: 'suspension_of_service',
        label: 'Suspension of Service',
        description: 'Outlines conditions under which service may be suspended',
      },
      {
        id: 'data_disposal_tnc',
        label: 'Data Disposal Terms & Conditions',
        description:
          'Explains how your data will be handled when contract ends',
      },
      {
        id: 'audit_requirements',
        label: 'Audit Requirements',
        description:
          "Details vendor's rights to audit your usage of their product",
      },
      {
        id: 'service_level_agreements',
        label: 'Service Level Agreements',
        description:
          'Defines performance guarantees and remedies for service failures',
      },
      {
        id: 'cost_mitigation',
        label: 'Incident Related Cost Mitigation',
        description: 'Measures to mitigate costs related to incidents',
      },
      {
        id: 'arbitration_and_conflict_resolution',
        label: 'Arbitration and Conflict Resolution',
        description: 'Processes for resolving disputes between parties',
      },
      {
        id: 'security_awareness',
        label: 'Security Awareness and Training',
        description:
          'Requirements for security awareness and training mechanisms',
      },
    ],
  },
  {
    category: 'NDA Terms',
    clauses: [
      {
        id: 'purpose',
        label: 'Purpose',
        description:
          'The relationship between the parties and what the contract is meant to oblige the counterparties to during the course of the relationship',
      },
      {
        id: 'confidential_information',
        label: 'Confidential Information',
        description:
          'The general and specific nature of the information to be shared between the counterparties to the agreement',
      },
      {
        id: 'non_use_non_disclosure',
        label: 'Non-use Non-disclosure',
        description:
          'How the receiving party is obliged not to disclose or use confidential information for anything other than the use cases prescribed in the NDA',
      },
      {
        id: 'maintenance_of_confidentiality',
        label: 'Maintenance of Confidentiality',
        description:
          "The obligations of the counterparties in regard to maintaining discretion while dealing with one another's confidential data and information",
      },
      {
        id: 'term_termination',
        label: 'Term & Termination',
        description:
          'The length of the agreement and any means by which the agreement can be effectively ended by either party',
      },
      {
        id: 'no_obligation',
        label: 'No Obligation',
        description:
          'Specifics around what the agreement does not oblige either party to do during the course of the agreements',
      },
      {
        id: 'no_license_ownership',
        label: 'No License/Ownership',
        description:
          'Details around persistence of property rights with regard to the confidential information that might be exchanged during the course of the agreement',
      },
      {
        id: 'remedies',
        label: 'Remedies',
        description:
          'The entitlements of either party should confidentiality be breached during the course of the agreement',
      },
      {
        id: 'permitted_use',
        label: 'Permitted Use',
        description:
          'What either party can and cannot do with regard to the confidential information',
      },
      {
        id: 'no_warranty',
        label: 'No Warranty',
        description:
          'The warranties either party makes, or does not make, regarding the nature of the confidential information that may be shared',
      },
      {
        id: 'miscellaneous',
        label: 'Miscellaneous',
        description:
          "Any detail with regard to the agreement that isn't effectively covered in other sections of the contract",
      },
      {
        id: 'exclusions_exceptions',
        label: 'Exclusions/Exceptions',
        description:
          'Carve-outs or information expressly not covered by the agreement',
      },
      {
        id: 'disclosure_required_by_law',
        label: 'Disclosure Required by Law',
        description:
          'What transpires when either party is legally compelled to disclose anything related to, and including, the confidential information',
      },
      {
        id: 'non_solicitation_of_employees',
        label: 'Non-solicitation of Employees',
        description:
          "The extent to which the counterparties are obliged not to employ or retain one another's employees",
      },
      {
        id: 'mutual_nda',
        label: 'Mutual NDA',
        description: 'Identifies the NDA as being unilateral or bilateral',
      },
    ],
  },
];

// Flatten the categories for easier processing
const CLAUSE_OPTIONS = CLAUSE_CATEGORIES.flatMap((category) =>
  category.clauses.map((clause) => ({
    ...clause,
    category: category.category,
  })),
);

interface MissingClausesSettingsProps {
  user: any;
  compact?: boolean; // Compact mode for displaying on report page
  onSettingsSaved?: () => void; // Callback when settings are saved (for refreshing report)
  showTitle?: boolean; // Whether to show the title and description
  className?: string; // Additional CSS classes
  refreshRoute?: string; // If "true", refresh the route after saving
}

export default function MissingClausesSettings({
  user,
  compact = false,
  onSettingsSaved,
  showTitle = true,
  className = '',
  refreshRoute = '',
}: MissingClausesSettingsProps) {
  const supabase = createClient();
  const ability = useAbility();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [selectedClauses, setSelectedClauses] = useState<string[]>([]);
  const router = useRouter();

  const canUpdate = ability.can('update', 'Application');

  const getOrganizationSettings = useCallback(async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('missing_clauses_settings, missing_clauses_confirmed')
        .eq('id', user.organizationId)
        .single();
      if (error) throw error;

      const orgData = data as any;
      if (
        orgData &&
        orgData.missing_clauses_settings &&
        Array.isArray(orgData.missing_clauses_settings)
      ) {
        // Filter to ensure all values are strings
        const stringSettings = (orgData.missing_clauses_settings as any[])
          .filter((item: any) => item !== null && item !== undefined)
          .map((item: any) => String(item));
        setSelectedClauses(stringSettings);
      } else {
        // This shouldn't happen with the migration, but set empty array as fallback
        setSelectedClauses([]);
      }
    } catch (error: any) {
      toast(
        generateToastError(
          error.message,
          'Error loading missing clauses settings!',
        ),
      );
      // Set empty array as fallback
      setSelectedClauses([]);
    } finally {
      setLoading(false);
    }
  }, [user, supabase, router, toast]);

  useEffect(() => {
    getOrganizationSettings();
  }, [getOrganizationSettings]);

  const updateMissingClausesSettings = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      setLoading(true);

      // Ensure all clauses are strings before saving
      const cleanedClauses = selectedClauses
        .filter((clause) => typeof clause === 'string')
        .map((clause) => String(clause));

      // First, check if the missing_clauses_confirmed flag is false
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('missing_clauses_confirmed')
        .eq('id', user.organizationId)
        .single();

      if (orgError) throw orgError;

      // Prepare update payload - always update the settings
      const updatePayload: {
        missing_clauses_settings: string[];
        missing_clauses_confirmed?: boolean;
      } = {
        missing_clauses_settings: cleanedClauses,
      };

      // If this is the first time saving (confirmed is false), set it to true
      if (orgData && (orgData as any).missing_clauses_confirmed === false) {
        updatePayload.missing_clauses_confirmed = true;
      }

      // Update the organization with the settings and possibly the confirmed flag
      const { error } = await (supabase.from('organizations').update as any)(
        updatePayload,
      ).eq('id', user.organizationId);

      if (error) throw error;

      toast({
        description: 'Missing clauses settings updated successfully',
        variant: 'default',
      });

      // Refresh route if requested, or call the provided callback
      if (refreshRoute === 'true') {
        router.refresh();
      } else if (onSettingsSaved) {
        onSettingsSaved();
      }
    } catch (error: any) {
      console.error('Error updating missing clauses settings:', error);
      toast(
        generateToastError(
          error.message,
          'Error updating missing clauses settings!',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleClause = (clauseId: string) => {
    setSelectedClauses((prev) => {
      if (prev.includes(clauseId)) {
        return prev.filter((id) => id !== clauseId);
      } else {
        return [...prev, clauseId];
      }
    });
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {compact ? (
        // Compact tabs view for report page - organized by category with adaptive height
        <Tabs
          defaultValue={CLAUSE_CATEGORIES[0].category
            .toLowerCase()
            .replace(/\s+/g, '-')}
          className="max-h-fit"
          size="sm"
        >
          <TabsList className="mb-4 grid w-full grid-cols-5 border-b">
            {CLAUSE_CATEGORIES.map((category) => (
              <TabsTrigger
                key={category.category}
                value={category.category.toLowerCase().replace(/\s+/g, '-')}
                className="px-2 py-1 text-xs"
              >
                {category.category}
              </TabsTrigger>
            ))}
          </TabsList>

          {CLAUSE_CATEGORIES.map((category) => (
            <TabsContent
              key={category.category}
              value={category.category.toLowerCase().replace(/\s+/g, '-')}
              className="min-h-[220px]"
            >
              <div className="grid grid-cols-3 gap-2">
                {category.clauses.map((clause) => (
                  <div
                    key={clause.id}
                    className={`font-medium block rounded-sm border p-3 ${
                      loading || !canUpdate
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:bg-hover'
                    }`}
                  >
                    <label
                      htmlFor={`${clause.id}-compact`}
                      className={`flex gap-2 ${
                        loading || !canUpdate
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer'
                      }`}
                    >
                      <Checkbox
                        id={`${clause.id}-compact`}
                        checked={selectedClauses.includes(clause.id)}
                        onCheckedChange={() => toggleClause(clause.id)}
                        disabled={loading || !canUpdate}
                      />

                      <span className="text-[0.8rem]">{clause.label}</span>
                    </label>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        // Tabbed view for settings page with categories
        <Tabs
          defaultValue={CLAUSE_CATEGORIES[0].category
            .toLowerCase()
            .replace(/\s+/g, '-')}
          size={'md'}
        >
          <TabsList className="mb-6 w-full grid-cols-5 justify-start border-b">
            {CLAUSE_CATEGORIES.map((category) => {
              // Count total clauses in this category
              const totalCount = category.clauses.length;

              // Count selected clauses in this category
              const selectedCount = category.clauses.filter((clause) =>
                selectedClauses.includes(clause.id),
              ).length;

              return (
                <TabsTrigger
                  key={category.category}
                  value={category.category.toLowerCase().replace(/\s+/g, '-')}
                  className="data-[state=active]:bg-transparent"
                >
                  {category.category}
                  <Badge
                    className="ml-2 px-2 text-[0.65rem]"
                    variant={'secondary'}
                  >
                    {selectedCount}/{totalCount}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Dynamic height container for all tab content */}
          <div>
            {CLAUSE_CATEGORIES.map((category) => (
              <TabsContent
                key={category.category}
                value={category.category.toLowerCase().replace(/\s+/g, '-')}
                className="pb-2 pr-2"
              >
                <ScrollArea className="">
                  <div className="grid gap-3 pr-4 sm:grid-cols-2 md:grid-cols-3">
                    {category.clauses.map((clause) => (
                      <label
                        key={clause.id}
                        htmlFor={`${clause.id}-tab`}
                        className={`font-medium block rounded-sm border p-3 text-[0.85rem] ${
                          loading || !canUpdate
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer hover:bg-hover'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id={`${clause.id}-tab`}
                            checked={selectedClauses.includes(clause.id)}
                            onCheckedChange={() => toggleClause(clause.id)}
                            disabled={loading || !canUpdate}
                            className="mt-0.5"
                          />
                          <div>
                            {clause.label}
                            <p className="font-light text-[.8rem] leading-tight text-muted-foreground">
                              {clause.description}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      )}

      <Button
        onClick={updateMissingClausesSettings}
        disabled={loading || !canUpdate}
        className="mt-8"
        size={compact ? 'sm' : 'default'}
      >
        {compact ? 'Save Changes' : 'Save Settings'}
      </Button>
    </div>
  );
}
