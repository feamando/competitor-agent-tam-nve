/**
 * Lightweight Unit Test Setup - Phase 2 Performance Optimization
 * Minimal setup for fast unit test execution
 */

// Create isolated mock implementations to avoid circular dependencies
const createIsolatedMockService = (serviceName) => {
  const baseMock = {
    [`${serviceName}Service`]: jest.fn(() => ({
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn()
    }))
  };
  return baseMock;
};

// Minimal global setup for unit tests
global.console = {
  ...console,
  // Reduce console noise in tests for better performance
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: console.error // Keep errors visible
};

// Fast mock implementations - removed global logger mock due to module resolution
// Individual tests can mock logger as needed

// Mock Prisma for all unit tests with isolated implementation
jest.mock('@prisma/client', () => {
  const createMockModel = () => ({
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn()
  });

  return {
    PrismaClient: jest.fn(() => ({
      project: createMockModel(),
      reportSchedule: createMockModel(),
      report: createMockModel(),
      productSnapshot: createMockModel(),
      competitor: createMockModel(),
      competitorSnapshot: createMockModel(),
      analysis: createMockModel(),
      snapshot: createMockModel(),
      user: createMockModel(),
      aWSCredentials: createMockModel(),
      reportVersion: createMockModel(),
      // Transaction support
      $transaction: jest.fn(async (callback) => {
        if (typeof callback === 'function') {
          return callback({});
        }
        return Promise.resolve([]);
      }),
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined)
    })),
    ReportScheduleFrequency: {
      DAILY: 'DAILY',
      WEEKLY: 'WEEKLY',
      MONTHLY: 'MONTHLY',
      QUARTERLY: 'QUARTERLY'
    },
    ReportScheduleStatus: {
      ACTIVE: 'ACTIVE',
      INACTIVE: 'INACTIVE',
      PAUSED: 'PAUSED'
    }
  };
});

// Mock cache service to prevent circular dependencies
jest.mock('@/lib/cache', () => {
  const mockCacheService = {
    get: jest.fn().mockImplementation(() => null),
    set: jest.fn().mockImplementation(() => Promise.resolve()),
    delete: jest.fn().mockImplementation(() => Promise.resolve()),
    clear: jest.fn().mockImplementation(() => Promise.resolve()),
    size: jest.fn().mockReturnValue(0),
    getKeysByPrefix: jest.fn().mockReturnValue([]),
    deleteByPrefix: jest.fn().mockImplementation(() => Promise.resolve())
  };
  
  return {
    __esModule: true,
    cacheService: mockCacheService,
    withCache: jest.fn().mockImplementation(async (key, fn) => fn()),
    default: mockCacheService
  };
});

// Mock memory monitoring to prevent undefined references
jest.mock('@/lib/monitoring/memoryManager', () => ({
  memoryManager: {
    registerLargeObject: jest.fn(),
    unregisterLargeObject: jest.fn(),
    getMemoryUsage: jest.fn().mockReturnValue({
      heapUsed: 50 * 1024 * 1024, // 50MB
      heapTotal: 100 * 1024 * 1024, // 100MB
      external: 10 * 1024 * 1024 // 10MB
    }),
    forceGarbageCollection: jest.fn(),
    trackMemoryLeak: jest.fn(),
    clearMemoryLeaks: jest.fn()
  }
}));

// Mock AWS services to prevent credential issues
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({
      body: {
        transformToString: jest.fn().mockResolvedValue('{"completion": "Mock AI response"}')
      }
    })
  })),
  InvokeModelCommand: jest.fn()
}));

// Add cleanup utility to prevent test contamination
global.beforeEach = global.beforeEach || (() => {});
global.afterEach = global.afterEach || (() => {});

const originalBeforeEach = global.beforeEach;
const originalAfterEach = global.afterEach;

global.beforeEach = (fn) => {
  return originalBeforeEach(() => {
    // Clear all mocks to prevent cross-test contamination
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    if (fn) fn();
  });
};

global.afterEach = (fn) => {
  return originalAfterEach(async () => {
    // Cleanup after each test
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    if (fn) await fn();
  });
};

// Configure test timeout
jest.setTimeout(15000);

// Global test performance tracking
if (process.env.NODE_ENV === 'test') {
  global.testStartTime = Date.now();
  
  afterEach(() => {
    // Clean up after each test for consistent performance
    jest.clearAllMocks();
  });
} 