/**
 * Service Mock Factory
 * Provides comprehensive mocks for service dependencies to resolve integration issues
 */

import { logger } from '@/lib/logger';

// BedrockService Mock
export const createBedrockServiceMock = () => ({
  generateCompletion: jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Mock AI response for testing' }],
    usage: { inputTokens: 10, outputTokens: 20 }
  }),
  
  invokeModel: jest.fn().mockResolvedValue({
    body: JSON.stringify({
      content: [{ type: 'text', text: 'Mock model response' }]
    })
  }),

  // Static factory method mock
  createWithStoredCredentials: jest.fn().mockImplementation(async () => {
    return createBedrockServiceMock();
  })
});

// AsyncReportProcessingService Mock
export const createAsyncReportProcessingServiceMock = () => ({
  processInitialReport: jest.fn().mockResolvedValue({
    success: true,
    reportId: 'mock-report-id',
    report: {
      id: 'mock-report-id',
      title: 'Mock Comparative Report',
      content: 'Mock report content',
      metadata: {
        dataCompletenessScore: 85,
        dataFreshness: 'new'
      }
    },
    processingMethod: 'immediate',
    processingTime: 1500,
    timeoutExceeded: false,
    fallbackUsed: false,
    queueScheduled: false,
    retryCount: 0
  }),

  getProcessingStatistics: jest.fn().mockReturnValue({
    concurrentProcessing: 0,
    maxConcurrentProcessing: 5,
    activeProcesses: []
  }),

  cleanup: jest.fn().mockResolvedValue(undefined)
});

// IntelligentCachingService Mock
export const createIntelligentCachingServiceMock = () => ({
  cacheCompetitorBasicData: jest.fn().mockResolvedValue(true),
  getCompetitorBasicData: jest.fn().mockResolvedValue({
    name: 'Mock Competitor',
    website: 'https://mockcompetitor.com',
    description: 'Mock competitor description'
  }),
  
  cacheSnapshotMetadata: jest.fn().mockResolvedValue(true),
  getSnapshotMetadata: jest.fn().mockResolvedValue({
    lastCaptured: new Date().toISOString(),
    captureSuccess: true,
    dataPoints: 15
  }),

  invalidateCompetitorCache: jest.fn().mockResolvedValue(1),
  clearCache: jest.fn().mockResolvedValue(10),
  
  getCacheStatistics: jest.fn().mockReturnValue({
    hitRate: 0.85,
    totalRequests: 100,
    cacheHits: 85,
    cacheMisses: 15,
    totalEntries: 50
  }),

  isAvailable: jest.fn().mockResolvedValue(true)
});

// ComparativeAnalysisService Mock
export const createComparativeAnalysisServiceMock = () => ({
  generateComparativeAnalysis: jest.fn().mockResolvedValue({
    competitorAnalyses: [{
      competitorId: 'mock-competitor',
      analysis: {
        strengths: ['Mock strength 1', 'Mock strength 2'],
        weaknesses: ['Mock weakness 1'],
        marketPosition: 'Strong competitor',
        differentiators: ['Mock differentiator']
      }
    }],
    overallInsights: {
      marketTrends: ['Mock trend 1'],
      opportunities: ['Mock opportunity'],
      threats: ['Mock threat']
    }
  }),

  updateAnalysisConfiguration: jest.fn().mockImplementation((config) => {
    logger.info('Mock: Analysis configuration updated', config);
  })
});

// ComparativeReportService Mock  
export const createComparativeReportServiceMock = () => ({
  generateReport: jest.fn().mockResolvedValue({
    id: 'mock-report-id',
    title: 'Mock Comparative Report',
    content: 'Mock detailed report content',
    sections: [
      {
        title: 'Executive Summary',
        content: 'Mock executive summary',
        type: 'text'
      },
      {
        title: 'Competitive Analysis',
        content: 'Mock competitive analysis',
        type: 'analysis'
      }
    ],
    metadata: {
      generatedAt: new Date().toISOString(),
      dataCompletenessScore: 90,
      dataFreshness: 'new'
    }
  }),

  generateReportFromAnalysis: jest.fn().mockResolvedValue({
    id: 'mock-report-from-analysis',
    title: 'Mock Report from Analysis',
    content: 'Mock report generated from analysis data'
  })
});

// InitialComparativeReportService Mock
export const createInitialComparativeReportServiceMock = () => ({
  generateInitialComparativeReport: jest.fn().mockImplementation(async (projectId, options = {}) => {
    logger.info('Mock: Generating initial comparative report', { projectId, options });
    return {
      id: `report-${Date.now()}`,
      projectId,
      title: 'Mock Initial Comparative Report',
      status: 'completed',
      template: options.template || 'comprehensive',
      generatedAt: new Date(),
      dataCompletenessScore: 90,
      sections: {
        executive_summary: 'Mock executive summary',
        competitive_analysis: 'Mock competitive analysis',
        recommendations: ['Mock recommendation 1', 'Mock recommendation 2']
      }
    };
  }),

  // Add missing generateInitialReport method
  generateInitialReport: jest.fn().mockImplementation(async (projectId, options = {}) => {
    logger.info('Mock: Generating initial report', { projectId, options });
    
    if (projectId === 'non-existent-id') {
      return {
        success: false,
        error: 'Project not found',
        message: 'Project with given ID does not exist'
      };
    }

    return {
      id: `report-${Date.now()}`,
      projectId,
      title: 'Mock Initial Report',
      status: 'completed',
      success: true,
      generatedAt: new Date()
    };
  }),

  validateProjectData: jest.fn().mockImplementation((projectId) => {
    return projectId !== 'non-existent-id';
  }),

  getProjectAnalysisData: jest.fn().mockResolvedValue({
    productData: { id: 'product-1', name: 'Mock Product' },
    competitorData: [{ id: 'comp-1', name: 'Mock Competitor' }]
  })
});

// RealTimeStatusService Mock
export const createRealTimeStatusServiceMock = () => ({
  sendProcessingUpdate: jest.fn().mockImplementation((projectId, phase, progress, message) => {
    logger.info('Mock: Processing update sent', { projectId, phase, progress, message });
  }),

  sendValidationUpdate: jest.fn().mockImplementation((projectId, isValid, missingData) => {
    logger.info('Mock: Validation update sent', { projectId, isValid, missingData });
  }),

  sendCompletionUpdate: jest.fn().mockImplementation((projectId, success, reportId, title, message) => {
    logger.info('Mock: Completion update sent', { projectId, success, reportId, title, message });
  }),

  // *** FIX P0.4: Complete Mock Configurations - Add missing subscription methods ***
  subscribeToProjectStatus: jest.fn().mockImplementation((projectId, callback) => {
    logger.info('Mock: Subscribed to project status updates', { projectId });
    // Simulate initial status update
    setTimeout(() => {
      callback({
        projectId,
        status: 'generating',
        phase: 'validation',
        progress: 10,
        message: 'Mock: Started project validation',
        timestamp: new Date().toISOString(),
        type: 'status'
      });
    }, 100);
    return { unsubscribe: jest.fn() };
  }),

  unsubscribeFromProjectStatus: jest.fn().mockImplementation((projectId, callback) => {
    logger.info('Mock: Unsubscribed from project status updates', { projectId });
  }),

  // Add other real-time service methods that might be called
  sendSnapshotCaptureUpdate: jest.fn().mockImplementation((projectId, captured, total, currentCompetitor) => {
    logger.info('Mock: Snapshot capture update sent', { projectId, captured, total, currentCompetitor });
  }),

  sendStatusUpdate: jest.fn().mockImplementation((projectId, update) => {
    logger.info('Mock: Status update sent', { projectId, update });
  }),

  getActiveSubscriptions: jest.fn().mockReturnValue([])
});

// Redis-related service mocks
export const createRedisServiceMock = () => ({
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(false),
  hSet: jest.fn().mockResolvedValue(1),
  hGet: jest.fn().mockResolvedValue(null),
  isAvailable: jest.fn().mockResolvedValue(false), // Redis not available in test environment
  disconnect: jest.fn().mockResolvedValue(undefined)
});

// Configuration Management Service Mock
export const createConfigurationManagementServiceMock = () => ({
  getCurrentConfig: jest.fn().mockReturnValue({
    ANALYSIS_TIMEOUT: 30000,
    MAX_CONCURRENT_ANALYSES: 5,
    CACHE_TTL: 300000,
    SNAPSHOT_TIMEOUT: 15000
  }),

  updateConfiguration: jest.fn().mockImplementation((updates) => {
    logger.info('Mock: Configuration updated', updates);
  }),

  getInstance: jest.fn().mockImplementation(() => createConfigurationManagementServiceMock())
});

// SmartDataCollectionService Mock
export const createSmartDataCollectionServiceMock = () => ({
  collectProjectData: jest.fn().mockImplementation(async (projectId, options = {}) => {
    logger.info('Mock: Smart data collection started', { projectId, options });
    return {
      success: true,
      productData: {
        available: true,
        source: 'form_input',
        data: { id: 'product-1', name: 'Mock Product' },
        freshness: 'immediate'
      },
      competitorData: {
        totalCompetitors: 2,
        availableCompetitors: 2,
        freshSnapshots: 2,
        existingSnapshots: 0,
        basicMetadataOnly: 0,
        collectionSummary: [
          {
            competitorId: 'comp-1',
            competitorName: 'Competitor 1',
            dataSource: 'fresh_snapshot',
            dataQuality: 'high',
            captureTime: 1500
          }
        ]
      },
      dataCompletenessScore: 95,
      dataFreshness: 'new',
      collectionTime: 3000,
      priorityBreakdown: {
        productFormData: true,
        freshSnapshotsCaptured: 2,
        fastCollectionUsed: 0,
        existingSnapshotsUsed: 0,
        basicMetadataFallbacks: 0
      }
    };
  }),

  // *** FIX: Add missing collectCompetitorData method ***
  collectCompetitorData: jest.fn().mockImplementation(async (competitors, options = {}) => {
    logger.info('Mock: Competitor data collection started', { competitorCount: competitors.length, options });
    
    if (competitors.length === 0) {
      return {
        success: true,
        competitorCount: 0,
        competitorData: [],
        dataCompletenessScore: 100,
        warnings: []
      };
    }

    const competitorData = competitors.map((competitor: any, index: number) => ({
      competitorId: competitor.id,
      competitorName: competitor.name,
      dataSource: 'fresh_snapshot',
      dataQuality: 'high',
      captureTime: 1000 + (index * 200),
      metadata: {
        title: `${competitor.name} - Mock Data`,
        description: 'Mock competitor analysis data',
        features: ['Feature A', 'Feature B', 'Feature C']
      }
    }));

    return {
      success: true,
      competitorCount: competitors.length,
      competitorData,
      dataCompletenessScore: 85,
      dataFreshness: 'new',
      collectionTime: 2500,
      warnings: []
    };
  }),

  // Add other methods that might be called
  collectProductData: jest.fn().mockResolvedValue({
    available: true,
    source: 'form_input',
    data: { id: 'product-1', name: 'Mock Product' },
    freshness: 'immediate'
  }),

  calculateDataCompletenessScore: jest.fn().mockReturnValue(85),
  determineDataFreshness: jest.fn().mockReturnValue('new'),
  buildPriorityBreakdown: jest.fn().mockReturnValue({
    productFormData: true,
    freshSnapshotsCaptured: 2,
    fastCollectionUsed: 0
  })
});

// Main mock factory function
export const createServiceMocks = () => ({
  bedrockService: createBedrockServiceMock(),
  asyncReportProcessingService: createAsyncReportProcessingServiceMock(),
  intelligentCachingService: createIntelligentCachingServiceMock(),
  comparativeAnalysisService: createComparativeAnalysisServiceMock(),
  comparativeReportService: createComparativeReportServiceMock(),
  initialComparativeReportService: createInitialComparativeReportServiceMock(),
  realTimeStatusService: createRealTimeStatusServiceMock(),
  redisService: createRedisServiceMock(),
  configurationManagementService: createConfigurationManagementServiceMock(),
  smartDataCollectionService: createSmartDataCollectionServiceMock()
});

// Setup function for Jest tests
export const setupServiceMocks = () => {
  const mocks = createServiceMocks();

  // Mock BedrockService class
  jest.mock('@/services/bedrock/bedrock.service', () => ({
    BedrockService: Object.assign(
      jest.fn().mockImplementation(() => mocks.bedrockService),
      {
        createWithStoredCredentials: jest.fn().mockImplementation(async (provider = 'anthropic', config = {}, credentialOptions = {}) => {
          return mocks.bedrockService;
        })
      }
    )
  }));

  // Mock AsyncReportProcessingService
  jest.mock('@/services/reports/asyncReportProcessingService', () => ({
    asyncReportProcessingService: mocks.asyncReportProcessingService,
    AsyncReportProcessingService: {
      getInstance: jest.fn().mockReturnValue(mocks.asyncReportProcessingService)
    }
  }));

  // Mock IntelligentCachingService
  jest.mock('@/services/intelligentCachingService', () => ({
    intelligentCachingService: mocks.intelligentCachingService,
    IntelligentCachingService: {
      getInstance: jest.fn().mockReturnValue(mocks.intelligentCachingService)
    }
  }));

  // Mock other services
  jest.mock('@/services/analysis/comparativeAnalysisService', () => ({
    ComparativeAnalysisService: jest.fn().mockImplementation(() => mocks.comparativeAnalysisService)
  }));

  jest.mock('@/services/reports/comparativeReportService', () => ({
    ComparativeReportService: jest.fn().mockImplementation(() => mocks.comparativeReportService)
  }));

  jest.mock('@/services/reports/initialComparativeReportService', () => ({
    InitialComparativeReportService: jest.fn().mockImplementation(() => mocks.initialComparativeReportService),
    initialComparativeReportService: mocks.initialComparativeReportService
  }));

  // *** FIX P0.4: Complete Mock Configurations - Add SmartDataCollectionService mock ***
  jest.mock('@/services/reports/smartDataCollectionService', () => ({
    SmartDataCollectionService: jest.fn().mockImplementation(() => mocks.smartDataCollectionService),
    smartDataCollectionService: mocks.smartDataCollectionService
  }));

  jest.mock('@/services/realTimeStatusService', () => ({
    realTimeStatusService: mocks.realTimeStatusService,
    RealTimeStatusService: {
      getInstance: jest.fn().mockReturnValue(mocks.realTimeStatusService)
    }
  }));

  jest.mock('@/lib/redis', () => ({
    redis: mocks.redisService,
    redisManager: {
      isAvailable: mocks.redisService.isAvailable
    }
  }));

  return mocks;
};

// Cleanup function for tests
export const cleanupServiceMocks = () => {
  jest.clearAllMocks();
  jest.resetAllMocks();
}; 