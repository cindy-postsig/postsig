// Script to migrate products from contracts->products_fees to vendor_products and vendor_products_details

const { createClient } = require('@supabase/supabase-js');
const _ = require('lodash');

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

async function fetchUsers(supabaseClient) {
  const { data: users, error: usersError } = await supabaseClient
    .from('users')
    .select('*');

  if (usersError) {
    console.error('Error fetching users:', usersError.message);
    throw usersError;
  }

  return users;
}

async function fetchContracts(supabaseClient, userId) {
  const { data: contracts, error: contractsError } = await supabaseClient
    .from('contracts')
    .select('*')
    .eq('user_id', userId);

  if (contractsError) {
    console.error('Error fetching contracts:', contractsError.message);
    throw contractsError;
  }

  return contracts;
}

async function deleteVendorProducts(supabaseClient, userId) {
  const { data: vendorProducts, error: vendorProductsError } =
    await supabaseClient.from('vendor_products').delete().eq('user_id', userId);

  if (vendorProductsError) {
    console.error(
      'Error deleting vendor products:',
      vendorProductsError.message,
    );
    throw vendorProductsError;
  }

  return vendorProducts;
}

async function deleteVendorProductsDetails(supabaseClient, userId) {
  const { data: vendorProductsDetails, error: vendorProductsDetailsError } =
    await supabaseClient
      .from('vendor_products_details')
      .delete()
      .eq('user_id', userId);

  if (vendorProductsDetailsError) {
    console.error(
      'Error deleting vendor products details:',
      vendorProductsDetailsError.message,
    );
    throw vendorProductsDetailsError;
  }

  return vendorProductsDetails;
}

async function insertVendorProducts(supabaseClient, product, contract, userId) {
  const { data: insertProductData, vpError } = await supabaseClient
    .from('vendor_products')
    .insert({
      name: product.name,
      vendor_id: contract.vendor_id,
      user_id: userId,
    })
    .select();

  if (vpError) {
    console.error(vpError.message);
    throw vpError;
  }

  return insertProductData[0];
}

async function insertVendorProductsDetails(
  supabaseClient,
  product,
  insertProductData,
  contract,
  userId,
) {
  const { data: insertProductDetailData, pdError } = await supabaseClient
    .from('vendor_products_details')
    .insert({
      product_id: insertProductData.id,
      contract_id: contract.id,
      year: product.year,
      fees: product.fees,
      user_id: userId,
    })
    .select();

  if (pdError) {
    console.error(pdError.message);
    throw pdError;
  }

  return insertProductDetailData;
}

async function main() {
  try {
    const supabaseClient = createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    const users = await fetchUsers(supabaseClient);
    for (const user of users) {
      console.log('user:', JSON.stringify(user, null, 2));
      await deleteVendorProducts(supabaseClient, user.id);
      await deleteVendorProductsDetails(supabaseClient, user.id);
      const contracts = await fetchContracts(supabaseClient, user.id);

      for (const contract of contracts) {
        const products = _.uniqBy(contract.products_fees, 'name');
        for (const product of products) {
          const insertProductData = await insertVendorProducts(
            supabaseClient,
            product,
            contract,
            user.id,
          );

          await insertVendorProductsDetails(
            supabaseClient,
            product,
            insertProductData,
            contract,
            user.id,
          );
        }
      }
    }
    console.log('Migration complete');
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
