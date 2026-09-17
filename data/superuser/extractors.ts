import { FindVendorsParams } from '@/constants/types';
import { createClient } from '@/utils/supabase/service_server';
import _ from 'lodash';
import {
  DeleteVendorProductsDetailsForExtractorsParams,
  FindVendorProductsDetailsForExtractorsParams,
  LinkRelatedContractsForExtractorsParams,
  UpdateContractForExtractorsParams,
  UpdateVendorDataForExtractors,
  InsertVendorProductForExtractorsParams,
  FindVendorProductsForExtractorsParams,
} from '@/constants/types';

export async function findVendorsByUsersForExtractors({
  column,
  value,
  userId,
}: FindVendorsParams) {
  const supabase = createClient();
  const query = supabase
    .from('vendors')
    .select('id,name')
    .eq('user_id', userId);
  if (column && value) {
    query.ilike(column, value);
  }
  let { data, error } = await query;
  return { data, error };
}

export async function deleteVendorProductsDetailsDataForExtractors({
  user_id,
  query,
}: DeleteVendorProductsDetailsForExtractorsParams) {
  const supabase = createClient();
  const sqlQuery = supabase
    .from('vendor_products_details')
    .delete()
    .eq('user_id', user_id);
  if (query) {
    _.forIn(query, (value, key) => {
      sqlQuery.eq(key, value);
    });
  }
  const { data, error } = await sqlQuery;
  if (error) throw error;
  return data;
}

export async function findVendorProductsDetailsDataForExtractors({
  user_id,
  query,
}: FindVendorProductsDetailsForExtractorsParams) {
  const supabase = createClient();
  const vendorQuery = supabase
    .from('vendor_products_details')
    .select('*')
    .eq('user_id', user_id);
  if (query) {
    _.forIn(query, (value, key) => {
      vendorQuery.eq(key, value);
    });
  }
  const { data, error } = await vendorQuery;
  if (error) throw error;
  return data;
}

export async function linkRelatedContractsDataForExtractors({
  userId,
  contractId,
}: LinkRelatedContractsForExtractorsParams) {
  const supabase = createClient();
  const allProductsFromContract = await supabase
    .from('vendor_products_details')
    .select('product_id')
    .eq('contract_id', contractId)
    .eq('user_id', userId);
  if (!allProductsFromContract.data) return;
  const products = allProductsFromContract.data.map((product: any) => {
    return product.product_id;
  });
  const otherContractsWithSameProducts = await supabase
    .from('vendor_products_details')
    .select('contract_id')
    .in('product_id', products)
    .eq('user_id', userId);
  if (!otherContractsWithSameProducts.data) return;
  const contractIds = otherContractsWithSameProducts.data.map(
    (contract: any) => {
      return contract.contract_id;
    },
  );
  const nonMsaContracts = await supabase
    .from('contracts')
    .select<string, { id: number }>('id')
    .in('id', contractIds)
    .neq('type_id', 1)
    .eq('user_id', userId);
  if (!nonMsaContracts.data) return;
  const contractIdToLink = nonMsaContracts.data[0]?.id;
  if (!contractIdToLink) return;
  const { data, error } = await supabase
    .from('contracts')
    // @ts-ignore - Supabase type issue with update operation
    .update({
      related_contract_id: contractIdToLink,
    } as any)
    .eq('id', contractId)
    .eq('user_id', userId)
    .select();
  if (error) throw error;
  return data;
}

export async function insertVendorProductDetailsDataForExtractors(data: any) {
  const supabase = createClient();
  const { data: insertData, error } = await supabase
    .from('vendor_products_details')
    .insert(data as any)
    .select();
  if (error) throw error;
  return insertData;
}

export async function updateVendorProductDetailsDataForExtractors(data: any) {
  const supabase = createClient();
  const { data: insertData, error } = await supabase
    .from('vendor_products_details')
    // @ts-ignore - Supabase type issue with update operation
    .update(data as any)
    .eq('id', data.id)
    .select();
  if (error) throw error;
  return insertData;
}

export async function updateContractDataForExtractors({
  contractId,
  data,
}: UpdateContractForExtractorsParams) {
  const supabase = createClient();
  const { data: updateData, error } = await supabase
    .from('contracts')
    // @ts-ignore - Supabase type issue with update operation
    .update(data)
    .eq('id', contractId)
    .select();
  if (error) {
    console.error('Supabase Error:', error);
    throw new Error(error.message);
  }
  return { data: updateData, error };
}

export async function updateVendorDataForExtractors({
  data,
  id,
  user_id,
}: UpdateVendorDataForExtractors) {
  const supabase = createClient();
  if (!data.address && !data.name) return;
  data.user_id = user_id;
  try {
    if (!id) {
      const { data: insertData, error: insertError } = await supabase
        .from('vendors')
        .insert(data)
        .select();
      if (insertError) throw insertError;
      return insertData;
    }
    const existingVendors = await findVendorsByUsersForExtractors({
      column: 'id',
      value: id,
      userId: user_id,
    });
    if (existingVendors.data && existingVendors.data.length > 0) {
      const { data: updateData, error } = await supabase
        .from('vendors')
        .upsert(data)
        .select();
      if (error) throw error;
      return updateData;
    }
  } catch (error: any) {
    console.error('Error updating vendor:', error);
    throw new Error(error.message);
  }
}

export async function insertVendorProductDataForExtractors({
  data,
}: InsertVendorProductForExtractorsParams) {
  const supabase = createClient();
  const { data: insertData, error } = await supabase
    .from('vendor_products')
    .insert(data)
    .select();
  if (error) throw error;
  return insertData;
}

export async function findVendorProductsDataForExtractors({
  vendor_id,
  user_id,
}: FindVendorProductsForExtractorsParams) {
  const supabase = createClient();
  const vendorQuery = supabase
    .from('vendor_products')
    .select('*')
    .eq('vendor_id', vendor_id);
  vendorQuery.eq('user_id', user_id);
  const { data, error } = await vendorQuery;
  if (error) throw error;
  return data;
}
