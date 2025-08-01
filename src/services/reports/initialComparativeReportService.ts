import { createId } from '@paralleldrive/cuid2';
import { 
  logger, 
  generateCorrelationId, 
  createCorrelationLogger,
  trackBusinessEvent
} from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { ComparativeReportService } from './comparativeReportService';
import { ComparativeAnalysisService } from '../analysis/comparativeAnalysisService';
import { AnalysisService } from '../domains/AnalysisService';
import { featureFlags } from '../migration/FeatureFlags';
import { SmartDataCollectionService } from './smartDataCollectionService';
import { dataServiceFeatureFlags } from '../migration/DataServiceFeatureFlags';
import { SmartSchedulingService } from '../smartSchedulingService';
import { getCompetitorsWithoutSnapshots } from '@/utils/snapshotHelpers';
import { PartialDataReportGenerator, PartialDataInfo, DataGap, PartialReportOptions } from './partialDataReportGenerator';
import { realTimeStatusService } from '../realTimeStatusService';
import { reportQualityService } from './reportQualityService';
import { competitorSnapshotOptimizer, OptimizedSnapshotResult } from '../competitorSnapshotOptimizer';
import { intelligentCachingService } from '../intelligentCachingService';
import { ConfigurationManagementService } from '../configurationManagementService';
import { 
  ComparativeReport, 
  ComparativeReportMetadata,
  ReportGenerationOptions
} from '@/types/comparativeReport';
import {
  ComparativeAnalysisInput,
  Competitor,
  CompetitorSnapshot
} from '@/types/analysis';
import { Product, ProductSnapshot } from '@/types/product';

// Initial Report Options interface as defined in implementation plan
export interface InitialReportOptions {
  template?: 'comprehensive' | 'executive' | 'technical' | 'strategic';
  priority?: 'high' | 'normal' | 'low';
  timeout?: number; // Max wait time in milliseconds
  fallbackToPartialData?: boolean;
  notifyOnCompletion?: boolean;
  requireFreshSnapshots?: boolean; // NEW: Require fresh competitor snapshots
  forceGeneration?: boolean; // NEW: Force generation even if recent reports exist
}

// Project Readiness Result interface as defined in implementation plan
export interface ProjectReadinessResult {
  isReady: boolean;
  hasProduct: boolean;
  hasCompetitors: boolean;
  hasProductData: boolean;
  missingData: string[];
  readinessScore: number; // 0-100
}

// Snapshot Capture Result interface as defined in implementation plan
// PHASE 4.1: Enhanced with optimization features - now using OptimizedSnapshotResult directly
export type SnapshotCaptureResult = OptimizedSnapshotResult;

// Data Availability Result interface
export interface DataAvailabilityResult {
  hasMinimumData: boolean;
  dataCompletenessScore: number; // 0-100
  availableCompetitors: number;
  totalCompetitors: number;
  dataFreshness: 'new' | 'existing' | 'mixed' | 'basic';
}

/**
 * Service Health Status for dependency management
 */
export interface ServiceHealth {
  isHealthy: boolean;
  services: {
    comparativeReportService: { initialized: boolean; error?: string };
    comparativeAnalysisService: { initialized: boolean; error?: string };
    unifiedAnalysisService: { initialized: boolean; error?: string };
    smartDataCollectionService: { initialized: boolean; error?: string };
    partialDataReportGenerator: { initialized: boolean; error?: string };
    configService: { initialized: boolean; error?: string };
  };
  initializationErrors: string[];
  lastHealthCheck: Date;
}

/**
 * Service initialization result
 */
export interface ServiceInitializationResult {
  success: boolean;
  serviceName: string;
  error?: Error;
  fallbackUsed?: boolean;
}

export class InitialComparativeReportService {
  private comparativeReportService: ComparativeReportService | null = null;
  private comparativeAnalysisService: ComparativeAnalysisService | null = null;
  private unifiedAnalysisService: AnalysisService | null = null;
  private smartDataCollectionService: SmartDataCollectionService | null = null;
  private partialDataReportGenerator: PartialDataReportGenerator | null = null;
  private configService: ConfigurationManagementService | null = null;
  
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private serviceHealth: ServiceHealth;
  private initializationErrors: string[] = [];

  constructor() {
    this.serviceHealth = {
      isHealthy: false,
      services: {
        comparativeReportService: { initialized: false },
        comparativeAnalysisService: { initialized: false },
        unifiedAnalysisService: { initialized: false },
        smartDataCollectionService: { initialized: false },
        partialDataReportGenerator: { initialized: false },
        configService: { initialized: false }
      },
      initializationErrors: [],
      lastHealthCheck: new Date()
    };
  }

  /**
   * Initialize all service dependencies with proper error handling and fallbacks
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return await this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    await this.initializationPromise;
    this.initializationPromise = null;
  }

  private async performInitialization(): Promise<void> {
    const correlationId = generateCorrelationId();
    const initLogger = createCorrelationLogger(correlationId);
    
    try {
      initLogger.info('Starting InitialComparativeReportService initialization');
      
      // Initialize services with individual error handling
      const initResults = await Promise.allSettled([
        this.initializeComparativeReportService(),
        this.initializeComparativeAnalysisService(),
        this.initializeSmartDataCollectionService(),
        this.initializePartialDataReportGenerator(),
        this.initializeConfigurationManagement(),
        this.initializeUnifiedAnalysisService()
      ]);

      // Process initialization results
      let successCount = 0;
      initResults.forEach((result, index) => {
        const serviceNames = [
          'comparativeReportService',
          'comparativeAnalysisService', 
          'smartDataCollectionService',
          'partialDataReportGenerator',
          'configService',
          'unifiedAnalysisService'
        ];
        
        const serviceName = serviceNames[index];
        
        if (result.status === 'fulfilled') {
          this.serviceHealth.services[serviceName as keyof typeof this.serviceHealth.services].initialized = true;
          successCount++;
        } else {
          const error = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          this.serviceHealth.services[serviceName as keyof typeof this.serviceHealth.services].error = error;
          this.initializationErrors.push(`${serviceName}: ${error}`);
          initLogger.warn(`Failed to initialize ${serviceName}`, { error });
        }
      });

      // Check if minimum services are available for core functionality
      const criticalServices = [
        this.serviceHealth.services.comparativeReportService.initialized,
        this.serviceHealth.services.comparativeAnalysisService.initialized
      ];
      
      const criticalServicesCount = criticalServices.filter(Boolean).length;
      this.serviceHealth.isHealthy = criticalServicesCount >= 2; // At least report and analysis services
      
      if (this.serviceHealth.isHealthy) {
        this.isInitialized = true;
        initLogger.info('InitialComparativeReportService initialized successfully', {
          successCount,
          totalServices: initResults.length,
          criticalServicesCount
        });
      } else {
        initLogger.warn('InitialComparativeReportService initialized with degraded functionality', {
          successCount,
          totalServices: initResults.length,
          errors: this.initializationErrors
        });
      }

      this.serviceHealth.lastHealthCheck = new Date();
      this.serviceHealth.initializationErrors = this.initializationErrors;

      trackBusinessEvent('initial_comparative_report_service_initialized', {
        correlationId,
        successCount,
        totalServices: initResults.length,
        isHealthy: this.serviceHealth.isHealthy,
        errors: this.initializationErrors
      });

    } catch (error) {
      initLogger.error('Critical failure during InitialComparativeReportService initialization', error as Error);
      throw new Error(`Failed to initialize InitialComparativeReportService: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async initializeComparativeReportService(): Promise<void> {
    try {
      this.comparativeReportService = new ComparativeReportService();
      logger.debug('ComparativeReportService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ComparativeReportService', error as Error);
      throw error;
    }
  }

  private async initializeComparativeAnalysisService(): Promise<void> {
    try {
      this.comparativeAnalysisService = new ComparativeAnalysisService();
      logger.debug('ComparativeAnalysisService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ComparativeAnalysisService', error as Error);
      throw error;
    }
  }

  private async initializeSmartDataCollectionService(): Promise<void> {
    try {
      this.smartDataCollectionService = new SmartDataCollectionService();
      logger.debug('SmartDataCollectionService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SmartDataCollectionService', error as Error);
      throw error;
    }
  }

  private async initializePartialDataReportGenerator(): Promise<void> {
    try {
      this.partialDataReportGenerator = new PartialDataReportGenerator();
      logger.debug('PartialDataReportGenerator initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PartialDataReportGenerator', error as Error);
      throw error;
    }
  }

  private async initializeConfigurationManagement(): Promise<void> {
    try {
      this.configService = ConfigurationManagementService.getInstance();
      logger.debug('ConfigurationManagementService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ConfigurationManagementService', error as Error);
      throw error;
    }
  }

  private async initializeUnifiedAnalysisService(): Promise<void> {
    try {
      if (featureFlags.isEnabledForReporting()) {
        this.unifiedAnalysisService = new AnalysisService();
        logger.debug('UnifiedAnalysisService initialized successfully');
      } else {
        logger.debug('UnifiedAnalysisService initialization skipped (feature flag disabled)');
      }
    } catch (error) {
      logger.warn('Failed to initialize UnifiedAnalysisService, will fallback to legacy services', { error: (error as Error).message });
      // Don't throw - this is optional
    }
  }

  /**
   * Get service health status
   */
  getServiceHealth(): ServiceHealth {
    return {
      ...this.serviceHealth,
      lastHealthCheck: new Date()
    };
  }

  /**
   * Ensure service is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.serviceHealth.isHealthy) {
      throw new Error(`InitialComparativeReportService is not healthy. Errors: ${this.initializationErrors.join(', ')}`);
    }
    
    // Task 1.3.5: Initialize unified DataService if feature flag is enabled
    if (dataServiceFeatureFlags.isEnabledForReporting()) {
      // DataService initialization will be handled on-demand
      logger.info('DataService enabled for reporting - will use unified data collection');
    }
  }

  /**
   * Generate initial comparative report for a new project
   * This is the main method as specified in the implementation plan
   */
  async generateInitialComparativeReport(
    projectId: string, 
    options: InitialReportOptions = {}
  ): Promise<ComparativeReport> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const reportLogger = createCorrelationLogger(correlationId);
    const context = {
      projectId,
      operation: 'generateInitialComparativeReport',
      options,
      correlationId
    };

    try {
      // Ensure all services are properly initialized
      await this.ensureInitialized();
      
      reportLogger.info('Starting initial comparative report generation', context);

      // Use fallback mechanisms for critical services
      const reportService = await this.getComparativeReportServiceWithFallback();
      const analysisService = await this.getAnalysisServiceWithFallback();

      // NEW: Check for recent duplicate reports (prevent multiple reports within 5 minutes)
      const recentDuplicateReport = await this.checkForRecentDuplicateReport(projectId);
      if (recentDuplicateReport && !options.forceGeneration) {
        reportLogger.info('Recent comparative report found, returning existing report', {
          ...context,
          existingReportId: recentDuplicateReport.id,
          existingReportAge: Date.now() - recentDuplicateReport.createdAt.getTime()
        });
        return recentDuplicateReport;
      }

      // 1. Validate project readiness
      const readinessResult = await this.validateProjectReadiness(projectId);
      
      // Task 4.3: Check for missing snapshots during report generation
      // Task 7.1: Enhanced error handling for snapshot failures
      await this.safelyExecuteSnapshotCheck(
        () => this.checkAndTriggerMissingSnapshots(projectId, correlationId, reportLogger),
        'missing snapshots check',
        correlationId,
        reportLogger
      );
      
      // Task 5.1 & 5.2: Check for stale snapshots and trigger refresh before analysis
      // Task 7.1: Enhanced error handling for snapshot failures
      await this.safelyExecuteSnapshotCheck(
        () => this.checkAndTriggerStaleSnapshots(projectId, options, correlationId, reportLogger),
        'stale snapshots check',
        correlationId,
        reportLogger
      );
      
      // PHASE 3.1: Send validation status update
      try {
        realTimeStatusService.sendValidationUpdate(
          projectId, 
          readinessResult.isReady, 
          readinessResult.missingData
        );
      } catch (statusError) {
        reportLogger.warn('Failed to send validation status update', { error: statusError });
      }
      
      if (!readinessResult.isReady && !options.fallbackToPartialData) {
        // Send failure update
        try {
          realTimeStatusService.sendCompletionUpdate(
            projectId,
            false,
            undefined,
            undefined,
            `Project not ready: ${readinessResult.missingData.join(', ')}`
          );
        } catch (statusError) {
          reportLogger.warn('Failed to send completion status update', { error: statusError });
        }
        throw new Error(`Project ${projectId} is not ready for report generation. Missing: ${readinessResult.missingData.join(', ')}`);
      }

      // 2. Execute Smart Data Collection with fallback
      reportLogger.info('Starting smart data collection with priority system', context);
      
      const smartCollectionResult = await this.executeSmartDataCollectionWithFallback(projectId, options);
      
      // 3. Build analysis input
      const analysisInput = await this.buildAnalysisInput(projectId, smartCollectionResult);
      
      // 4. Generate report based on data completeness
      let finalReport: ComparativeReport;
      
      if (smartCollectionResult.dataCompletenessScore < 70 || options.fallbackToPartialData) {
        finalReport = await this.generatePartialDataReport(analysisInput, smartCollectionResult, options, reportLogger);
      } else {
        finalReport = await this.generateFullReport(analysisInput, options, analysisService, reportService, reportLogger);
      }

      // 5. Enhance report metadata for initial reports
      const enhancedReport = this.enhanceReportForInitialGeneration(finalReport, {
        projectId,
        isInitialReport: true,
        dataCompletenessScore: smartCollectionResult.dataCompletenessScore || 0,
        dataFreshness: smartCollectionResult.dataFreshness || 'basic',
        competitorSnapshotsCaptured: smartCollectionResult.capturedCount || 0,
        generationTime: Date.now() - startTime
      });

      // 6. Quality validation with fallback
      await this.validateReportQualityWithFallback(enhancedReport, reportLogger);

      // 7. Final status update
      try {
        realTimeStatusService.sendCompletionUpdate(
          projectId,
          true,
          enhancedReport.id,
          enhancedReport.id,
          undefined
        );
      } catch (statusError) {
        reportLogger.warn('Failed to send final completion status update', { error: statusError });
      }

      trackBusinessEvent('initial_comparative_report_generated', {
        ...context,
        reportId: enhancedReport.id,
        processingTime: Date.now() - startTime,
        dataCompletenessScore: smartCollectionResult.dataCompletenessScore
      });

      reportLogger.info('Initial comparative report generation completed successfully', {
        ...context,
        reportId: enhancedReport.id,
        processingTime: Date.now() - startTime
      });

      return enhancedReport;

    } catch (error) {
      reportLogger.error('Failed to generate initial comparative report', error as Error, context);
      
      // Attempt emergency fallback report generation
      if (options.fallbackToPartialData !== false) {
        try {
          return await this.generateEmergencyFallbackReport(projectId, options, error as Error, reportLogger);
        } catch (fallbackError) {
          reportLogger.error('Emergency fallback also failed', fallbackError as Error, context);
        }
      }
      
      throw error;
    }
  }

  /**
   * Legacy method name support for backward compatibility
   */
  async generateInitialReport(projectId: string, options: InitialReportOptions = {}): Promise<ComparativeReport> {
    logger.warn('generateInitialReport is deprecated, use generateInitialComparativeReport instead');
    return await this.generateInitialComparativeReport(projectId, options);
  }

  /**
   * Get ComparativeReportService with fallback mechanisms
   */
  private async getComparativeReportServiceWithFallback(): Promise<ComparativeReportService> {
    if (this.comparativeReportService) {
      return this.comparativeReportService;
    }
    
    // Attempt to reinitialize
    try {
      await this.initializeComparativeReportService();
      if (this.comparativeReportService) {
        return this.comparativeReportService;
      }
    } catch (error) {
      logger.error('Failed to reinitialize ComparativeReportService', error as Error);
    }
    
    throw new Error('ComparativeReportService is not available and cannot be initialized');
  }

  /**
   * Get analysis service with fallback between unified and legacy
   */
  private async getAnalysisServiceWithFallback(): Promise<ComparativeAnalysisService | AnalysisService> {
    // Try unified service first if available
    if (this.unifiedAnalysisService) {
      return this.unifiedAnalysisService;
    }
    
    // Fallback to legacy service
    if (this.comparativeAnalysisService) {
      return this.comparativeAnalysisService;
    }
    
    // Attempt to reinitialize legacy service
    try {
      await this.initializeComparativeAnalysisService();
      if (this.comparativeAnalysisService) {
        return this.comparativeAnalysisService;
      }
    } catch (error) {
      logger.error('Failed to reinitialize ComparativeAnalysisService', error as Error);
    }
    
    throw new Error('No analysis service is available');
  }

  /**
   * Execute smart data collection with fallback to basic collection
   */
  private async executeSmartDataCollectionWithFallback(projectId: string, options: InitialReportOptions): Promise<any> {
    try {
      if (this.smartDataCollectionService) {
        const config = this.configService?.getCurrentConfig() || {};
                 return await this.smartDataCollectionService.collectProjectData(projectId, {
           requireFreshSnapshots: options.requireFreshSnapshots !== false,
           maxCaptureTime: options.timeout || 60000,
           fallbackToPartialData: options.fallbackToPartialData !== false,
           fastCollectionOnly: false
         });
      }
    } catch (error) {
      logger.warn('Smart data collection failed, falling back to basic collection', { error, projectId });
    }
    
    // Fallback to basic competitor snapshot capture
    return await this.captureCompetitorSnapshots(projectId);
  }

  /**
   * Generate partial data report with fallback mechanisms
   */
  private async generatePartialDataReport(analysisInput: any, smartCollectionResult: any, options: InitialReportOptions, reportLogger: any): Promise<ComparativeReport> {
    try {
      reportLogger.info('Using partial data report generation due to low data completeness');
      
      if (!this.partialDataReportGenerator) {
        throw new Error('PartialDataReportGenerator not available');
      }
      
      const partialDataInfo = this.buildPartialDataInfo(smartCollectionResult);
             const partialReportOptions: PartialReportOptions = {
         template: options.template || 'comprehensive',
         format: 'markdown',
         includeCharts: true,
         includeTables: true,
         partialDataInfo,
         includeDataGapSection: true,
         includeRecommendations: true,
         acknowledgeDataLimitations: true
       };

      // Attempt analysis with fallback
      let analysis = null;
      try {
        const analysisService = await this.getAnalysisServiceWithFallback();
        if (analysisService instanceof AnalysisService) {
          analysis = await analysisService.analyzeProductVsCompetitors(analysisInput);
        } else {
          analysis = await analysisService.analyzeProductVsCompetitors(analysisInput);
        }
      } catch (analysisError) {
        reportLogger.warn('Analysis failed, proceeding with partial data report without analysis', { error: analysisError });
      }

      return await this.partialDataReportGenerator.generatePartialDataReport(
        analysis,
        analysisInput.product as Product,
        analysisInput.productSnapshot,
        partialReportOptions
      );
    } catch (error) {
      reportLogger.error('Partial data report generation failed', error as Error);
      throw error;
    }
  }

  /**
   * Generate full report with all services
   */
  private async generateFullReport(analysisInput: any, options: InitialReportOptions, analysisService: any, reportService: ComparativeReportService, reportLogger: any): Promise<ComparativeReport> {
    reportLogger.info('Generating comprehensive report with full data');
    
    // Perform analysis
    const analysis = analysisService instanceof AnalysisService 
      ? await analysisService.analyzeProductVsCompetitors(analysisInput)
      : await analysisService.analyzeProductVsCompetitors(analysisInput);
    
    // Generate report
    const reportOptions: ReportGenerationOptions = {
      template: options.template || 'comprehensive',
      format: 'markdown',
      includeCharts: true,
      includeTables: true
    };

    const reportResult = await reportService.generateComparativeReport(
      analysis,
      analysisInput.product as Product,
      analysisInput.productSnapshot,
      reportOptions
    );

    return reportResult.report;
  }

  /**
   * Generate emergency fallback report when all else fails
   */
  private async generateEmergencyFallbackReport(projectId: string, options: InitialReportOptions, originalError: Error, reportLogger: any): Promise<ComparativeReport> {
    reportLogger.warn('Generating emergency fallback report', { originalError: originalError.message });
    
    try {
      // Create minimal report with available data
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const fallbackReport: ComparativeReport = {
        id: createId(),
        title: `Emergency Report - ${project.name}`,
        description: 'This is an emergency fallback report generated due to system issues. Limited analysis available.',
        sections: [],
        executiveSummary: `# Emergency Comparative Analysis Report

## Project: ${project.name}

**Note:** This report was generated using emergency fallback procedures due to system limitations.

### Project Overview
- **Project Name:** ${project.name}
- **Competitors:** ${project.competitors?.length || 0} competitors found
- **Generation Time:** ${new Date().toISOString()}

### System Status
- **Original Error:** ${originalError.message}
- **Fallback Mode:** Emergency report generation
- **Data Completeness:** Limited

### Recommendations
1. Re-run report generation when system issues are resolved
2. Ensure all competitor data is up to date
3. Check system health and service dependencies

*This report was automatically generated as a fallback when the primary reporting system encountered issues.*`,
        analysisId: createId(),
        metadata: {
           productName: project.name,
           productUrl: '',
           competitorCount: project.competitors?.length || 0,
           analysisDate: new Date(),
           reportGeneratedAt: new Date(),
           analysisId: createId(),
           analysisMethod: 'hybrid',
           confidenceScore: 0,
           dataQuality: 'low',
           reportVersion: '1.0-emergency',
           focusAreas: [],
           analysisDepth: 'basic'
         } as ComparativeReportMetadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

             // Save emergency report to database
       await prisma.report.create({
         data: {
           id: fallbackReport.id,
           name: fallbackReport.title,
           description: 'Emergency fallback report',
           projectId: projectId,
           competitorId: project.competitors?.[0]?.id || '',
           status: 'COMPLETED'
         }
       });

      trackBusinessEvent('emergency_fallback_report_generated', {
        projectId,
        reportId: fallbackReport.id,
        originalError: originalError.message
      });

      return fallbackReport;
    } catch (fallbackError) {
      reportLogger.error('Emergency fallback report generation failed', fallbackError as Error);
      throw new Error(`All report generation methods failed. Original: ${originalError.message}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate report quality with fallback
   */
  private async validateReportQualityWithFallback(report: ComparativeReport, reportLogger: any): Promise<void> {
         try {
       if (reportQualityService) {
         await reportQualityService.assessReportQuality(
           report,
           {} as any, // Analysis not available in fallback
           null as any, // Product data not available in fallback
           null as any, // Product snapshot not available in fallback  
           { availableCompetitors: 0, totalCompetitors: 0 } as any
         );
       }
     } catch (qualityError) {
       reportLogger.warn('Report quality validation failed, proceeding anyway', { error: qualityError });
     }
  }

  /**
   * Check for recent duplicate comparative reports to prevent spam generation
   */
  private async checkForRecentDuplicateReport(projectId: string): Promise<ComparativeReport | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    
    try {
      // Look for recent comparative reports for this project
      const recentReport = await prisma.report.findFirst({
        where: {
          projectId,
          createdAt: {
            gte: fiveMinutesAgo
          },
          // Filter for comparative reports by name pattern
          OR: [
            {
              name: {
                contains: 'Competitive Analysis'
              }
            },
            {
              name: {
                contains: 'comparative'
              }
            }
          ]
        },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (!recentReport) {
        return null;
      }

      // Return basic report conversion without versions
      // Note: This is a simplified conversion for emergency fallback scenarios

      // Simplified return for recent duplicate reports
      if (recentReport) {
        return {
          id: recentReport.id,
          title: recentReport.name,
          description: recentReport.description || '',
          projectId: recentReport.projectId || '',
          productId: '',
          analysisId: recentReport.id,
          metadata: {
            productName: recentReport.name,
            productUrl: '',
            competitorCount: 0,
            analysisDate: recentReport.createdAt,
            reportGeneratedAt: recentReport.createdAt,
            analysisId: recentReport.id,
            analysisMethod: 'hybrid',
            confidenceScore: 70,
            dataQuality: 'medium',
            reportVersion: '1.0',
            focusAreas: [],
            analysisDepth: 'comprehensive'
          },
          sections: [],
          executiveSummary: '',
          keyFindings: [],
          strategicRecommendations: {
            immediate: [],
            shortTerm: [],
            longTerm: [],
            priorityScore: 50
          },
          competitiveIntelligence: {
            marketPosition: 'unknown',
            keyThreats: [],
            opportunities: [],
            competitiveAdvantages: []
          },
          createdAt: recentReport.createdAt,
          updatedAt: recentReport.updatedAt,
          status: recentReport.status as 'draft' | 'completed' | 'archived',
          format: 'markdown'
        };
      }
      
      // If no recent report found, return null
      return null;

    } catch (error) {
      logger.warn('Failed to check for recent duplicate reports', {
        projectId,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Validate if project has sufficient data for report generation
   */
  async validateProjectReadiness(projectId: string): Promise<ProjectReadinessResult> {
    const context = { projectId, operation: 'validateProjectReadiness' };
    
    try {
      logger.info('Validating project readiness', context);

      // Get project with related data
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          },
          competitors: true
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const missingData: string[] = [];
      let readinessScore = 0;

      // Check for product
      const hasProduct = project.products.length > 0;
      if (hasProduct) {
        readinessScore += 40;
      } else {
        missingData.push('product');
      }

      // Check for product data (snapshots)
      const hasProductData = hasProduct && project.products[0]?.snapshots.length > 0;
      if (hasProductData) {
        readinessScore += 20;
      } else if (hasProduct) {
        missingData.push('product snapshot data');
      }

      // Check for competitors
      const hasCompetitors = project.competitors.length > 0;
      if (hasCompetitors) {
        readinessScore += 40;
      } else {
        missingData.push('competitors');
      }

      const isReady = hasProduct && hasCompetitors;

      const result: ProjectReadinessResult = {
        isReady,
        hasProduct,
        hasCompetitors,
        hasProductData,
        missingData,
        readinessScore
      };

      logger.info('Project readiness validated', {
        ...context,
        result
      });

      return result;

    } catch (error) {
      logger.error('Failed to validate project readiness', error as Error, context);
      throw error;
    }
  }

  /**
   * Capture fresh competitor snapshots for the project
   */  
  /**
   * Task 4.3: Check for missing snapshots and trigger collection during report generation
   */
  private async checkAndTriggerMissingSnapshots(
    projectId: string, 
    correlationId: string, 
    reportLogger: any
  ): Promise<void> {
    const context = { projectId, correlationId, operation: 'checkAndTriggerMissingSnapshots' };

    try {
      reportLogger.info('Checking for missing competitor snapshots', context);

      // Get competitors without snapshots
      const missingCompetitors = await getCompetitorsWithoutSnapshots(projectId);

      if (missingCompetitors.length === 0) {
        reportLogger.info('All competitors have snapshots', context);
        return;
      }

      reportLogger.info('Found competitors missing snapshots, triggering collection', {
        ...context,
        missingCount: missingCompetitors.length,
        highPriorityCount: missingCompetitors.filter(c => c.priority === 'high').length
      });

      // Use SmartSchedulingService to trigger missing snapshots
      const smartSchedulingService = new SmartSchedulingService();
      const result = await smartSchedulingService.checkAndTriggerMissingSnapshots(projectId);

      if (result.triggered) {
        reportLogger.info('Missing snapshots triggered successfully', {
          ...context,
          triggeredCount: result.triggeredCount,
          totalMissing: result.missingSnapshotsFound
        });

        // Wait a moment for snapshots to begin processing
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        reportLogger.warn('No missing snapshots were triggered', context);
      }

    } catch (error) {
      // Don't fail report generation if snapshot triggering fails
      reportLogger.warn('Failed to check and trigger missing snapshots', {
        ...context,
        error: (error as Error).message
      });
    }
  }

  /**
   * Task 5.1 & 5.2: Check for stale snapshots and trigger refresh before analysis
   * Task 5.4: Uses configurable staleness threshold (defaulting to 7 days)
   */
  private async checkAndTriggerStaleSnapshots(
    projectId: string, 
    options: InitialReportOptions,
    correlationId: string, 
    reportLogger: any
  ): Promise<void> {
    const context = { projectId, correlationId, operation: 'checkAndTriggerStaleSnapshots' };

    try {
      // Task 5.4: Use configurable staleness threshold, default to 7 days
      const maxAgeInDays = this.getConfigurableStalenessThreshold();
      
      reportLogger.info('Checking for stale competitor snapshots', {
        ...context,
        maxAgeInDays,
        requireFreshSnapshots: options.requireFreshSnapshots
      });

      // Get comprehensive freshness analysis
      const smartSchedulingService = new SmartSchedulingService();
      const freshnessAnalysis = await smartSchedulingService.getSnapshotFreshnessAnalysis(projectId, maxAgeInDays);

      reportLogger.info('Snapshot freshness analysis completed', {
        ...context,
        ...freshnessAnalysis,
        overallFreshness: freshnessAnalysis.overallFreshness
      });

      // Determine if we need to trigger stale snapshot refresh
      const shouldTriggerRefresh = this.shouldTriggerStaleRefresh(freshnessAnalysis, options);

      if (!shouldTriggerRefresh) {
        reportLogger.info('No stale snapshot refresh needed', {
          ...context,
          reason: freshnessAnalysis.overallFreshness === 'fresh' ? 'All snapshots are fresh' : 'Refresh not required by options'
        });
        return;
      }

      // Task 5.3: Trigger refresh for stale snapshots
      const staleRefreshResult = await smartSchedulingService.checkAndTriggerStaleSnapshots(projectId, maxAgeInDays);

      if (staleRefreshResult.triggered) {
        reportLogger.info('Stale snapshots refresh triggered successfully', {
          ...context,
          triggeredCount: staleRefreshResult.triggeredCount,
          staleSnapshotsFound: staleRefreshResult.staleSnapshotsFound
        });

        // Wait for refresh to begin processing before continuing with report generation
        const waitTime = this.calculateRefreshWaitTime(staleRefreshResult.triggeredCount);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        reportLogger.info('Stale snapshot refresh wait completed', {
          ...context,
          waitTime
        });
      } else {
        reportLogger.warn('No stale snapshots were refreshed', {
          ...context,
          staleSnapshotsFound: staleRefreshResult.staleSnapshotsFound
        });
      }

    } catch (error) {
      // Don't fail report generation if stale snapshot checking fails
      reportLogger.warn('Failed to check and trigger stale snapshots', {
        ...context,
        error: (error as Error).message
      });
    }
  }

  /**
   * Task 5.4: Get configurable staleness threshold with environment variable support
   */
  private getConfigurableStalenessThreshold(): number {
    // Check environment variable first, then fall back to default
    const envThreshold = process.env.SNAPSHOT_STALENESS_THRESHOLD_DAYS;
    if (envThreshold) {
      const parsed = parseInt(envThreshold, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    
    // Default to 7 days as specified in the task plan
    return 7;
  }

  /**
   * Determine if stale snapshot refresh should be triggered based on analysis and options
   */
  private shouldTriggerStaleRefresh(
    analysis: {
      overallFreshness: 'fresh' | 'partially_stale' | 'mostly_stale' | 'critical';
      staleSnapshots: number;
      totalCompetitors: number;
    },
    options: InitialReportOptions
  ): boolean {
    // Always fresh = no refresh needed
    if (analysis.overallFreshness === 'fresh') {
      return false;
    }

    // If explicitly requiring fresh snapshots, always refresh stale ones
    if (options.requireFreshSnapshots) {
      return analysis.staleSnapshots > 0;
    }

    // For critical staleness, always refresh
    if (analysis.overallFreshness === 'critical') {
      return true;
    }

    // For mostly stale, refresh if we have time (not low priority)
    if (analysis.overallFreshness === 'mostly_stale' && options.priority !== 'low') {
      return true;
    }

    // For partially stale, only refresh if high priority
    if (analysis.overallFreshness === 'partially_stale' && options.priority === 'high') {
      return true;
    }

    return false;
  }

  /**
   * Calculate appropriate wait time based on number of snapshots being refreshed
   */
  private calculateRefreshWaitTime(triggeredCount: number): number {
    // Base wait time of 2 seconds, plus 500ms per additional snapshot
    const baseWaitTime = 2000;
    const additionalWaitTime = Math.min(triggeredCount * 500, 10000); // Cap at 10 seconds
    return baseWaitTime + additionalWaitTime;
  }

  /**
   * Task 7.1: Safely execute snapshot-related operations with comprehensive error handling
   * Ensures report generation continues even if snapshot operations fail
   */
  private async safelyExecuteSnapshotCheck(
    operation: () => Promise<void>,
    operationName: string,
    correlationId: string,
    reportLogger: any
  ): Promise<void> {
    const context = { 
      operation: 'safelyExecuteSnapshotCheck', 
      operationName, 
      correlationId 
    };

    try {
      reportLogger.info(`Starting ${operationName}`, context);
      await operation();
      reportLogger.info(`Successfully completed ${operationName}`, context);
    } catch (error) {
      // Task 7.1: Graceful error handling - don't fail report generation
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      reportLogger.warn(`${operationName} failed but report generation will continue`, {
        ...context,
        error: errorMessage,
        gracefulDegradation: true
      });

      // Track the error for monitoring but don't throw
      this.trackSnapshotOperationFailure(operationName, error as Error, correlationId);
    }
  }

  /**
   * Task 7.3: Track snapshot operation failures for monitoring and alerting
   */
  private trackSnapshotOperationFailure(
    operationName: string,
    error: Error,
    correlationId: string
  ): void {
    const context = {
      operation: 'trackSnapshotOperationFailure',
      operationName,
      correlationId,
      errorType: error.constructor.name,
      errorMessage: error.message
    };

    try {
      // Log the failure for monitoring systems
      logger.error(`Snapshot operation failure tracked`, error, context);

      // Track the failure in the business event system
      trackBusinessEvent('snapshot_operation_failure', {
        ...context,
        failureTracked: true,
        severity: 'warning', // Not critical since report generation continues
        timestamp: new Date().toISOString()
      });

      // Task 7.3: Increment failure counters for alerting
      this.incrementFailureCounter(operationName);

    } catch (trackingError) {
      // Even tracking failures shouldn't break report generation
      logger.error('Failed to track snapshot operation failure', trackingError as Error, {
        originalError: error.message,
        operationName,
        correlationId
      });
    }
  }

  /**
   * Task 7.3: Track failure counts for alerting thresholds
   */
  private static failureCounts = new Map<string, {
    count: number;
    lastFailure: Date;
    firstFailure: Date;
  }>();

  private incrementFailureCounter(operationName: string): void {
    const current = InitialComparativeReportService.failureCounts.get(operationName);
    const now = new Date();

    if (current) {
      current.count++;
      current.lastFailure = now;
    } else {
      InitialComparativeReportService.failureCounts.set(operationName, {
        count: 1,
        lastFailure: now,
        firstFailure: now
      });
    }

    // Task 7.3: Check if we've hit alerting thresholds
    this.checkAlertingThresholds(operationName);
  }

  /**
   * Task 7.3: Check if failure counts exceed alerting thresholds
   */
  private checkAlertingThresholds(operationName: string): void {
    const failureInfo = InitialComparativeReportService.failureCounts.get(operationName);
    if (!failureInfo) return;

    const timeWindow = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    const windowStart = now - timeWindow;

    // Reset counter if failures are old
    if (failureInfo.firstFailure.getTime() < windowStart) {
      failureInfo.count = 1;
      failureInfo.firstFailure = new Date();
    }

    // Alert thresholds
    const criticalThreshold = 10; // 10 failures in 30 minutes
    const warningThreshold = 5;   // 5 failures in 30 minutes

    if (failureInfo.count >= criticalThreshold) {
      this.triggerCriticalAlert(operationName, failureInfo);
    } else if (failureInfo.count >= warningThreshold && failureInfo.count % warningThreshold === 0) {
      this.triggerWarningAlert(operationName, failureInfo);
    }
  }

  /**
   * Task 7.3: Trigger critical alerts for persistent failures
   */
  private triggerCriticalAlert(operationName: string, failureInfo: { count: number; firstFailure: Date }): void {
    const alertContext = {
      alertType: 'CRITICAL',
      operationName,
      failureCount: failureInfo.count,
      timeWindow: '30 minutes',
      firstFailure: failureInfo.firstFailure.toISOString(),
      severity: 'critical'
    };

    logger.error(`CRITICAL ALERT: Snapshot operation failing persistently`, new Error(`${operationName} has failed ${failureInfo.count} times`), alertContext);

    // In a production system, this would integrate with alerting systems like PagerDuty, Slack, etc.
    console.error(`🚨 CRITICAL ALERT: ${operationName} failing persistently (${failureInfo.count} failures)`);
  }

  /**
   * Task 7.3: Trigger warning alerts for moderate failures
   */
  private triggerWarningAlert(operationName: string, failureInfo: { count: number; firstFailure: Date }): void {
    const alertContext = {
      alertType: 'WARNING',
      operationName,
      failureCount: failureInfo.count,
      timeWindow: '30 minutes',
      firstFailure: failureInfo.firstFailure.toISOString(),
      severity: 'warning'
    };

    logger.warn(`WARNING ALERT: Snapshot operation experiencing issues`, alertContext);

    // In a production system, this would send notifications to monitoring channels
    console.warn(`⚠️  WARNING: ${operationName} experiencing issues (${failureInfo.count} failures)`);
  }

  /**
   * PHASE 4.1: Capture fresh competitor snapshots for the project using optimized service
   */
  async captureCompetitorSnapshots(projectId: string): Promise<SnapshotCaptureResult> {
    const context = { projectId, operation: 'captureCompetitorSnapshots' };

    try {
      logger.info('Starting optimized competitor snapshot capture', context);

      // Use the optimized snapshot capture service with high priority for initial reports
      const optimizedResult = await competitorSnapshotOptimizer.captureCompetitorSnapshotsOptimized(
        projectId,
        {
          priority: 'high',
          projectId,
          isInitialReport: true,
          maxWaitTime: 60000 // 60 seconds for initial reports
        }
      );

      logger.info('Optimized competitor snapshot capture completed', {
        ...context,
        result: {
          success: optimizedResult.success,
          capturedCount: optimizedResult.capturedCount,
          totalCompetitors: optimizedResult.totalCompetitors,
          captureTime: optimizedResult.captureTime,
          rateLimitingTriggered: optimizedResult.rateLimitingTriggered,
          circuitBreakerActivated: optimizedResult.circuitBreakerActivated,
          resourceUsage: optimizedResult.resourceUsage
        }
      });

      // Return the optimized result which extends SnapshotCaptureResult
      return optimizedResult;

    } catch (error) {
      logger.error('Failed to capture competitor snapshots with optimizer', error as Error, context);
      
      // Fallback result matching OptimizedSnapshotResult structure
      return {
        success: false,
        capturedCount: 0,
        totalCompetitors: 0,
        captureTime: 0,
        failures: [{
          competitorId: 'unknown',
          competitorName: 'unknown',
          domain: 'unknown',
          error: error instanceof Error ? error.message : String(error),
          errorType: 'unknown',
          attemptedAt: new Date(),
          fallbackUsed: false
        }],
        rateLimitingTriggered: false,
        circuitBreakerActivated: false,
        resourceUsage: {
          avgTimePerSnapshot: 0,
          maxConcurrentReached: 0,
          throttledDomains: []
        }
      };
    }
  }

  /**
   * Ensure basic competitor data is available (with fallbacks)
   */
  async ensureBasicCompetitorData(projectId: string): Promise<DataAvailabilityResult> {
    const context = { projectId, operation: 'ensureBasicCompetitorData' };

    try {
      logger.info('Ensuring basic competitor data availability', context);

      // Get competitors with their snapshots
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          competitors: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const totalCompetitors = project.competitors.length;
      if (totalCompetitors === 0) {
        return {
          hasMinimumData: false,
          dataCompletenessScore: 0,
          availableCompetitors: 0,
          totalCompetitors: 0,
          dataFreshness: 'basic'
        };
      }

      // Check data availability and freshness
      let availableCompetitors = 0;
      let freshSnapshots = 0;
      let existingSnapshots = 0;
      
      const now = new Date();
      const freshThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours

      for (const competitor of project.competitors) {
        if (competitor.snapshots.length > 0) {
          availableCompetitors++;
          
          const latestSnapshot = competitor.snapshots[0];
          if (latestSnapshot && latestSnapshot.createdAt > freshThreshold) {
            freshSnapshots++;
          } else {
            existingSnapshots++;
          }
        }
      }

      // Determine data freshness
      let dataFreshness: 'new' | 'existing' | 'mixed' | 'basic';
      if (freshSnapshots === availableCompetitors && freshSnapshots > 0) {
        dataFreshness = 'new';
      } else if (freshSnapshots > 0 && existingSnapshots > 0) {
        dataFreshness = 'mixed';
      } else if (existingSnapshots > 0) {
        dataFreshness = 'existing';
      } else {
        dataFreshness = 'basic';
      }

      // Calculate completeness score
      let dataCompletenessScore = 0;
      if (totalCompetitors > 0) {
        const availabilityScore = (availableCompetitors / totalCompetitors) * 70; // 70% for availability
        const freshnessScore = (freshSnapshots / totalCompetitors) * 30; // 30% for freshness
        dataCompletenessScore = Math.round(availabilityScore + freshnessScore);
      }

      const hasMinimumData = availableCompetitors > 0;

      const result: DataAvailabilityResult = {
        hasMinimumData,
        dataCompletenessScore,
        availableCompetitors,
        totalCompetitors,
        dataFreshness
      };

      logger.info('Basic competitor data availability checked', {
        ...context,
        result
      });

      return result;

    } catch (error) {
      logger.error('Failed to ensure basic competitor data', error as Error, context);
      throw error;
    }
  }

  /**
   * Build analysis input from project data
   */
  private async buildAnalysisInput(projectId: string, smartCollectionResult: any): Promise<ComparativeAnalysisInput> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        products: {
          include: {
            snapshots: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        },
        competitors: {
          include: {
            snapshots: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (project.products.length === 0) {
      throw new Error(`No products found for project ${projectId}`);
    }

    const product = project.products[0];
    if (!product) {
      throw new Error(`No product found for project ${projectId}`);
    }
    
    const productSnapshot = product.snapshots[0];
    if (!productSnapshot) {
      throw new Error(`No product snapshot found for project ${projectId}`);
    }

    // Build competitor data with PHASE 4.3: Intelligent caching integration
    const competitors = await Promise.all(
      project.competitors
        .filter(comp => comp.snapshots.length > 0)
        .map(async comp => {
          // PHASE 4.3: Cache competitor basic data for faster fallback scenarios
          const basicData = {
            id: comp.id,
            name: comp.name,
            website: comp.website,
            ...(comp.industry && { industry: comp.industry }),
            ...(comp.description && { description: comp.description }),
            lastUpdated: comp.updatedAt,
            dataFreshness: 'fresh' as const,
            priority: 'normal' as const
          };
          
          try {
            await intelligentCachingService.cacheCompetitorBasicData(comp.id, basicData);
          } catch (error) {
            logger.warn('Failed to cache competitor basic data', {
              competitorId: comp.id,
              error: (error as Error).message
            });
          }

          // PHASE 4.3: Cache snapshot metadata for efficiency
          const latestSnapshot = comp.snapshots[0];
          if (latestSnapshot) {
            const snapshotMetadata = {
              competitorId: comp.id,
              snapshotId: latestSnapshot.id,
              capturedAt: latestSnapshot.createdAt,
              isSuccessful: true,
              dataSize: JSON.stringify(latestSnapshot.metadata || {}).length,
              contentHash: latestSnapshot.id, // Use snapshot ID as content hash
              captureMethod: 'full' as const,
              websiteComplexity: this.determineWebsiteComplexity(comp.website),
              captureTime: 0 // Historical data, capture time unknown
            };
            
            try {
              await intelligentCachingService.cacheSnapshotMetadata(comp.id, snapshotMetadata);
            } catch (error) {
              logger.warn('Failed to cache snapshot metadata', {
                competitorId: comp.id,
                snapshotId: latestSnapshot.id,
                error: (error as Error).message
              });
            }
          }

          return {
            competitor: {
              id: comp.id,
              name: comp.name,
              website: comp.website,
              description: comp.description,
              industry: comp.industry,
              employeeCount: comp.employeeCount,
              revenue: comp.revenue,
              founded: comp.founded,
              headquarters: comp.headquarters,
              socialMedia: comp.socialMedia,
              createdAt: comp.createdAt,
              updatedAt: comp.updatedAt
            } as Competitor,
            snapshot: latestSnapshot ? {
              id: latestSnapshot.id,
              competitorId: latestSnapshot.competitorId,
              metadata: latestSnapshot.metadata,
              createdAt: latestSnapshot.createdAt,
              updatedAt: latestSnapshot.updatedAt
            } as CompetitorSnapshot : {} as CompetitorSnapshot
          };
        })
    );

    return {
      product: {
        id: product.id,
        name: product.name,
        website: product.website,
        positioning: product.positioning,
        customerData: product.customerData,
        userProblem: product.userProblem,
        industry: product.industry
      },
      productSnapshot: productSnapshot as ProductSnapshot,
      competitors,
      analysisConfig: {
        focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
        depth: 'comprehensive',
        includeRecommendations: true
      }
    };
  }

  /**
   * Build partial data info from smart collection result for partial data report generation
   */
  private buildPartialDataInfo(smartCollectionResult: any): PartialDataInfo {
    const dataGaps: DataGap[] = [];

    // Identify data gaps based on smart collection results
    if (smartCollectionResult.competitorData.freshSnapshots === 0) {
      dataGaps.push({
        area: 'Competitor Website Snapshots',
        description: 'No fresh competitor website snapshots captured. UX and visual comparison analysis will be limited.',
        impact: 'high',
        recommendation: 'Capture fresh competitor website snapshots to enable comprehensive UX analysis',
        canBeImproved: true
      });
    }

    if (smartCollectionResult.competitorData.availableCompetitors < smartCollectionResult.competitorData.totalCompetitors) {
      dataGaps.push({
        area: 'Competitor Data Coverage',
        description: `Only ${smartCollectionResult.competitorData.availableCompetitors}/${smartCollectionResult.competitorData.totalCompetitors} competitors have sufficient data for analysis.`,
        impact: 'medium',
        recommendation: 'Collect additional competitor information to improve analysis completeness',
        canBeImproved: true
      });
    }

    if (smartCollectionResult.dataCompletenessScore < 50) {
      dataGaps.push({
        area: 'Overall Data Quality',
        description: 'Low overall data completeness may affect analysis accuracy and strategic insights.',
        impact: 'high',
        recommendation: 'Prioritize data collection for missing competitors and product information',
        canBeImproved: true
      });
    }

    return {
      dataCompletenessScore: smartCollectionResult.dataCompletenessScore,
      dataFreshness: smartCollectionResult.dataFreshness,
      availableData: {
        hasProductData: smartCollectionResult.productData.available,
        hasCompetitorData: smartCollectionResult.competitorData.availableCompetitors > 0,
        hasSnapshots: smartCollectionResult.competitorData.freshSnapshots > 0,
        competitorCount: smartCollectionResult.competitorData.totalCompetitors,
        freshSnapshotCount: smartCollectionResult.competitorData.freshSnapshots
      },
      missingData: smartCollectionResult.missingData || [],
      dataGaps,
      qualityTier: this.determineQualityTier(smartCollectionResult.dataCompletenessScore)
    };
  }

  /**
   * Determine quality tier based on data completeness score
   */
  private determineQualityTier(completenessScore: number): 'basic' | 'enhanced' | 'fresh' | 'complete' {
    if (completenessScore >= 85) return 'complete';
    if (completenessScore >= 70) return 'fresh';
    if (completenessScore >= 50) return 'enhanced';
    return 'basic';
  }

  /**
   * Enhance report metadata for initial generation
   */
  private enhanceReportForInitialGeneration(
    report: ComparativeReport,
    enhancementData: {
      projectId: string;
      isInitialReport: boolean;
      dataCompletenessScore: number;
      dataFreshness: string;
      competitorSnapshotsCaptured: number;
      generationTime: number;
      usedPartialDataGeneration?: boolean;
    }
  ): ComparativeReport {
    // Update the metadata to include initial report specific information
    const enhancedMetadata: ComparativeReportMetadata = {
      ...report.metadata,
      reportVersion: '1.0-initial',
      // Add custom properties for initial reports (would need to extend the type)
    };

    return {
      ...report,
      metadata: enhancedMetadata,
      // Mark as initial report in the title
      title: `${report.title} (Initial Report)`,
      description: `${report.description} - Generated immediately upon project creation with ${enhancementData.dataCompletenessScore}% data completeness.`
    };
  }

  /**
   * PHASE 4.3: Determine website complexity for caching optimization
   */
  private determineWebsiteComplexity(website: string): 'basic' | 'ecommerce' | 'saas' | 'marketplace' {
    const domain = website.toLowerCase();
    
    // Marketplace sites
    if (domain.includes('marketplace') || 
        domain.includes('uber') || 
        domain.includes('airbnb') || 
        domain.includes('upwork')) {
      return 'marketplace';
    }
    
    // SaaS platforms
    if (domain.includes('salesforce') || 
        domain.includes('hubspot') || 
        domain.includes('slack') ||
        domain.includes('saas') ||
        domain.includes('software')) {
      return 'saas';
    }
    
    // E-commerce sites
    if (domain.includes('shop') || 
        domain.includes('store') || 
        domain.includes('commerce') ||
        domain.includes('buy') ||
        domain.includes('cart')) {
      return 'ecommerce';
    }
    
    // Default to basic
    return 'basic';
  }

  /**
   * Determine snapshot timeout based on website complexity
   * PHASE 5.3.1: Now uses configurable base timeout with complexity multipliers
   */
  private determineSnapshotTimeout(website: string): number {
    const config = this.configService?.getCurrentConfig() || {};
    const baseTimeout = (config as any).SNAPSHOT_CAPTURE_TIMEOUT || 30000; // Default 30 seconds
    
    const domain = website.toLowerCase();
    
    // Dynamic marketplaces (150% of base timeout)
    if (domain.includes('marketplace') || 
        domain.includes('uber') || 
        domain.includes('airbnb') || 
        domain.includes('upwork')) {
      return Math.round(baseTimeout * 1.5);
    }
    
    // Complex SaaS/e-commerce (125% of base timeout)
    if (domain.includes('saas') || 
        domain.includes('crm') || 
        domain.includes('salesforce') ||
        domain.includes('shop') ||
        domain.includes('commerce')) {
      return Math.round(baseTimeout * 1.25);
    }
    
    // Basic websites (75% of base timeout)
    if (domain.includes('blog') || 
        domain.includes('news') || 
        domain.includes('simple')) {
      return Math.round(baseTimeout * 0.75);
    }
    
    // Default timeout
    return baseTimeout;
  }
} 