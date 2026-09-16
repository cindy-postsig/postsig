// Pin the suite to UTC (CI's timezone): fixture dates mix UTC-constructed
// Dates with local-midnight string parsing, so a non-UTC dev machine shifts
// day boundaries and fails date-sensitive specs. Set here (main process,
// before workers spawn) because a worker's Date is already initialized by the
// time per-worker setup files run.
process.env.TZ = 'UTC';

const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/setup-test-db.ts',
    '/__tests__/jest.global-setup.ts',
    // Anchored to <rootDir> so a run from the main checkout still skips nested
    // worktrees, while a run from inside one (where <rootDir> is the worktree)
    // does not match — and therefore still discovers its own tests.
    '<rootDir>/\\.worktrees/',
    // Worktrees under .claude/worktrees/ hold stale test copies that resolve
    // '@/' against THIS checkout via moduleNameMapper and run against code
    // they were never written for.
    '<rootDir>/\\.claude/',
  ],
  // testPathIgnorePatterns only hides worktree TESTS; the haste map still
  // scans their __mocks__ and warns about duplicates. This hides the modules.
  modulePathIgnorePatterns: ['<rootDir>/\\.worktrees/', '<rootDir>/\\.claude/'],
  moduleNameMapper: {
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^streamdown$': '<rootDir>/__mocks__/streamdown.ts',
    '^server-only$': '<rootDir>/__mocks__/server-only.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
    // nuqs and react-resizable-panels ship ESM only; compile them to CJS so
    // component tests can render URL-state hooks and resizable layouts.
    'node_modules/(nuqs|react-resizable-panels)/.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true } },
    ],
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  globalSetup: '<rootDir>/__tests__/jest.global-setup.ts',
  transformIgnorePatterns: [
    'node_modules/(?!(@everapi/currencyapi-js|nuqs/|react-resizable-panels/|.*\\.mjs$))',
  ],
  coverageProvider: 'v8',
};

export default config;
