import '@testing-library/jest-dom'

// Silence console.error in tests unless DEBUG_TESTS=1
if (!process.env.DEBUG_TESTS) {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
}

// Stub environment variables for all tests
process.env.JWT_SECRET     = 'test-jwt-secret-at-least-32-chars-long'
process.env.DATABASE_URL   = process.env.DATABASE_URL ?? 'postgresql://naviio:naviio@localhost:5432/naviio_test'
// NODE_ENV is read-only in some TS configs; set via jest testEnvironment instead

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks()
})
