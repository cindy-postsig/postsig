'use server';

import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';

/**
 * Searches for asset classes by name within an organization
 * @param name The name of the asset class to search for
 * @returns The found asset class or null if not found
 */
export async function searchAssetClasses(name: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('asset_classes')
      .select('*')
      .ilike('name', `%${name}%`);

    if (error) {
      logger.error({ error }, 'Error searching asset classes');
      return null;
    }

    if (data.length > 0) {
      return data[0];
    }
    return null;
  } catch (error) {
    console.error('Exception searching asset classes:', error);
    return null;
  }
}

/**
 * Searches for sub asset classes by name within an organization
 * @param name The name of the sub asset class to search for
 * @returns The found sub asset class or null if not found
 */
export async function searchSubAssetClasses(name: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('sub_asset_classes')
      .select('*')
      .ilike('name', `${name}`);

    if (error) {
      console.error('Error searching sub asset classes:', error);
      return null;
    }

    if (data.length > 0) {
      return data[0];
    }
    return null;
  } catch (error) {
    console.error('Exception searching sub asset classes:', error);
    return null;
  }
}

/**
 * Saves asset class information for a contract
 * @param contractId The ID of the contract
 * @param assetClassId The ID of the asset class
 * @param subAssetClassId The ID of the sub-asset class
 * @returns The result of the operation
 */
export async function saveAssetClass(
  contractId: number,
  assetClassId: number,
  subAssetClassId?: number,
  isParentTag?: boolean,
) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('contract_asset_classes')
      .insert({
        contract_id: contractId,
        asset_class_id: assetClassId,
        sub_asset_class_id: subAssetClassId,
        is_parent_tag: isParentTag,
      } as any)
      .select()
      .maybeSingle();

    if (error) {
      logger.error({ error }, 'Error saving asset class');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception saving asset class:', error);
    return null;
  }
}

/**
 * Removes all asset class associations for a contract
 * @param contractId The ID of the contract
 * @returns The result of the operation
 */
export async function removeAssetClasses(contractId: number) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('contract_asset_classes')
      .delete()
      .eq('contract_id', contractId);

    if (error) {
      console.error('Error removing asset classes:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception removing asset classes:', error);
    return null;
  }
}

/**
 * Gets all data delivery types
 * @returns Array of all data delivery types or empty array if error
 */
export async function getAllDataDeliveryTypes(): Promise<
  Array<{ id: number; name: string }>
> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('data_delivery_types')
      .select('id, name')
      .not('name', 'is', null)
      .order('name');

    if (error) {
      logger.error({ error }, 'Error fetching data delivery types');
      return [];
    }

    // Filter out any null names and cast to the correct type
    return (data || []).filter(
      (item): item is { id: number; name: string } => item.name !== null,
    );
  } catch (error) {
    logger.error({ error }, 'Exception fetching data delivery types');
    return [];
  }
}

/**
 * Searches for data delivery types by name
 * @param name The name of the data delivery type to search for
 * @returns The found data delivery type or null if not found
 */
export async function searchDataDeliveryTypes(name: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('data_delivery_types')
      .select('*')
      .ilike('name', `%${name}%`);

    if (error) {
      console.error('Error searching data delivery types:', error);
      return null;
    }

    if (data.length > 0) {
      return data[0];
    }
    return null;
  } catch (error) {
    console.error('Exception searching data delivery types:', error);
    return null;
  }
}

/**
 * Creates a new data delivery type
 * @param name The name of the data delivery type
 * @returns The created data delivery type or null if error
 */
export async function createDataDeliveryType(name: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('data_delivery_types')
      .insert({ name } as any)
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Error creating data delivery type');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception creating data delivery type:', error);
    return null;
  }
}

/**
 * Saves data delivery type association for a contract
 * @param contractId The ID of the contract
 * @param dataDeliveryTypeId The ID of the data delivery type
 * @returns The result of the operation
 */
export async function saveContractDataDeliveryType(
  contractId: number,
  dataDeliveryTypeId: number,
) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('contract_data_delivery_types')
      .insert({
        contract_id: contractId,
        data_delivery_type_id: dataDeliveryTypeId,
      } as any)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error saving contract data delivery type:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception saving contract data delivery type:', error);
    return null;
  }
}

/**
 * Removes all data delivery type associations for a contract
 * @param contractId The ID of the contract
 * @returns The result of the operation
 */
export async function removeContractDataDeliveryTypes(contractId: number) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('contract_data_delivery_types')
      .delete()
      .eq('contract_id', contractId);

    if (error) {
      console.error('Error removing contract data delivery types:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception removing contract data delivery types:', error);
    return null;
  }
}
