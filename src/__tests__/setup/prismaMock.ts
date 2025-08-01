/**
 * Prisma Mock Setup for Unit Tests - Task 6.1 Support
 * 
 * Provides comprehensive mocking for Prisma Client to support unit testing
 * of services that interact with the database, particularly ProjectDiscoveryService.
 * 
 * Key Features:
 * - Type-safe mocking of Prisma operations
 * - Support for all CRUD operations
 * - Configurable mock responses
 * - Reset functionality for test isolation
 */

import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create a deep mock of PrismaClient that maintains type safety
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// Export a function to reset all mocks between tests
export const resetPrismaMock = () => {
  mockReset(prismaMock);
};

// Default mock implementations for common operations
export const setupDefaultPrismaMocks = () => {
  // Mock successful database connection test
  prismaMock.$queryRaw.mockResolvedValue([{ result: 1 }]);
  
  // Mock transaction wrapper - passes through the callback
  prismaMock.$transaction.mockImplementation(async (callback: any) => {
    if (typeof callback === 'function') {
      return await callback(prismaMock);
    }
    return callback;
  });

  // Mock disconnect
  prismaMock.$disconnect.mockResolvedValue();
};

// Helper functions for creating mock data
export const createMockProject = (overrides: any = {}) => ({
  id: 'mock-project-id',
  name: 'Mock Project',
  description: 'Mock project description',
  status: 'ACTIVE',
  priority: 'MEDIUM',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  userId: 'mock-user-id',
  userEmail: 'mock@example.com',
  parameters: {},
  tags: [],
  ...overrides
});

export const createMockCompetitor = (overrides: any = {}) => ({
  id: 'mock-competitor-id',
  name: 'Mock Competitor',
  website: 'https://mock-competitor.com',
  industry: 'Technology',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
});

export const createMockReport = (overrides: any = {}) => ({
  id: 'mock-report-id',
  name: 'Mock Report',
  title: 'Mock Report Title',
  status: 'COMPLETED',
  isInitialReport: false,
  reportType: 'comparative',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  competitorId: 'mock-competitor-id',
  projectId: 'mock-project-id',
  ...overrides
});

// Helper to setup common project discovery scenarios
export const setupProjectDiscoveryMocks = {
  singleProject: () => {
    prismaMock.project.findMany.mockResolvedValue([
      createMockProject({
        id: 'project-1',
        name: 'Single Project',
        competitors: [{ id: 'competitor-1' }]
      })
    ]);
  },

  multipleProjects: () => {
    prismaMock.project.findMany.mockResolvedValue([
      createMockProject({
        id: 'project-1',
        name: 'Active High Priority',
        status: 'ACTIVE',
        priority: 'HIGH',
        competitors: [{ id: 'competitor-1' }]
      }),
      createMockProject({
        id: 'project-2',
        name: 'Draft Medium Priority',
        status: 'DRAFT',
        priority: 'MEDIUM',
        competitors: [{ id: 'competitor-1' }]
      })
    ]);
  },

  noProjects: () => {
    prismaMock.project.findMany.mockResolvedValue([]);
  },

  databaseError: () => {
    prismaMock.project.findMany.mockRejectedValue(new Error('Database connection failed'));
  }
};

// Setup default mocks when module is imported
setupDefaultPrismaMocks(); 