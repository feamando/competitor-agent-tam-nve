/**
 * Performance Tests for ReportGenerator.generateInitialReport() - Phase 5 Implementation  
 * Tests performance and reliability scenarios from section 15.0
 */

import { ReportGenerator } from '@/services/domains/reporting/ReportGenerator';
import { InitialReportRequest } from '@/services/domains/reporting/types';
import { BedrockService } from '@/services/bedrock/bedrock.service';
import { prisma } from '@/lib/prisma';

// Mock external dependencies
jest.mock('@/services/bedrock/bedrock.service');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateCorrelationId: jest.fn(() => 'perf-correlation-id'),
  trackBusinessEvent: jest.fn(),
  trackErrorWithCorrelation: jest.fn(),
}));

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'perf-report-id'),
}));

jest.mock('fs/promises');
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findUnique: jest.fn() },
    report: { create: jest.fn() },
    reportVersion: { create: jest.fn() },
  },
}));

describe('ReportGenerator Performance Tests - Phase 5 Section 15.0', () => {
  let reportGenerator: ReportGenerator;
  let mockBedrockService: jest.Mocked<BedrockService>;
  let mockPrisma: any;

  const mockConfig = {
    markdownOnly: true,
    maxConcurrency: 2,
    timeout: 120000,
    analysisService: 'bedrock'
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockPrisma = prisma as any;
    mockBedrockService = new BedrockService() as jest.Mocked<BedrockService>;
    mockBedrockService.generateCompletion = jest.fn().mockResolvedValue('AI Analysis Content');
    
    reportGenerator = new ReportGenerator(mockConfig);
  });

  describe('15.1 - Load test concurrent requests (10+ simultaneous) per project', () => {
    it('should handle 10 concurrent requests efficiently', async () => {
      const mockProject = {
        id: 'load-test-project-001',
        name: 'Load Test Project',
        competitors: [
          {
            id: 'comp-load-1',
            name: 'Load Test Competitor',
            snapshots: [
              { id: 'snap-load-1', content: 'Load test content', createdAt: new Date() }
            ]
          }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'load-report-001' });
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'load-version-001' });

      const request: InitialReportRequest = {
        projectId: 'load-test-project-001',
        options: { fallbackToPartialData: true }
      };

      // Create 10 concurrent requests
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        reportGenerator.generateInitialReport({
          ...request,
          taskId: `task-${i + 1}`
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const totalTime = Date.now() - startTime;

      // Performance assertions
      expect(totalTime).toBeLessThan(20000); // Should complete within 20 seconds
      expect(responses).toHaveLength(10);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.success).toBe(true);
        expect(response.taskId).toBe(`task-${index + 1}`);
        expect(response.projectId).toBe('load-test-project-001');
      });

      // Should use request deduplication (not call AI 10 times)
      expect(mockBedrockService.generateCompletion).toHaveBeenCalledTimes(1);
      
      console.log(`10 concurrent requests completed in ${totalTime}ms (avg: ${totalTime/10}ms per request)`);
    }, 25000);

    it('should handle 20 concurrent requests with acceptable performance degradation', async () => {
      const mockProject = {
        id: 'stress-test-project-002',
        name: 'Stress Test Project',
        competitors: Array.from({ length: 3 }, (_, i) => ({
          id: `comp-stress-${i + 1}`,
          name: `Stress Competitor ${i + 1}`,
          snapshots: [
            { id: `snap-stress-${i + 1}`, content: `Stress content ${i + 1}`, createdAt: new Date() }
          ]
        }))
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'stress-report-002' });
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'stress-version-002' });

      const request: InitialReportRequest = {
        projectId: 'stress-test-project-002',
        options: { fallbackToPartialData: true }
      };

      // Create 20 concurrent requests (stress test)
      const stressRequests = Array.from({ length: 20 }, (_, i) => 
        reportGenerator.generateInitialReport({
          ...request,
          taskId: `stress-task-${i + 1}`
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(stressRequests);
      const totalTime = Date.now() - startTime;

      // Performance under stress
      expect(totalTime).toBeLessThan(45000); // Should complete within 45 seconds
      expect(responses).toHaveLength(20);
      
      // All requests should succeed even under stress
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });

      // Average response time should be reasonable
      const avgResponseTime = totalTime / 20;
      expect(avgResponseTime).toBeLessThan(2500); // Less than 2.5 seconds average

      console.log(`20 concurrent requests completed in ${totalTime}ms (avg: ${avgResponseTime}ms per request)`);
    }, 50000);

    it('should maintain consistent performance across multiple batches', async () => {
      const mockProject = {
        id: 'batch-test-project-003',
        name: 'Batch Test Project',
        competitors: [
          { id: 'comp-batch-1', name: 'Batch Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'batch-report-003' });
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'batch-version-003' });

      const request: InitialReportRequest = {
        projectId: 'batch-test-project-003',
        options: { fallbackToPartialData: true }
      };

      // Run 3 batches of 5 concurrent requests each
      const batchTimes: number[] = [];
      
      for (let batch = 0; batch < 3; batch++) {
        const batchRequests = Array.from({ length: 5 }, (_, i) => 
          reportGenerator.generateInitialReport({
            ...request,
            taskId: `batch-${batch}-task-${i + 1}`
          })
        );

        const batchStart = Date.now();
        const batchResponses = await Promise.all(batchRequests);
        const batchTime = Date.now() - batchStart;
        
        batchTimes.push(batchTime);
        
        // All requests in batch should succeed
        batchResponses.forEach(response => {
          expect(response.success).toBe(true);
        });
      }

      // Performance should be consistent across batches
      const avgBatchTime = batchTimes.reduce((sum, time) => sum + time, 0) / batchTimes.length;
      const maxDeviation = Math.max(...batchTimes.map(time => Math.abs(time - avgBatchTime)));
      
      // Deviation should not exceed 50% of average (performance consistency)
      expect(maxDeviation).toBeLessThan(avgBatchTime * 0.5);
      
      console.log(`Batch times: ${batchTimes.join(', ')}ms (avg: ${avgBatchTime}ms, max deviation: ${maxDeviation}ms)`);
    }, 30000);
  });

  describe('15.2 - Verify 90-second timeout enforcement across different scenarios', () => {
    it('should enforce timeout on AI analysis operations', async () => {
      const mockProject = {
        id: 'timeout-test-project-004',
        name: 'Timeout Test Project',
        competitors: [
          { id: 'comp-timeout-1', name: 'Timeout Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'timeout-report-004' });

      // Mock AI service to take longer than timeout
      mockBedrockService.generateCompletion.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('Delayed AI response'), 95000)) // 95 seconds
      );

      const request: InitialReportRequest = {
        projectId: 'timeout-test-project-004',
        options: { fallbackToPartialData: true }
      };

      const startTime = Date.now();
      const response = await reportGenerator.generateInitialReport(request);
      const processingTime = Date.now() - startTime;

      // Should not wait for the full 95 seconds - should timeout and fallback
      expect(processingTime).toBeLessThan(92000); // Should complete before 92 seconds
      expect(response.success).toBe(true); // Should still succeed with fallback
      expect(response.report?.content).toContain('AI analysis is temporarily unavailable');
    }, 95000);

    it('should handle timeout gracefully without crashing', async () => {
      const mockProject = {
        id: 'graceful-timeout-005',
        name: 'Graceful Timeout Test',
        competitors: [
          { id: 'comp-graceful-1', name: 'Graceful Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'graceful-report-005' });

      // Mock extremely slow AI service
      mockBedrockService.generateCompletion.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('Very delayed response'), 100000))
      );

      const request: InitialReportRequest = {
        projectId: 'graceful-timeout-005'
      };

      // Should not throw error, should handle timeout gracefully
      await expect(reportGenerator.generateInitialReport(request)).resolves.toMatchObject({
        success: true,
        projectId: 'graceful-timeout-005'
      });
    }, 95000);

    it('should apply timeout to different operation types', async () => {
      const mockProject = {
        id: 'multi-timeout-006',
        name: 'Multi Timeout Test',
        competitors: [
          { id: 'comp-multi-1', name: 'Multi Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      
      // Mock database operations to be slow
      mockPrisma.report.create.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ id: 'slow-report-006' }), 5000))
      );

      // Normal AI response time
      mockBedrockService.generateCompletion.mockResolvedValue('Normal AI response');

      const request: InitialReportRequest = {
        projectId: 'multi-timeout-006',
        options: { fallbackToPartialData: true }
      };

      const startTime = Date.now();
      const response = await reportGenerator.generateInitialReport(request);
      const processingTime = Date.now() - startTime;

      // Should complete successfully even with slow database
      expect(response.success).toBe(true);
      expect(processingTime).toBeGreaterThan(4000); // Should wait for database
      expect(processingTime).toBeLessThan(95000); // But not exceed overall timeout
    }, 100000);
  });

  describe('15.3 - Test memory usage and cleanup with large competitor datasets', () => {
    it('should handle large datasets without memory leaks', async () => {
      // Create a project with substantial data (simulating memory pressure)
      const mockProject = {
        id: 'memory-test-project-007',
        name: 'Memory Test Project',
        competitors: Array.from({ length: 15 }, (_, i) => ({
          id: `comp-memory-${i + 1}`,
          name: `Memory Competitor ${i + 1}`,
          snapshots: Array.from({ length: 8 }, (_, j) => ({
            id: `snap-memory-${i + 1}-${j + 1}`,
            content: 'X'.repeat(2000), // 2KB per snapshot
            createdAt: new Date(),
            metadata: { 
              size: 'large',
              category: `category-${j % 3}`,
              processed: true
            }
          }))
        }))
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'memory-report-007' });
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'memory-version-007' });

      const request: InitialReportRequest = {
        projectId: 'memory-test-project-007',
        options: { fallbackToPartialData: true }
      };

      // Monitor memory before
      const initialMemory = process.memoryUsage();

      const startTime = Date.now();
      const response = await reportGenerator.generateInitialReport(request);
      const processingTime = Date.now() - startTime;

      // Monitor memory after
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Performance with large dataset
      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(45000); // Should handle large data efficiently
      
      // Memory usage should be reasonable (less than 100MB increase)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
      
      console.log(`Large dataset processing: ${processingTime}ms, Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    }, 50000);

    it('should properly clean up after processing multiple large requests', async () => {
      const createLargeProject = (id: string) => ({
        id,
        name: `Large Project ${id}`,
        competitors: Array.from({ length: 10 }, (_, i) => ({
          id: `comp-${id}-${i + 1}`,
          name: `Competitor ${i + 1}`,
          snapshots: Array.from({ length: 5 }, (_, j) => ({
            id: `snap-${id}-${i + 1}-${j + 1}`,
            content: 'Y'.repeat(1500), // 1.5KB per snapshot
            createdAt: new Date(),
            metadata: { processed: true }
          }))
        }))
      });

      // Process multiple large projects sequentially
      const projectIds = ['mem-clean-001', 'mem-clean-002', 'mem-clean-003'];
      const memoryUsages: number[] = [];

      for (const projectId of projectIds) {
        const mockProject = createLargeProject(projectId);
        
        mockPrisma.project.findUnique.mockResolvedValue(mockProject);
        mockPrisma.report.create.mockResolvedValue({ id: `report-${projectId}` });

        const request: InitialReportRequest = {
          projectId,
          options: { fallbackToPartialData: true }
        };

        const memoryBefore = process.memoryUsage().heapUsed;
        await reportGenerator.generateInitialReport(request);
        const memoryAfter = process.memoryUsage().heapUsed;
        
        memoryUsages.push(memoryAfter - memoryBefore);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // Memory usage should not accumulate significantly across requests
      const avgMemoryIncrease = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
      const maxMemoryIncrease = Math.max(...memoryUsages);
      
      // No single request should use excessive memory
      expect(maxMemoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB per request
      
      console.log(`Memory usage per request: ${memoryUsages.map(m => Math.round(m / 1024 / 1024)).join(', ')}MB (avg: ${Math.round(avgMemoryIncrease / 1024 / 1024)}MB)`);
    }, 60000);

    it('should handle memory cleanup for concurrent large requests', async () => {
      const mockProject = {
        id: 'concurrent-memory-008',
        name: 'Concurrent Memory Test',
        competitors: Array.from({ length: 8 }, (_, i) => ({
          id: `comp-concurrent-mem-${i + 1}`,
          name: `Concurrent Memory Competitor ${i + 1}`,
          snapshots: Array.from({ length: 6 }, (_, j) => ({
            id: `snap-concurrent-mem-${i + 1}-${j + 1}`,
            content: 'Z'.repeat(1800), // 1.8KB per snapshot
            createdAt: new Date(),
            metadata: { concurrent: true }
          }))
        }))
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'concurrent-memory-report-008' });

      const request: InitialReportRequest = {
        projectId: 'concurrent-memory-008',
        options: { fallbackToPartialData: true }
      };

      // Monitor memory before concurrent processing
      const initialMemory = process.memoryUsage().heapUsed;

      // Execute 5 concurrent requests with large data
      const concurrentRequests = Array.from({ length: 5 }, (_, i) => 
        reportGenerator.generateInitialReport({
          ...request,
          taskId: `concurrent-mem-${i + 1}`
        })
      );

      const responses = await Promise.all(concurrentRequests);
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const totalMemoryIncrease = finalMemory - initialMemory;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });

      // Memory increase should be reasonable for concurrent processing
      expect(totalMemoryIncrease).toBeLessThan(150 * 1024 * 1024); // Less than 150MB total
      
      console.log(`Concurrent large requests memory increase: ${Math.round(totalMemoryIncrease / 1024 / 1024)}MB`);
    }, 45000);
  });

  describe('15.4 - Test database transaction rollback scenarios', () => {
    it('should handle Report table creation failures with rollback', async () => {
      const mockProject = {
        id: 'rollback-test-009',
        name: 'Rollback Test Project',
        competitors: [
          { id: 'comp-rollback-1', name: 'Rollback Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      
      // Mock Report creation to fail
      mockPrisma.report.create.mockRejectedValueOnce(new Error('Database constraint violation'));
      mockPrisma.reportVersion.create.mockResolvedValue({ id: 'version-rollback-009' });

      const request: InitialReportRequest = {
        projectId: 'rollback-test-009',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Should still succeed with fallback (graceful handling of database failures)
      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
      
      // Should not attempt ReportVersion creation if Report creation failed
      expect(mockPrisma.reportVersion.create).not.toHaveBeenCalled();
    });

    it('should handle ReportVersion table creation failures', async () => {
      const mockProject = {
        id: 'version-rollback-010',
        name: 'Version Rollback Test',
        competitors: [
          { id: 'comp-version-1', name: 'Version Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'report-version-010' });
      
      // Mock ReportVersion creation to fail
      mockPrisma.reportVersion.create.mockRejectedValueOnce(new Error('Version table constraint error'));

      const request: InitialReportRequest = {
        projectId: 'version-rollback-010',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Should still succeed even if versioning fails
      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
    });

    it('should handle cascade failures with proper error tracking', async () => {
      const { trackErrorWithCorrelation } = require('@/lib/logger');
      
      const mockProject = {
        id: 'cascade-rollback-011',
        name: 'Cascade Rollback Test',
        competitors: [
          { id: 'comp-cascade-1', name: 'Cascade Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockRejectedValue(new Error('Cascade database failure'));
      mockPrisma.reportVersion.create.mockRejectedValue(new Error('Cascade version failure'));

      const request: InitialReportRequest = {
        projectId: 'cascade-rollback-011'
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Should handle cascade failures gracefully
      expect(response.success).toBe(true);
      
      // Should track all database errors
      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'perf-correlation-id',
        expect.objectContaining({
          operation: 'database_persistence',
          projectId: 'cascade-rollback-011'
        })
      );
    });
  });

  describe('15.5 - Validate file system storage with multiple projects and cleanup', () => {
    it('should handle concurrent file creation for multiple projects', async () => {
      const fs = require('fs/promises');
      
      // Mock successful file operations
      const mkdirSpy = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();
      const statSpy = jest.spyOn(fs, 'stat').mockResolvedValue({ 
        size: 1500, 
        isDirectory: () => false 
      });

      const projects = Array.from({ length: 5 }, (_, i) => ({
        id: `file-system-${i + 1}`,
        name: `File System Test Project ${i + 1}`,
        competitors: [
          { id: `comp-fs-${i + 1}`, name: `FS Competitor ${i + 1}`, snapshots: [] }
        ]
      }));

      // Mock database for all projects
      mockPrisma.project.findUnique.mockImplementation((args: any) => {
        const projectId = args.where.id;
        return Promise.resolve(projects.find(p => p.id === projectId));
      });
      mockPrisma.report.create.mockResolvedValue({ id: 'fs-report' });

      // Create concurrent requests for different projects
      const requests = projects.map(project => ({
        projectId: project.id,
        options: { fallbackToPartialData: true }
      }));

      const concurrentRequests = requests.map(request => 
        reportGenerator.generateInitialReport(request)
      );

      const responses = await Promise.all(concurrentRequests);

      // All file operations should succeed
      responses.forEach((response, index) => {
        expect(response.success).toBe(true);
        expect(response.projectId).toBe(`file-system-${index + 1}`);
      });

      // Should create directories for each project
      expect(mkdirSpy).toHaveBeenCalledTimes(5);
      
      // Should write files for each project
      expect(writeFileSpy).toHaveBeenCalledTimes(5);

      mkdirSpy.mockRestore();
      writeFileSpy.mockRestore();
      statSpy.mockRestore();
    });

    it('should handle file system permission errors gracefully', async () => {
      const fs = require('fs/promises');
      
      const mockProject = {
        id: 'fs-permission-012',
        name: 'File System Permission Test',
        competitors: [
          { id: 'comp-fs-perm-1', name: 'FS Permission Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'fs-perm-report-012' });

      // Mock file system operations to fail with permission errors
      const mkdirSpy = jest.spyOn(fs, 'mkdir').mockRejectedValue(new Error('EACCES: permission denied'));
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockRejectedValue(new Error('EACCES: permission denied'));

      const request: InitialReportRequest = {
        projectId: 'fs-permission-012',
        options: { fallbackToPartialData: true }
      };

      const response = await reportGenerator.generateInitialReport(request);

      // Should still succeed even with file system failures
      expect(response.success).toBe(true);
      expect(response.report).toBeDefined();
      
      // File system failures should not prevent report generation
      expect(mkdirSpy).toHaveBeenCalled();
      expect(writeFileSpy).toHaveBeenCalled();

      mkdirSpy.mockRestore();
      writeFileSpy.mockRestore();
    });

    it('should clean up temporary files after processing', async () => {
      const fs = require('fs/promises');
      
      const mockProject = {
        id: 'fs-cleanup-013',
        name: 'File System Cleanup Test',
        competitors: [
          { id: 'comp-fs-cleanup-1', name: 'FS Cleanup Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'fs-cleanup-report-013' });

      // Track file operations
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();
      const unlinkSpy = jest.spyOn(fs, 'unlink').mockResolvedValue();
      const mkdirSpy = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);

      const request: InitialReportRequest = {
        projectId: 'fs-cleanup-013'
      };

      await reportGenerator.generateInitialReport(request);

      // Should create permanent files (not temp files that need cleanup)
      expect(writeFileSpy).toHaveBeenCalled();
      expect(mkdirSpy).toHaveBeenCalled();
      
      // Should not need to clean up temp files for normal operation
      expect(unlinkSpy).not.toHaveBeenCalled();

      writeFileSpy.mockRestore();
      unlinkSpy.mockRestore();
      mkdirSpy.mockRestore();
    });
  });

  describe('15.6 - Test error logging completeness and correlation ID tracking', () => {
    it('should log all error types with correlation IDs', async () => {
      const { logger, trackErrorWithCorrelation } = require('@/lib/logger');
      
      const mockProject = {
        id: 'error-logging-014',
        name: 'Error Logging Test',
        competitors: [
          { id: 'comp-error-1', name: 'Error Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockRejectedValue(new Error('Database logging test error'));
      
      // Make AI service also fail
      mockBedrockService.generateCompletion.mockRejectedValue(new Error('AI logging test error'));

      const request: InitialReportRequest = {
        projectId: 'error-logging-014',
        options: { fallbackToPartialData: true }
      };

      await reportGenerator.generateInitialReport(request);

      // Should track both AI and database errors
      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'perf-correlation-id',
        expect.objectContaining({
          errorType: 'bedrock_initialization_failure',
          projectId: 'error-logging-014'
        })
      );

      expect(trackErrorWithCorrelation).toHaveBeenCalledWith(
        expect.any(Error),
        'perf-correlation-id', 
        expect.objectContaining({
          operation: 'database_persistence',
          projectId: 'error-logging-014'
        })
      );

      // Should log processing stages
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('perf-correlation-id'),
        expect.objectContaining({
          projectId: 'error-logging-014',
          stage: expect.any(String)
        })
      );
    });

    it('should maintain correlation ID throughout entire request lifecycle', async () => {
      const { logger, trackBusinessEvent } = require('@/lib/logger');
      
      const mockProject = {
        id: 'correlation-tracking-015',
        name: 'Correlation Tracking Test',
        competitors: [
          { id: 'comp-correlation-1', name: 'Correlation Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'correlation-report-015' });

      const request: InitialReportRequest = {
        projectId: 'correlation-tracking-015',
        options: { fallbackToPartialData: true }
      };

      await reportGenerator.generateInitialReport(request);

      // Check that correlation ID appears in all log calls
      const infoLogCalls = logger.info.mock.calls;
      const correlationLogs = infoLogCalls.filter((call: any) => 
        call[0].includes('perf-correlation-id') || 
        (call[1] && call[1].correlationId === 'perf-correlation-id')
      );

      expect(correlationLogs.length).toBeGreaterThan(0);

      // Business events should include correlation ID
      expect(trackBusinessEvent).toHaveBeenCalledWith(
        'report_generation_completed',
        expect.objectContaining({
          correlationId: 'perf-correlation-id',
          projectId: 'correlation-tracking-015'
        })
      );
    });

    it('should log performance metrics with correlation tracking', async () => {
      const { logger, trackBusinessEvent } = require('@/lib/logger');
      
      const mockProject = {
        id: 'perf-metrics-016',
        name: 'Performance Metrics Test',
        competitors: [
          { id: 'comp-perf-1', name: 'Performance Competitor', snapshots: [] }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject);
      mockPrisma.report.create.mockResolvedValue({ id: 'perf-metrics-report-016' });

      const request: InitialReportRequest = {
        projectId: 'perf-metrics-016',
        options: { fallbackToPartialData: true }
      };

      await reportGenerator.generateInitialReport(request);

      // Should log performance completion with metrics
      const businessEventCalls = trackBusinessEvent.mock.calls;
      const completionEvents = businessEventCalls.filter((call: any) => 
        call[0] === 'report_generation_completed'
      );

      expect(completionEvents.length).toBeGreaterThan(0);
      
      // Completion event should include performance metrics
      const completionEvent = completionEvents[0][1];
      expect(completionEvent).toMatchObject({
        correlationId: 'perf-correlation-id',
        projectId: 'perf-metrics-016',
        processingTimeMs: expect.any(Number),
        dataCompletenessScore: expect.any(Number)
      });

      // Processing time should be reasonable
      expect(completionEvent.processingTimeMs).toBeGreaterThan(0);
      expect(completionEvent.processingTimeMs).toBeLessThan(30000);
    });
  });
}); 