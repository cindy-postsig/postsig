/* Script to remove all user data from Supabase tables and storage.
Provide the user IDs to be deleted as an environment variable USER_IDS_TO_BE_DELETED in the format of a JSON array. */

const { createClient } = require('@supabase/supabase-js');
const logger = require('@/utils/pino');

const userIds = JSON.parse(process.env.USER_IDS_TO_BE_DELETED);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function flushTables(userId) {
  const tables = [
    'contracts',
    'contract_docs',
    'vendor_products_details',
    'vendor_products',
    'vendors',
  ];
  tables.forEach(async (table) => {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error flushing table:', error.message);
    } else {
      logger.info(`${table} flushed:`, data);
    }
  });
}

async function deleteAllFiles(bucket, path) {
  const { data: files, error: listError } = await supabase.storage
    .from(bucket)
    .list(path);

  if (listError) {
    console.error('Error listing files:', listError.message);
    return;
  }

  for (const file of files) {
    const filePath = `${path}${file.name}`;
    if (filePath.includes('..')) {
      throw new Error('Invalid file path');
    }
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (removeError) {
      console.error(`Error deleting file ${file.name}:`, removeError.message);
    } else {
      logger.info(`File ${file.name} deleted`);
    }
  }
}

async function main() {
  for (const userId of userIds) {
    await flushTables(userId);
    await deleteAllFiles('contract_docs', `${userId}/`);
  }
  logger.info('All user data removed');
}

main().catch((error) => {
  logger.error('Error running script:', error);
});
