/** @type {import('ts-jest').JestConfigWithTsJest} */
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

// Working Jest configuration for Phase 2
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  
  // Module resolution - Fix 1.1: Enhanced ES module mappings
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^cheerio$': '<rootDir>/src/__tests__/mocks/cheerio.js',
    '^puppeteer$': '<rootDir>/src/__tests__/mocks/puppeteer.js',
    '^redis$': '<rootDir>/src/__tests__/mocks/redis.js',
    // ES Module mappings for problematic packages - create simple mocks
    '^p-limit$': '<rootDir>/src/__tests__/mocks/p-limit.js',
    '^uuid$': require.resolve('uuid'),
    '^msgpackr$': require.resolve('msgpackr'),
    '^yocto-queue$': require.resolve('yocto-queue'),
  },
  
  // Performance optimizations
  maxWorkers: '50%',
  testTimeout: 30000,
  cache: true,
  
  // Test patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(test|spec).[jt]s?(x)',
    '<rootDir>/src/**/*.(test|spec).[jt]s?(x)'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*',
    '!**/node_modules/**'
  ],
  
  // Transform ES modules - Fix 1.1: Complete ES module support
  transformIgnorePatterns: [
    'node_modules/(?!(p-limit|msgpackr|uuid|yocto-queue|cheerio|launchdarkly-node-server-sdk|@\\w+)/)',
  ],
  
  // Global setup/teardown
  globalSetup: '<rootDir>/src/__tests__/setup/globalSetup.js',
  globalTeardown: '<rootDir>/src/__tests__/setup/globalTeardown.js',
  
  // Clean mocks
  clearMocks: true,
  restoreMocks: true,
};

module.exports = createJestConfig(customJestConfig); 