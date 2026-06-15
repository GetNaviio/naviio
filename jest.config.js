const nextJest = require('next/jest.js')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.test.tsx',
  ],

  // Coverage is measured over the unit-tested business logic in src/lib. UI
  // components (src/components) are exercised by manual/visual review, not unit
  // tests, so including them would gate CI on an untested denominator.
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/**/*.d.ts',
  ],

  // Honest ratchet: src/lib currently sits at ~44% line coverage (the core
  // metric/model/forecasting logic is well covered; thin SDK adapters like
  // plaid/stripe/xero wrappers are not). Gate just below current with a small
  // buffer so CI is green today and can be raised as coverage grows.
  coverageThreshold: {
    global: { lines: 42 },
  },

  coverageReporters: ['text', 'lcov'],

  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],

  // Build output contains a copied package.json (.next/standalone) that
  // collides with the root one in jest-haste-map — keep jest out of .next.
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  watchPathIgnorePatterns: ['<rootDir>/.next/'],

  verbose: false,
}

module.exports = createJestConfig(config)
