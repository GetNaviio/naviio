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

  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/components/**/*.tsx',
    '!src/**/*.d.ts',
  ],

  coverageThreshold: {
    global: { lines: 50 },
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
