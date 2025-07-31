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
import { shouldUseUnifiedAnalysisService, featureFlags } from '../migration/FeatureFlags';
import { SmartDataCollectionService } from './smartDataCollectionService';
import { dataService } from '../domains/DataService';
import { dataServiceFeatureFlags } from '../migration/DataServiceFeatureFlags';
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
// PHASE 4.1: Enhanced with optimization features
export interface SnapshotCaptureResult extends OptimizedSnapshotResult {
  // Additional fields for backward compatibility
}

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
      logger.warn('Failed to initialize UnifiedAnalysisService, will fallback to legacy services', error as Error);
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
      const enhancedReport = this.enhanceReportForInitialGeneration(finalReport, smartCollectionResult, Date.now() - startTime);

      // 6. Quality validation with fallback
      await this.validateReportQualityWithFallback(enhancedReport, reportLogger);

      // 7. Final status update
      try {
        realTimeStatusService.sendCompletionUpdate(
          projectId,
          true,
          enhancedReport.id,
          enhancedReport.title,
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
        summary: 'This is an emergency fallback report generated due to system issues. Limited analysis available.',
        content: `# Emergency Comparative Analysis Report

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
        analysis: null,
                 metadata: {
           competitorIds: project.competitors?.map(c => c.id) || [],
           generatedAt: new Date(),
           reportType: 'emergency_fallback',
           template: options.template || 'comprehensive',
           processingTime: 0,
           dataCompletenessScore: 0,
           fallbackReason: originalError.message
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
           report.analysis,
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
                contains: 'Competitive Analysis',
                mode: 'insensitive'
              }
            },
            {
              name: {
                contains: 'comparative',
                mode: 'insensitive'
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

      // Convert database report to ComparativeReport format
      const latestVersion = recentReport.versions[0];
      if (!latestVersion) {
        return null;
      }

      const reportContent = latestVersion.content as any;
      
      return {
        id: recentReport.id,
        title: recentReport.name,
        description: recentReport.description || '',
        projectId: recentReport.projectId || '',
        productId: '', // May not be available in legacy reports
        analysisId: reportContent.metadata?.analysisId || recentReport.id,
        metadata: {
          productName: reportContent.metadata?.productName || '',
          productUrl: reportContent.metadata?.productUrl || '',
          competitorCount: reportContent.metadata?.competitorCount || 0,
          analysisDate: new Date(reportContent.metadata?.analysisDate || recentReport.createdAt),
          reportGeneratedAt: recentReport.createdAt,
          analysisId: reportContent.metadata?.analysisId || recentReport.id,
          analysisMethod: reportContent.metadata?.analysisMethod || 'standard',
          confidenceScore: reportContent.metadata?.confidenceScore || 70,
          dataQuality: reportContent.metadata?.dataQuality || 'medium',
          reportVersion: reportContent.metadata?.reportVersion || '1.0',
          focusAreas: reportContent.metadata?.focusAreas || [],
          analysisDepth: reportContent.metadata?.analysisDepth || 'standard'
        },
        sections: reportContent.sections || [],
        executiveSummary: reportContent.executiveSummary || '',
        keyFindings: reportContent.keyFindings || [],
        strategicRecommendations: reportContent.strategicRecommendations || {
          immediate: [],
          shortTerm: [],
          longTerm: [],
          priorityScore: 50
        },
        competitiveIntelligence: reportContent.competitiveIntelligence || {
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
      const hasProductData = hasProduct && project.products[0].snapshots.length > 0;
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
          if (latestSnapshot.createdAt > freshThreshold) {
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
            industry: comp.industry || undefined,
            description: comp.description || undefined,
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
          if (comp.snapshots[0]) {
            const snapshotMetadata = {
              competitorId: comp.id,
              snapshotId: comp.snapshots[0].id,
              capturedAt: comp.snapshots[0].createdAt,
              isSuccessful: true,
              dataSize: JSON.stringify(comp.snapshots[0].metadata || {}).length,
              contentHash: comp.snapshots[0].id, // Use snapshot ID as content hash
              captureMethod: 'full' as const,
              websiteComplexity: this.determineWebsiteComplexity(comp.website),
              captureTime: 0 // Historical data, capture time unknown
            };
            
            try {
              await intelligentCachingService.cacheSnapshotMetadata(comp.id, snapshotMetadata);
            } catch (error) {
              logger.warn('Failed to cache snapshot metadata', {
                competitorId: comp.id,
                snapshotId: comp.snapshots[0].id,
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
            snapshot: {
              id: comp.snapshots[0].id,
              competitorId: comp.snapshots[0].competitorId,
              metadata: comp.snapshots[0].metadata,
              createdAt: comp.snapshots[0].createdAt,
              updatedAt: comp.snapshots[0].updatedAt
            } as CompetitorSnapshot
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
    const baseTimeout = config.SNAPSHOT_CAPTURE_TIMEOUT;
    
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