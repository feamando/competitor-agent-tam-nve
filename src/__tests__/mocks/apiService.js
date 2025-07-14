/**
 * Comprehensive API Service Mocks
 * Fixes integration test failures by providing realistic mock implementations
 */

const apiServiceMock = {
  // Comparative Analysis API Methods
  getComparativeStatus: jest.fn(async ({ productId }) => ({
    status: 200,
    data: {
      success: true,
      status: 'completed',
      analysisId: `analysis-${productId}-${Date.now()}`,
      productId,
      competitorId: `competitor-${productId}`,
      progress: 100,
      lastUpdated: new Date().toISOString(),
      results: {
        differences: 12,
        similarities: 8,
        riskLevel: 'medium'
      }
    }
  })),

  generateAnalysis: jest.fn(async (analysisData) => {
    if (!analysisData.productId || analysisData.productId === 'invalid-product-id') {
      return {
        status: 404,
        data: {
          success: false,
          error: {
            type: 'resource_not_found',
            message: 'Product not found',
            code: 'PRODUCT_NOT_FOUND'
          }
        }
      };
    }

    return {
      status: 200,
      data: {
        success: true,
        data: {
          analysisId: `analysis-${analysisData.productId}-${Date.now()}`,
          productId: analysisData.productId,
          competitorId: analysisData.competitorId,
          status: 'processing',
          estimatedCompletion: new Date(Date.now() + 300000).toISOString() // 5 min from now
        }
      }
    };
  }),

  // Report Scheduling API Methods
  createSchedule: jest.fn(async (scheduleData) => ({
    status: 200,
    data: {
      success: true,
      schedule: {
        id: `schedule-${Date.now()}`,
        productId: scheduleData.productId,
        frequency: scheduleData.frequency,
        nextRun: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        active: true,
        createdAt: new Date().toISOString()
      }
    }
  })),

  getSchedules: jest.fn(async ({ productId, page = 1, limit = 10 }) => ({
    status: 200,
    data: {
      success: true,
      schedules: [
        {
          id: `schedule-1-${productId}`,
          productId,
          frequency: 'daily',
          nextRun: new Date(Date.now() + 86400000).toISOString(),
          active: true,
          createdAt: new Date().toISOString()
        },
        {
          id: `schedule-2-${productId}`,
          productId,
          frequency: 'weekly', 
          nextRun: new Date(Date.now() + 604800000).toISOString(),
          active: false,
          createdAt: new Date().toISOString()
        }
      ],
      pagination: {
        page,
        limit,
        total: 2,
        totalPages: 1
      }
    }
  })),

  updateSchedule: jest.fn(async (scheduleId, updateData) => ({
    status: 200,
    data: {
      success: true,
      schedule: {
        id: scheduleId,
        ...updateData,
        updatedAt: new Date().toISOString()
      }
    }
  })),

  deleteSchedule: jest.fn(async (scheduleId) => ({
    status: 200,
    data: {
      success: true,
      message: `Schedule ${scheduleId} deleted successfully`
    }
  })),

  // Report Generation API Methods
  generateReport: jest.fn(async (reportData) => ({
    status: 200,
    data: {
      success: true,
      report: {
        id: `report-${Date.now()}`,
        productId: reportData.productId,
        competitorId: reportData.competitorId,
        status: 'generating',
        type: 'comparative',
        createdAt: new Date().toISOString()
      }
    }
  })),

  getReport: jest.fn(async (reportId) => ({
    status: 200,
    data: {
      success: true,
      report: {
        id: reportId,
        title: 'Sample Comparative Report',
        content: '# Comparative Analysis Report\n\nThis is a sample report.',
        status: 'completed',
        createdAt: new Date().toISOString(),
        metadata: {
          productName: 'Test Product',
          competitorName: 'Test Competitor',
          analysisType: 'full'
        }
      }
    }
  })),

  // Project Management API Methods
  createProject: jest.fn(async (projectData) => ({
    status: 200,
    data: {
      success: true,
      project: {
        id: `project-${Date.now()}`,
        name: projectData.name,
        description: projectData.description,
        status: 'active',
        createdAt: new Date().toISOString()
      }
    }
  })),

  getProjects: jest.fn(async () => ({
    status: 200,
    data: {
      success: true,
      projects: [
        {
          id: 'project-1',
          name: 'Test Project 1',
          description: 'First test project',
          status: 'active',
          createdAt: new Date().toISOString()
        }
      ]
    }
  })),

  // Health Check Methods
  healthCheck: jest.fn(async () => ({
    status: 200,
    data: {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'pass',
        redis: 'pass',
        aws: 'pass'
      }
    }
  }))
};

// Create a workflow mock that includes the API service
const mockWorkflow = {
  apiService: apiServiceMock,
  
  // Workflow methods
  executeWorkflow: jest.fn(async (workflowType, data) => ({
    success: true,
    workflowId: `workflow-${workflowType}-${Date.now()}`,
    status: 'completed',
    result: {
      analysisId: `analysis-${Date.now()}`,
      reportId: `report-${Date.now()}`
    }
  })),

  getWorkflowStatus: jest.fn(async (workflowId) => ({
    success: true,
    workflowId,
    status: 'completed',
    progress: 100,
    steps: [
      { name: 'data_collection', status: 'completed' },
      { name: 'analysis', status: 'completed' },
      { name: 'report_generation', status: 'completed' }
    ]
  }))
};

module.exports = {
  apiServiceMock,
  mockWorkflow,
  // Export individual methods for direct use
  ...apiServiceMock
}; 