/**
 * Test Database Seeding Script
 *
 * This script sets up the necessary test data in the database
 * including test users and organizations required for integration tests.
 *
 * Run with: npm run test:setup
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import logger from '../utils/pino';

config({ path: '.env.local' });
config({ path: '.env' });

const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_EMAIL = 'test-user@postsig-test.com';

async function setupTestDatabase() {
  logger.info('🔧 Setting up test database...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('❌ Missing required environment variables:');
    logger.error('   - NEXT_PUBLIC_SUPABASE_URL');
    logger.error('   - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  try {
    logger.info('1️⃣  Checking for test organization...');
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', TEST_ORG_ID)
      .single();

    if (!existingOrg) {
      logger.info('   Creating test organization...');
      const { error: orgError } = await supabase.from('organizations').insert({
        id: TEST_ORG_ID,
        name: 'Test Organization',
        fiscal_year_start_month: 1,
        missing_clauses_confirmed: false,
      });

      if (orgError && !orgError.message?.includes('duplicate')) {
        throw orgError;
      }
      logger.info('   ✅ Test organization created');
    } else {
      logger.info('   ✅ Test organization already exists');
    }

    logger.info('\n2️⃣  Checking for existing test user...');
    const { data: existingUsers } = await supabase.auth.admin.listUsers();

    let testUser = existingUsers?.users?.find(
      (u) => u.email === TEST_USER_EMAIL,
    );

    if (!testUser) {
      logger.info('   Creating test user...');
      const { data: userData, error: userError } =
        await supabase.auth.admin.createUser({
          email: TEST_USER_EMAIL,
          password: 'TestPassword123!',
          email_confirm: true,
          user_metadata: {
            name: 'Test User',
            organization_id: TEST_ORG_ID, // CRITICAL: Include org ID here!
          },
        });

      if (userError) {
        throw userError;
      }

      testUser = userData?.user;
      logger.info(`   ✅ Test user created: ${testUser?.id}`);
    } else {
      logger.info(`   ✅ Test user already exists: ${testUser.id}`);

      // Verify user exists in users table (created by trigger)
      const { data: userRecord } = await supabase
        .from('users')
        .select('id, organization_id')
        .eq('id', testUser.id)
        .single();

      if (!userRecord) {
        logger.warn(
          `   ⚠️  User not found in users table, may need manual creation`,
        );
      } else if (userRecord.organization_id !== TEST_ORG_ID) {
        logger.info(`   Updating user organization_id...`);
        await supabase
          .from('users')
          .update({ organization_id: TEST_ORG_ID })
          .eq('id', testUser.id);
      }
    }

    logger.info('\n✨ Test database setup complete!\n');
    logger.info('Test credentials:');
    logger.info(`  User ID: ${testUser?.id}`);
    logger.info(`  Email: ${TEST_USER_EMAIL}`);
    logger.info(`  Org ID: ${TEST_ORG_ID}\n`);

    return {
      userId: testUser?.id,
      userEmail: TEST_USER_EMAIL,
      orgId: TEST_ORG_ID,
    };
  } catch (error) {
    console.error('\n❌ Error setting up test database:');
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupTestDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { setupTestDatabase, TEST_ORG_ID, TEST_USER_EMAIL };
