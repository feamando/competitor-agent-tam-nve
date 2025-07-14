/**
 * Concurrent Project Creation Test
 * 
 * This test simulates multiple users attempting to create projects simultaneously
 * to ensure our race condition handling and locking mechanisms work correctly.
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { withRetry, withLock } from '@/lib/concurrency';

// Mock Prisma
const mockCreate = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockDelete = jest.fn();
const mockDeleteMany = jest.fn();
const mockTransaction = jest.fn();

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ 
        id: 'test-user-id',
        ...data
      })),
      findFirst: jest.fn().mockImplementation(() => Promise.resolve({
        id: 'test-user-id',
        email: 'concurrent_test@example.com',
        name: 'Concurrent Test User'
      })),
      delete: mockDelete
    },
    project: {
      create: mockCreate,
      findMany: mockFindMany,
      count: mockCount,
      deleteMany: mockDeleteMany
    },
    $transaction: mockTransaction
  }
}));

// Mock repositories
jest.mock('@/lib/repositories', () => ({
  productRepository: {
    create: jest.fn().mockImplementation((data) => Promise.resolve({
      id: `product-${uuidv4().substring(0, 8)}`,
      ...data
    }))
  }
}));

// Mock user for testing
const TEST_USER_EMAIL = 'concurrent_test@example.com';
const TEST_USER_ID = 'test-user-id';
const CONCURRENT_OPERATIONS = 5; // Number of concurrent operations to simulate

describe('Concurrent Project Creation', () => {
  const projectNames: string[] = [];
  const createdProjects: any[] = [];
  
  beforeAll(() => {
    // Generate unique project names
    for (let i = 0; i < CONCURRENT_OPERATIONS; i++) {
      projectNames.push(`Concurrent Project ${i + 1}-${uuidv4().substring(0, 8)}`);
    }

    // Setup mock transaction implementation
    mockTransaction.mockImplementation(callback => {
      return callback({
        project: {
          create: mockCreate
        }
      });
    });

    // Setup mock create implementation - accept only the first request with the same name
    let createdProjectNames = new Set();
    mockCreate.mockImplementation(({ data }) => {
      if (data.name === 'Shared Project Name' && createdProjectNames.has(data.name)) {
        throw new Error('Duplicate project name');
      }
      
      createdProjectNames.add(data.name);
      const project = {
        id: `project-${uuidv4().substring(0, 8)}`,
        ...data
      };
      
      createdProjects.push(project);
      return Promise.resolve(project);
    });

    // Setup mock findMany implementation
    mockFindMany.mockImplementation(({ where }) => {
      return Promise.resolve(
        createdProjects.filter(p => p.name === where.name && p.userId === where.userId)
      );
    });

    // Setup mock count implementation
    mockCount.mockImplementation(({ where }) => {
      return Promise.resolve(
        createdProjects.filter(p => 
          where.name?.in 
            ? where.name.in.includes(p.name) 
            : true
        ).filter(p => 
          p.userId === where.userId
        ).length
      );
    });
  });
  
  test('should handle concurrent project creation without race conditions', async () => {
    // Simulate multiple users attempting to create projects with the same name
    const sharedProjectName = 'Shared Project Name';
    
    // Create multiple promises that attempt to create the same project
    const promises = Array(CONCURRENT_OPERATIONS).fill(0).map(async (_, i) => {
      return await withRetry(async () => {
        // Use a unique lock key based on user ID and project name to prevent duplicate projects
        const lockKey = `project_creation:${TEST_USER_ID}:${sharedProjectName}`;
        
        return await withLock(lockKey, async () => {
          // Inside the lock, perform the transaction and product creation
          const result = await mockTransaction(async (tx) => {
            const project = await tx.project.create({
              data: {
                name: sharedProjectName,
                description: `Concurrent test ${i}`,
                status: 'ACTIVE',
                userId: TEST_USER_ID,
                parameters: {
                  testIndex: i,
                  hasProduct: true,
                  productWebsite: `https://example-${i}.com`
                },
                tags: [] // Required field for Prisma schema
              }
            });

            return { project };
          });

          return result;
        });
      }, {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
        onRetry: (error, attempt) => {
          console.warn(`Retry attempt ${attempt} for concurrent operation ${i}:`, error.message);
        }
      });
    });
    
    // Wait for all promises to settle
    const results = await Promise.allSettled(promises);
    
    // Verify only one project was actually created with shared name
    mockFindMany.mockImplementationOnce(() => {
      return Promise.resolve(
        createdProjects.filter(p => p.name === sharedProjectName && p.userId === TEST_USER_ID)
      );
    });
    
    const projectsWithSharedName = await mockFindMany({ 
      where: { 
        name: sharedProjectName, 
        userId: TEST_USER_ID 
      } 
    });
    
    // Expect that only one project was created despite concurrent attempts
    expect(projectsWithSharedName.length).toBe(1);
    
    // Count successful promises (should be only 1)
    const fulfilledResults = results.filter(r => r.status === 'fulfilled');
    expect(fulfilledResults.length).toBe(1);
  });
  
  test('should successfully create multiple different projects concurrently', async () => {
    // Create multiple promises that create different projects concurrently
    const promises = projectNames.map(async (projectName, i) => {
      return await withRetry(async () => {
        const lockKey = `project_creation:${TEST_USER_ID}:${projectName}`;
        
        return await withLock(lockKey, async () => {
          const result = await mockTransaction(async (tx) => {
            const project = await tx.project.create({
              data: {
                name: projectName,
                description: `Unique concurrent project ${i}`,
                status: 'ACTIVE',
                userId: TEST_USER_ID,
                parameters: {
                  testIndex: i,
                  hasProduct: true,
                  productWebsite: `https://unique-${i}.com`
                },
                tags: [] // Required field for Prisma schema
              }
            });

            return { project };
          });

          return result;
        });
      }, {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000,
      });
    });
    
    // Wait for all promises to settle
    const results = await Promise.allSettled(promises);
    
    // Expect all operations to succeed since they have different names
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(CONCURRENT_OPERATIONS);
    
    // Verify that the right number of projects were created
    mockCount.mockImplementationOnce(() => {
      return Promise.resolve(
        createdProjects.filter(p => 
          projectNames.includes(p.name) && 
          p.userId === TEST_USER_ID
        ).length
      );
    });
    
    const createdProjectCount = await mockCount({
      where: {
        name: {
          in: projectNames
        },
        userId: TEST_USER_ID
      }
    });
    
    expect(createdProjectCount).toBe(CONCURRENT_OPERATIONS);
  });
}); 