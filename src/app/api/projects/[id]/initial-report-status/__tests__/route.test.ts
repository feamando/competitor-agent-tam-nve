import { NextRequest } from 'next/server';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import Bull from 'bull';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn()
    },
    report: {
      findFirst: jest.fn()
    },
    snapshot: {
      findMany: jest.fn()
    }
  }
}));

jest.mock('bull');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  trackCorrelation: jest.fn()
}));

jest.mock('@/lib/utils/errorHandler', () => ({
  handleAPIError: jest.fn((error, correlationId) => {
    // Use NextResponse for proper Next.js API route response
    const { NextResponse } = require('next/server');
    return NextResponse.json({ error: error.message, correlationId }, { status: 500 });
  })
}));

describe('GET /api/projects/[id]/initial-report-status', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  const mockBull = Bull as jest.MockedClass<typeof Bull>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Success scenarios', () => {
    it('should return not_started status when no report exists and no queue activity', async () => {
      // Setup mocks
      const projectId = 'test-project-id';
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: [
          { id: 'comp1', name: 'Competitor 1', website: 'https://comp1.com' },
          { id: 'comp2', name: 'Competitor 2', website: 'https://comp2.com' }
        ]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      // Mock Bull queue
      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      // Make request
      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      // Assertions
      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        projectId,
        reportExists: false,
        status: 'not_started',
        competitorSnapshotsStatus: {
          captured: 0,
          total: 2
        },
        dataFreshness: 'basic'
      });
    });

    it('should return completed status when report exists', async () => {
      const projectId = 'test-project-id';
      const reportId = 'test-report-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: [{ id: 'comp1', name: 'Competitor 1', website: 'https://comp1.com' }]
      };

      const mockReport = {
        id: reportId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        status: 'COMPLETED',
        description: null,
        versions: [{
          content: {
            metadata: {
              dataCompletenessScore: 85,
              dataFreshness: 'new'
            }
          }
        }]
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(mockReport as any);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        projectId,
        reportExists: true,
        reportId,
        status: 'completed',
        dataCompletenessScore: 85,
        generatedAt: '2025-01-01T10:00:00.000Z',
        dataFreshness: 'new'
      });
    });

    it('should return generating status when report is in queue', async () => {
      const projectId = 'test-project-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: []
      };

      const mockQueueJob = {
        data: { projectId }
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([mockQueueJob]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        projectId,
        reportExists: false,
        status: 'generating',
        estimatedCompletionTime: expect.any(String)
      });
    });

    it('should return failed status when report generation failed', async () => {
      const projectId = 'test-project-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: []
      };

      const mockReport = {
        id: 'failed-report-id',
        createdAt: new Date('2025-01-01T10:00:00Z'),
        status: 'FAILED',
        description: 'Analysis service unavailable',
        versions: []
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(mockReport as any);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        projectId,
        reportExists: true,
        status: 'failed',
        error: 'Analysis service unavailable'
      });
    });

    it('should return competitor snapshots status correctly', async () => {
      const projectId = 'test-project-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: [
          { id: 'comp1', name: 'Competitor 1', website: 'https://comp1.com' },
          { id: 'comp2', name: 'Competitor 2', website: 'https://comp2.com' }
        ]
      };

      const mockSnapshots = [
        {
          id: 'snap1',
          createdAt: new Date('2025-01-01T10:00:00Z'),
          metadata: { status: 'completed' },
          competitor: { name: 'Competitor 1' }
        },
        {
          id: 'snap2',
          createdAt: new Date('2025-01-01T09:30:00Z'),
          metadata: { status: 'failed', error: 'Timeout' },
          competitor: { name: 'Competitor 2' }
        }
      ];

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.snapshot.findMany.mockResolvedValue(mockSnapshots as any);

      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.competitorSnapshotsStatus).toMatchObject({
        captured: 1,
        total: 2,
        capturedAt: '2025-01-01T10:00:00.000Z',
        failures: ['Competitor 2: Timeout']
      });
    });
  });

  describe('Error scenarios', () => {
    it('should return 404 when project does not exist', async () => {
      const projectId = 'non-existent-project';

      mockPrisma.project.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/projects/non-existent-project/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toMatchObject({
        error: 'Project not found',
        correlationId: 'test-correlation-id'
      });
    });

    it('should handle database errors gracefully', async () => {
      const projectId = 'test-project-id';

      mockPrisma.project.findUnique.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });

      expect(response.status).toBe(500);
    });

    it('should handle queue connection errors gracefully', async () => {
      const projectId = 'test-project-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: []
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(null);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      // Mock Bull to throw error
      mockBull.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      // Should still return 200 with default queue status
      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        projectId,
        status: 'not_started',
        competitorSnapshotsStatus: {
          captured: 0,
          total: 0
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle report with IN_PROGRESS status', async () => {
      const projectId = 'test-project-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: []
      };

      const mockReport = {
        id: 'in-progress-report',
        createdAt: new Date(),
        status: 'IN_PROGRESS',
        description: null,
        versions: []
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(mockReport as any);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('generating');
    });

    it('should handle missing report version metadata', async () => {
      const projectId = 'test-project-id';
      
      const mockProject = {
        id: projectId,
        name: 'Test Project',
        competitors: []
      };

      const mockReport = {
        id: 'report-without-metadata',
        createdAt: new Date(),
        status: 'COMPLETED',
        description: null,
        versions: [{ content: {} }] // No metadata
      };

      mockPrisma.project.findUnique.mockResolvedValue(mockProject as any);
      mockPrisma.report.findFirst.mockResolvedValue(mockReport as any);
      mockPrisma.snapshot.findMany.mockResolvedValue([]);

      const mockQueue = {
        getActive: jest.fn().mockResolvedValue([]),
        getWaiting: jest.fn().mockResolvedValue([]),
        close: jest.fn().mockResolvedValue(undefined)
      };
      mockBull.mockImplementation(() => mockQueue as any);

      const request = new NextRequest('http://localhost/api/projects/test-project-id/initial-report-status');
      const response = await GET(request, { params: Promise.resolve({ id: projectId }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        status: 'completed',
        dataFreshness: 'basic'
      });
    });
  });
}); 