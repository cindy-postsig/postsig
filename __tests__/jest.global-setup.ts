/**
 * Jest Global Setup
 *
 * Runs once before all test suites to set up the test database
 */

export default async function globalSetup() {
  // eslint-disable-next-line no-console
  console.log('\n🚀 Running global test setup...\n');

  try {
  } catch (error) {
    console.error('Failed to set up test database:', error);
    throw error;
  }
}
