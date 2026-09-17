import { Database } from '@/database.types';

type Contract = Database['public']['Tables']['contracts']['Row'] & {
  vendor_products_details?: Array<{
    vendor_products: { id: number; name: string };
  }>;
};

/**
 * Calculates the DORA score for a contract
 * @param contract The contract object from Supabase (with vendor_products_details already joined)
 * @returns A score from 0-9 and details about which categories are satisfied
 */
export const calculateDoraScore = (
  contract: Contract,
): {
  score: number;
  details: Record<string, boolean>;
} => {
  const hasProducts =
    contract.vendor_products_details &&
    contract.vendor_products_details.length > 0;

  const doraCategories = {
    // 1. Product Description
    productDescription: !!(
      hasProducts ||
      contract.end_users ||
      contract.market_data_types ||
      contract.internal_external_users ||
      contract.exclusivity_terms ||
      contract.activities
    ),

    // 2. Vendor Location
    vendorLocation: !!contract.vendor_location,

    // 3. Data Integrity
    dataIntegrity: !!(
      contract.distribution_rights ||
      contract.geo_restrictions ||
      contract.derivative_works
    ),

    // 4. Data Recovery
    dataRecovery: !!(
      contract.data_disposal_tnc ||
      contract.audit_requirements ||
      contract.suspension_of_service ||
      contract.cancellation_process
    ),

    // 5. Service Level Agreement
    serviceLevelAgreement: !!contract.service_level_agreements,

    // 6. Incident Related Cost Mitigation
    costMitigation: !!contract.cost_mitigation,

    // 7. Arbitration and Conflict Resolution
    arbitrationAndConflictResolution:
      !!contract.arbitration_and_conflict_resolution,

    // 8. Timely Termination
    timelyTermination: !!(contract.cancel_by_date || contract.cancel_date),

    // 9. Security Awareness and Training
    securityAwareness: !!contract.security_awareness,
  };

  const score = Object.values(doraCategories).filter(Boolean).length;

  return {
    score,
    details: doraCategories,
  };
};
