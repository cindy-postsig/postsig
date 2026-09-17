// Script to transfer user data such as contracts, contract_docs, vendors & storage
// Environment variables to use in script:
//   OLD_PROJECT_URL
//   OLD_PROJECT_SERVICE_KEY
//   NEW_PROJECT_URL
//   NEW_PROJECT_SERVICE_KEY
//   OLD_USER_ID
//   NEW_USER_ID

const { createClient } = require('@supabase/supabase-js');
const _ = require('lodash');

const {
  OLD_PROJECT_URL,
  OLD_PROJECT_SERVICE_KEY,
  NEW_PROJECT_URL,
  NEW_PROJECT_SERVICE_KEY,
  OLD_USER_ID,
  NEW_USER_ID,
} = process.env;

async function getVendors(supabaseClient, userId) {
  const { data: vendors, error: vendorsError } = await supabaseClient
    .from('vendors')
    .select('*')
    .in('user_id', [userId]);

  if (vendorsError) {
    console.error('Error fetching vendors:', vendorsError.message);
    throw vendorsError;
  }

  return vendors;
}

async function getContracts(supabaseClient, userId) {
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

async function getContractDocs(supabaseClient, userId) {
  const { data: contractDocs, error: contractDocsError } = await supabaseClient
    .from('contract_docs')
    .select('*')
    .eq('user_id', userId);

  if (contractDocsError) {
    console.error('Error fetching contract docs:', contractDocsError.message);
    throw contractDocsError;
  }

  return contractDocs;
}

async function transferUserFiles(
  oldSupabaseRestClient,
  oldSupabaseClient,
  newSupabaseClient,
) {
  // make sure you update max_rows in postgrest settings if you have a lot of objects
  // or paginate here
  const { data: oldObjects, error } = await oldSupabaseRestClient
    .from('objects')
    .select()
    .eq('owner_id', OLD_USER_ID);
  if (error) {
    console.log('error getting objects from old bucket');
    throw error;
  }

  for (const objectData of oldObjects) {
    console.log(`moving ${objectData.id}`);
    try {
      const { data, error: downloadObjectError } =
        await oldSupabaseClient.storage
          .from(objectData.bucket_id)
          .download(objectData.name);
      if (downloadObjectError) {
        throw downloadObjectError;
      }

      const newName = objectData.name.replace(OLD_USER_ID, NEW_USER_ID);
      const { _, error: uploadObjectError } = await newSupabaseClient.storage
        .from(objectData.bucket_id)
        .upload(newName, data, {
          upsert: true,
          contentType: objectData.metadata.mimetype,
          cacheControl: objectData.metadata.cacheControl,
        });
      if (uploadObjectError) {
        throw uploadObjectError;
      }
    } catch (err) {
      console.log('error moving ', objectData);
      console.log(err);
    }
  }
}

async function insertVendors(supabaseClient, vendors, userId) {
  _.each(vendors, (vendor) => {
    vendor.userId = userId;
  });
  const data = [];
  for (const vendor of vendors) {
    const { data: insertVendorData, vendorError } = await supabaseClient
      .from('vendors')
      .insert({
        name: vendor.name,
        user_id: userId,
      })
      .select();

    if (vendorError) {
      console.error(vendorError.message);
      throw vendorError;
    }
    data.push(insertVendorData[0]);
  }
  return data;
}

async function insertContract(supabaseClient, contract, userId, vendors) {
  contract.user_id = userId;
  contract.vendor_id = _.find(vendors, {
    id: contract.vendor_id,
  }).newVendorId;
  const { data: insertContractData, contractError } = await supabaseClient
    .from('contracts')
    .insert([_.omit(contract, ['id'])])
    .select();
  if (contractError) {
    console.error(contractError.message);
    throw contractError;
  }
  return insertContractData[0];
}

async function insertContractDoc(
  supabaseClient,
  userId,
  contractId,
  file_path,
) {
  const contractDoc = {
    contract_id: contractId,
    file_path,
    user_id: userId,
  };
  contractDoc.user_id = userId;
  contractDoc.file_path = contractDoc.file_path.replace(OLD_USER_ID, userId);
  const { error } = await supabaseClient
    .from('contract_docs')
    .insert([contractDoc]);

  if (error) {
    console.error('Error inserting contract doc:', error.message);
  } else {
    console.log('Contract doc inserted');
  }
}

function matchVendorIds(vendors, newVendorData) {
  _.each(vendors, (vendor) => {
    const newVendor = _.find(newVendorData, { name: vendor.name });
    vendor.newVendorId = newVendor.id;
  });
}

async function main() {
  try {
    const oldSupabaseRestClient = createClient(
      OLD_PROJECT_URL,
      OLD_PROJECT_SERVICE_KEY,
      {
        db: {
          schema: 'storage',
        },
      },
    );
    const supabaseOld = createClient(OLD_PROJECT_URL, OLD_PROJECT_SERVICE_KEY);
    const supabaseNew = createClient(NEW_PROJECT_URL, NEW_PROJECT_SERVICE_KEY);

    const vendors = await getVendors(supabaseOld, OLD_USER_ID);
    const contracts = await getContracts(supabaseOld, OLD_USER_ID);
    const contractDocs = await getContractDocs(supabaseOld, OLD_USER_ID);
    await transferUserFiles(oldSupabaseRestClient, supabaseOld, supabaseNew);
    const newVendorData = await insertVendors(
      supabaseNew,
      vendors,
      NEW_USER_ID,
    );
    matchVendorIds(vendors, newVendorData);
    for (const contract of contracts) {
      const newContract = await insertContract(
        supabaseNew,
        contract,
        NEW_USER_ID,
        vendors,
      );
      const file_path = _.find(contractDocs, {
        contract_id: contract.id,
      }).file_path;
      await insertContractDoc(
        supabaseNew,
        NEW_USER_ID,
        newContract.id,
        file_path,
      );
    }
    console.log('Transfer complete');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
