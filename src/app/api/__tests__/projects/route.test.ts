/**
 * Phase 3.1: Comprehensive Tests for Projects API Route
 * Critical for project management functionality
 */

import { GET, POST } from '../../projects/route';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  project: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  product: {
    create: jest.fn()
  },
  competitor: {
    create: jest.fn(),
    connect: jest.fn()
  }
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn().mockResolvedValue({
    user: { id: 'user-123', email: 'test@example.com' }
  })
}));

describe('/api/projects', () => {
  let mockPrisma: any;
  let mockLogger: any;
  let mockAuth: any;

  beforeEach(() => {
    mockPrisma = require('@/lib/prisma');
    mockLogger = require('@/lib/logger').logger;
    mockAuth = require('@/lib/auth');
    
    jest.clearAllMocks();
    
    // Setup default responses
    mockPrisma.project.findMany.mockResolvedValue([]);
    mockPrisma.project.create.mockResolvedValue({
      id: 'project-123',
      name: 'Test Project',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  describe('GET /api/projects', () => {
    it('should return list of projects for authenticated user', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Project 1',
          status: 'active',
          createdAt: new Date('2024-01-01'),
          products: [],
          competitors: []
        },
        {
          id: 'project-2',
          name: 'Project 2',
          status: 'active',
          createdAt: new Date('2024-01-02'),
          products: [],
          competitors: []
        }
      ];
      
      mockPrisma.project.findMany.mockResolvedValue(mockProjects);
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.projects).toHaveLength(2);
      expect(data.projects[0].name).toBe('Project 1');
      expect(data.projects[1].name).toBe('Project 2');
    });

    it('should handle authentication failure', async () => {
      mockAuth.requireAuth.mockRejectedValue(new Error('Unauthorized'));
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      
      expect(response.status).toBe(401);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.project.findMany.mockRejectedValue(new Error('Database error'));
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      
      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should include related data in project response', async () => {
      const mockProjects = [{
        id: 'project-1',
        name: 'Project 1',
        products: [{ id: 'product-1', name: 'Product 1' }],
        competitors: [{ id: 'comp-1', name: 'Competitor 1' }],
        reports: [{ id: 'report-1', title: 'Report 1' }]
      }];
      
      mockPrisma.project.findMany.mockResolvedValue(mockProjects);
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.projects[0].products).toBeDefined();
      expect(data.projects[0].competitors).toBeDefined();
      expect(data.projects[0].reports).toBeDefined();
    });

    it('should filter projects by status if provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects?status=active');
      await GET(request);
      
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'active'
        }),
        include: expect.any(Object)
      });
    });

    it('should sort projects by creation date', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects');
      await GET(request);
      
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' }
      });
    });

    it('should handle pagination parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects?page=2&limit=10');
      await GET(request);
      
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        include: expect.any(Object),
        orderBy: expect.any(Object),
        skip: 10,
        take: 10
      });
    });

    it('should return empty array when no projects exist', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.projects).toEqual([]);
    });
  });

  describe('POST /api/projects', () => {
    const validProjectData = {
      name: 'New Test Project',
      description: 'A test project description',
      product: {
        name: 'Test Product',
        website: 'https://example.com',
        description: 'Test product description'
      },
      competitors: [
        {
          name: 'Competitor 1',
          website: 'https://competitor1.com'
        },
        {
          name: 'Competitor 2',
          website: 'https://competitor2.com'
        }
      ]
    };

    it('should create a new project successfully', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.project).toBeDefined();
      expect(data.project.name).toBe('New Test Project');
    });

    it('should validate required fields', async () => {
      const invalidData = { description: 'Missing required name field' };
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
    });

    it('should create associated product', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      await POST(request);
      
      expect(mockPrisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Test Product',
          website: 'https://example.com',
          projectId: expect.any(String)
        })
      });
    });

    it('should create associated competitors', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      await POST(request);
      
      expect(mockPrisma.competitor.create).toHaveBeenCalledTimes(2);
    });

    it('should handle duplicate project names', async () => {
      mockPrisma.project.create.mockRejectedValue(
        new Error('Unique constraint failed on name')
      );
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(409);
    });

    it('should handle malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
    });

    it('should validate URL formats', async () => {
      const dataWithInvalidURL = {
        ...validProjectData,
        product: {
          ...validProjectData.product,
          website: 'not-a-valid-url'
        }
      };
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithInvalidURL)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
    });

    it('should handle database transaction failures', async () => {
      mockPrisma.project.create.mockRejectedValue(new Error('Transaction failed'));
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log project creation events', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      await POST(request);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Project created'),
        expect.any(Object)
      );
    });

    it('should validate email format if provided', async () => {
      const dataWithEmail = {
        ...validProjectData,
        userEmail: 'invalid-email'
      };
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithEmail)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
    });

    it('should handle empty competitors array', async () => {
      const dataWithNoCompetitors = {
        ...validProjectData,
        competitors: []
      };
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithNoCompetitors)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(201);
    });

    it('should set default project status', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectData)
      });
      
      await POST(request);
      
      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'active'
        })
      });
    });

    it('should handle concurrent project creation', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => 
        new NextRequest('http://localhost:3000/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...validProjectData,
            name: `Project ${i}`
          })
        })
      );
      
      const promises = requests.map(request => POST(request));
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });
    });

    it('should sanitize input data', async () => {
      const dataWithScript = {
        ...validProjectData,
        name: '<script>alert("xss")</script>Test Project',
        description: '<img src=x onerror=alert(1)>Description'
      };
      
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithScript)
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(201);
      // Verify that the data was sanitized
      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: expect.not.stringContaining('<script>'),
          description: expect.not.stringContaining('<img')
        })
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      mockPrisma.project.findMany.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      
      expect(response.status).toBe(500);
    });

    it('should return consistent error format', async () => {
      mockPrisma.project.findMany.mockRejectedValue(new Error('Test error'));
      
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      const data = await response.json();
      
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('Performance', () => {
    it('should complete requests within acceptable time', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects');
      
      const startTime = Date.now();
      await GET(request);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(2000); // Within 2 seconds
    });

    it('should handle high load efficiently', async () => {
      const requests = Array.from({ length: 10 }, () => 
        new NextRequest('http://localhost:3000/api/projects')
      );
      
      const startTime = Date.now();
      const promises = requests.map(request => GET(request));
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(3000); // Within 3 seconds for 10 requests
    });
  });
}); 