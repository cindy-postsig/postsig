# Test Suite

## Setup

Before running tests, you need to set up the test database with required users and organizations.

### One-time Setup

Run the database seeding script:

```bash
npm run test:setup
```

This will create:

- A test user with email: `test-user@postsig-test.com`
- A test organization with ID: `00000000-0000-0000-0000-000000000001`

**Note:** The seeding script automatically loads environment variables from `.env.local` and `.env` files.

### Running Tests

The test setup runs automatically before each test suite via Jest's `globalSetup`.

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern=retroactive-detection

# Run tests in watch mode
npm run test:watch
```

## Test Database Requirements

Tests require a local Supabase instance with:

1. **Environment Variables** (in `.env.test`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. **Supabase Local Development**:
   ```bash
   npm run supabase:start
   ```

## Integration Tests

### Contract Lineage Tests

Located in `__tests__/contract-lineage/retroactive-detection.test.ts`

Tests the retroactive contract lineage detection system, verifying that:

- Late-arriving parent contracts (MSAs) can link to existing child contracts (SOs)
- Amendments can insert into existing hierarchies
- Invoices are linked based on product matching
- Circular references are prevented
- Contract type hierarchy rules are enforced

## Test Structure

```
__tests__/
├── setup-test-db.ts           # Database seeding script
├── jest.global-setup.ts        # Jest global setup hook
├── contract-lineage/
│   └── retroactive-detection.test.ts
└── README.md                   # This file
```

## Troubleshooting

### "Test user not found" Error

Run the setup script manually:

```bash
npm run test:setup
```

### Foreign Key Constraint Violations

Ensure your local Supabase database has all migrations applied:

```bash
npx supabase db reset
```

### Tests Timeout

Increase Jest timeout in individual tests or globally in `jest.config.ts`:

```typescript
testTimeout: 30000; // 30 seconds
```
