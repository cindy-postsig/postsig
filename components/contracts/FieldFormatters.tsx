import React from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * Shared utility function to format JSX fields for contract display
 * Used in both ConfigurableDetails and AmendmentAccordion components
 */
export function formatJsxField(
  fieldKey: string,
  contract: any,
): React.ReactNode {
  if (fieldKey === 'number_of_users') {
    return contract.vendor_products_users?.length > 0 ? (
      <div className="flex flex-col items-start gap-2 py-1">
        {contract.vendor_products_users.map((vpu: any, idx: number) => (
          <Badge key={idx} variant={'outline'} className="font-sans text-sm">
            {vpu.number_of_users} Users
            <span className="ml-2 border-l pl-2">
              {vpu.vendor_products ? vpu.vendor_products.name : 'All Products'}
            </span>
          </Badge>
        ))}
      </div>
    ) : contract.number_of_users ? (
      <div className="vpu-item mb-2">{contract.number_of_users}</div>
    ) : null;
  }

  if (fieldKey === 'data_delivery_types') {
    // Collect all delivery methods from both sources
    const allDeliveryMethods: string[] = [];

    // Get delivery methods from vendor_products (product-specific)
    if (contract.vendor_products_details?.length > 0) {
      contract.vendor_products_details.forEach((detail: any) => {
        if (detail.vendor_products?.data_delivery_types?.name) {
          const methodName = detail.vendor_products.data_delivery_types.name;
          if (!allDeliveryMethods.includes(methodName)) {
            allDeliveryMethods.push(methodName);
          }
        }
      });
    }

    // Also get delivery methods from contract-level data
    const contractDeliveryTypes = contract.contract_data_delivery_types;
    if (contractDeliveryTypes?.length > 0) {
      contractDeliveryTypes.forEach((item: any) => {
        if (item.data_delivery_types?.name) {
          const methodName = item.data_delivery_types.name;
          if (!allDeliveryMethods.includes(methodName)) {
            allDeliveryMethods.push(methodName);
          }
        }
      });
    }

    // Return aggregated delivery methods if any exist
    return allDeliveryMethods.length > 0 ? (
      <div className="flex flex-wrap gap-1 pb-1">
        {allDeliveryMethods.map((methodName: string, idx: number) => (
          <Badge key={idx} variant={'outline'} className="whitespace-nowrap">
            {methodName}
          </Badge>
        ))}
      </div>
    ) : null;
  }

  return null;
}
