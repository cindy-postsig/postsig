const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

console.log('Remote URL:', process.env.REMOTE_PUBLIC_SUPABASE_URL);
console.log('Local URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

if (
  !process.env.REMOTE_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  console.error('Environment variables not loaded!');
  process.exit(1);
}

// LOCAL
const NEW_PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEW_PROJECT_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// STAGING
//const NEW_PROJECT_URL = 'https://azoeqhhpgdsczlasdeae.supabase.co';
//const NEW_PROJECT_SERVICE_KEY = [STAGING SERVICE KEY]

// PROD
const OLD_PROJECT_URL = process.env.REMOTE_PUBLIC_SUPABASE_URL;
const OLD_PROJECT_SERVICE_KEY = process.env.REMOTE_SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  const oldSupabaseRestClient = createClient(
    OLD_PROJECT_URL,
    OLD_PROJECT_SERVICE_KEY,
    {
      db: {
        schema: 'storage',
      },
    },
  );
  const oldSupabaseClient = createClient(
    OLD_PROJECT_URL,
    OLD_PROJECT_SERVICE_KEY,
  );
  const newSupabaseClient = createClient(
    NEW_PROJECT_URL,
    NEW_PROJECT_SERVICE_KEY,
  );

  // make sure you update max_rows in postgrest settings if you have a lot of objects
  // or paginate here
  const { data: oldObjects, error } = await oldSupabaseRestClient
    .from('objects')
    .select();
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

      const { _, error: uploadObjectError } = await newSupabaseClient.storage
        .from(objectData.bucket_id)
        .upload(objectData.name, data, {
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
})();
