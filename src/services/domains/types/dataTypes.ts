/**
 * Data Domain Types - Unified Type System
 * Consolidates types from WebScraperService, ProductScrapingService, and SmartDataCollectionService
 * 
 * Task 1.3: Create Data Domain Types
 * - Consolidate all data-related TypeScript interfaces from existing services
 * - Create unified DataRequest, DataResponse, ScrapingConfig types
 * - Ensure type compatibility with existing consumers
 */

import { ProductSnapshot } from '@/types/product';
import { Competitor, CompetitorSnapshot } from '@/types/analysis';
import { Product } from '@prisma/client';
import type { Browser, Page } from 'puppeteer';

// ============================================================================
// CORE UNIFIED TYPES
// ============================================================================

/**
 * Unified Data Request - Primary interface for all data collection operations
 */
export interface DataRequest {
  // Request identification
  requestId?: string;
  correlationId?: string;
  
  // Collection type routing
  collectionType: DataCollectionType;
  
  // Target identification
  projectId?: string;
  targetId?: string;
  url?: string;
  
  // Collection configuration
  options?: DataCollectionOptions;
  
  // Priority and freshness options
  priority?: DataCollectionPriority;
  forceFreshData?: boolean;
  dataCutoff?: Date;
  
  // Context and metadata
  context?: Record<string, any>;
  timeout?: number;
}

/**
 * Unified Data Response - Primary interface for all data collection results
 */
export interface DataResponse {
  // Request identification
  requestId: string;
  correlationId: string;
  collectionType: DataCollectionType;
  
  // Collection results
  success: boolean;
  data?: CollectedData;
  snapshots?: DataSnapshot[];
  
  // Quality and metadata
  metadata: DataCollectionMetadata;
  quality: DataQuality;
  
  // Specialized results (based on collection type)
  scrapingResult?: ScrapingResult;
  productResult?: ProductScrapingResult;
  smartCollectionResult?: SmartCollectionResult;
  
  // Error information
  error?: DataError;
}

/**
 * Unified Scraping Configuration - Consolidated configuration for all data collection
 */
export interface ScrapingConfig {
  // Browser Configuration
  browserConfig: BrowserConfiguration;
  
  // Scraping behavior settings
  scrapingBehavior: ScrapingBehavior;
  
  // Retry and error handling
  retryConfig: RetryConfiguration;
  
  // Content extraction settings
  contentConfig: ContentConfiguration;
  
  // Performance and resource settings
  performance: PerformanceConfiguration;
  
  // Data validation and quality
  validation: ValidationConfiguration;
}

// ============================================================================
// DATA COLLECTION TYPES AND ENUMS
// ============================================================================

/**
 * Data Collection Types - Route requests to appropriate sub-modules
 */
export enum DataCollectionType {
  WEB_SCRAPING = 'web_scraping',           // Basic URL scraping
  PRODUCT_SCRAPING = 'product_scraping',   // Product-specific scraping
  COMPETITOR_SCRAPING = 'competitor_scraping', // Competitor-specific scraping
  SMART_COLLECTION = 'smart_collection',   // Intelligent data prioritization
  BATCH_SCRAPING = 'batch_scraping'        // Multiple targets at once
}

/**
 * Data Collection Priority - From SmartDataCollectionService
 */
export enum DataCollectionPriority {
  PRODUCT_FORM_DATA = 1,       // Immediate product data from form input
  FRESH_COMPETITOR_SNAPSHOTS = 2,  // New competitor snapshots (REQUIRED)
  FAST_COMPETITOR_COLLECTION = 3,  // Essential competitor info only
  EXISTING_SNAPSHOTS = 4,      // Fallback to existing data
  BASIC_COMPETITOR_METADATA = 5    // Last resort - basic info only
}

/**
 * Scraping Status - Browser and operation status
 */
export enum ScrapingStatus {
  INITIALIZED = 'initialized',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  RETRYING = 'retrying'
}

// ============================================================================
// BROWSER AND SCRAPING CONFIGURATION
// ============================================================================

/**
 * Browser Configuration - Puppeteer settings
 */
export interface BrowserConfiguration {
  headless: boolean;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  timeout: number;
  enableJavaScript: boolean;
  blockedResourceTypes: string[];
  launchArgs: string[];
}

/**
 * Scraping Behavior Configuration
 */
export interface ScrapingBehavior {
  takeScreenshot: boolean;
  extractText: boolean;
  extractMetadata: boolean;
  followRedirects: boolean;
  handleCookies: boolean;
  waitForSelector?: string;
  customSelectors?: Record<string, string>;
}

/**
 * Retry Configuration - Enhanced retry logic
 */
export interface RetryConfiguration {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBackoff: boolean;
  retryOnTimeout: boolean;
  retryOnNetworkError: boolean;
  retryOnServerError: boolean;
}

/**
 * Content Configuration - What to extract
 */
export interface ContentConfiguration {
  extractFullHTML: boolean;
  extractText: boolean;
  extractTitle: boolean;
  extractMetaTags: boolean;
  extractImages: boolean;
  minContentLength: number;
  maxContentLength: number;
  contentFilters: string[];
}

/**
 * Performance Configuration
 */
export interface PerformanceConfiguration {
  maxConcurrentPages: number;
  pagePoolSize: number;
  memoryThreshold: number;
  cleanupInterval: number;
  resourceOptimization: boolean;
}

/**
 * Validation Configuration
 */
export interface ValidationConfiguration {
  validateContentLength: boolean;
  validateHTML: boolean;
  validateResponseCode: boolean;
  qualityChecks: boolean;
  customValidators: string[];
}

// ============================================================================
// DATA COLLECTION RESULTS
// ============================================================================

/**
 * Collected Data - Base interface for all collected data
 */
export interface CollectedData {
  url: string;
  timestamp: Date;
  correlationId: string;
  
  // Content data
  html?: string;
  text?: string;
  title?: string;
  metadata?: ScrapingMetadata;
  
  // Quality metrics
  contentLength: number;
  extractionTime: number;
  qualityScore: number;
}

/**
 * Scraping Result - From WebScrapingModule
 */
export interface ScrapingResult extends CollectedData {
  screenshot?: Buffer | undefined;
  responseCode: number;
  responseHeaders: Record<string, string>;
  redirectChain: string[];
  timing: ScrapingTiming;
}

/**
 * Product Scraping Result - From ProductScrapingModule
 */
export interface ProductScrapingResult {
  productId: string;
  snapshot: ProductSnapshot;
  validationPassed: boolean;
  retryCount: number;
  scrapingDuration: number;
  contentQuality: ContentQuality;
}

/**
 * Smart Collection Result - From SmartCollectionModule
 */
export interface SmartCollectionResult {
  projectId: string;
  collectionStrategy: DataCollectionStrategy;
  dataCompletenessScore: number;
  dataFreshness: DataFreshness;
  collectionTime: number;
  priorityBreakdown: PriorityBreakdown;
  productData?: ProductCollectionResult;
  competitorData?: CompetitorCollectionResult[];
}

// ============================================================================
// METADATA AND QUALITY TYPES
// ============================================================================

/**
 * Data Collection Metadata
 */
export interface DataCollectionMetadata {
  collectionTimestamp: Date;
  collectionMethod: string;
  browserVersion: string;
  userAgent: string;
  sourceSystem: string;
  dataVersion: string;
  processingTime: number;
  resourceUsage: ResourceUsage;
}

/**
 * Data Quality Metrics
 */
export interface DataQuality {
  completenessScore: number;
  freshnessScore: number;
  accuracyScore: number;
  consistencyScore: number;
  overallScore: number;
  qualityIssues: QualityIssue[];
  validationResults: ValidationResult[];
}

/**
 * Scraping Metadata - Enhanced metadata from scraping operations
 */
export interface ScrapingMetadata {
  url: string;
  finalUrl: string;
  responseCode: number;
  responseHeaders: Record<string, string>;
  loadTime: number;
  renderTime: number;
  extractionTime: number;
  retryCount: number;
  browserInfo: BrowserInfo;
  networkInfo: NetworkInfo;
}

// ============================================================================
// SUB-MODULE INTERFACES
// ============================================================================

/**
 * WebScrapingModule Interface - Core Puppeteer operations
 */
export interface WebScrapingInterface {
  // Browser lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  
  // Core scraping methods
  scrapeUrl(url: string, options?: ScrapingOptions): Promise<ScrapingResult>;
  scrapeMultipleUrls(urls: string[], options?: ScrapingOptions): Promise<ScrapingResult[]>;
  
  // Specialized scraping methods
  scrapeCompetitor(competitorId: string, options?: ScrapingOptions): Promise<string>;
  scrapeAllCompetitors(options?: ScrapingOptions): Promise<string[]>;
  
  // Browser management
  getBrowserStatus(): Promise<BrowserStatus>;
  restartBrowser(): Promise<void>;
}

/**
 * ProductScrapingModule Interface - Product-specific operations
 */
export interface ProductScrapingInterface {
  // Product scraping methods
  scrapeProductWebsite(productId: string): Promise<ProductSnapshot>;
  scrapeProductById(productId: string, options?: ProductScrapingOptions): Promise<ProductSnapshot>;
  
  // Data validation and quality
  ensureRecentProductData(productId: string): Promise<boolean>;
  validateProductData(productId: string): Promise<ValidationResult>;
  
  // Batch operations
  scrapeMultipleProducts(productIds: string[]): Promise<ProductSnapshot[]>;
  
  // Health and status
  getProductScrapingStatus(): Promise<ProductScrapingStatus>;
}

/**
 * SmartCollectionModule Interface - Intelligent data collection
 */
export interface SmartCollectionInterface {
  // Smart collection methods
  collectProjectData(projectId: string, options?: SmartCollectionOptions): Promise<SmartCollectionResult>;
  collectCompetitorDataWithPriorities(projectId: string, options?: SmartCollectionOptions): Promise<CompetitorCollectionResult[]>;
  
  // Data quality and analysis
  calculateDataCompletenessScore(productData: any, competitorData: any): number;
  determineDataFreshness(productData: any, competitorData: any): DataFreshness;
  
  // Strategy and optimization
  optimizeCollectionStrategy(projectId: string): Promise<DataCollectionStrategy>;
  checkDataFreshness(projectId: string): Promise<FreshnessStatus>;
}

// ============================================================================
// OPTIONS AND CONFIGURATION INTERFACES
// ============================================================================

/**
 * General Data Collection Options
 */
export interface DataCollectionOptions {
  priority?: DataCollectionPriority;
  timeout?: number;
  forceFreshData?: boolean;
  maxRetries?: number;
  enableCaching?: boolean;
  customConfig?: Record<string, any>;
}

/**
 * Scraping Options - For WebScrapingModule
 */
export interface ScrapingOptions {
  userAgent?: string;
  timeout?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  enableJavaScript?: boolean;
  takeScreenshot?: boolean;
  blockedResourceTypes?: string[];
  retries?: number;
  retryDelay?: number;
  waitForSelector?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Product Scraping Options - For ProductScrapingModule
 */
export interface ProductScrapingOptions extends ScrapingOptions {
  validateContent?: boolean;
  minContentLength?: number;
  qualityChecks?: boolean;
  enhancedRetry?: boolean;
  preserveMetadata?: boolean;
}

/**
 * Smart Collection Options - For SmartCollectionModule
 */
export interface SmartCollectionOptions extends DataCollectionOptions {
  collectionStrategy?: DataCollectionStrategy;
  priorityOverride?: DataCollectionPriority;
  fallbackBehavior?: FallbackBehavior;
  qualityThreshold?: number;
  freshnessThreshold?: number;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface DataSnapshot {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  source: string;
  quality: number;
}

export interface ScrapingTiming {
  startTime: Date;
  endTime: Date;
  totalTime: number;
  networkTime: number;
  renderTime: number;
  extractionTime: number;
}

export interface ContentQuality {
  completeness: number;
  accuracy: number;
  freshness: number;
  consistency: number;
  issues: string[];
}

export interface DataCollectionStrategy {
  name: string;
  priorities: DataCollectionPriority[];
  fallbackStrategy: string;
  qualityThreshold: number;
  timeoutThreshold: number;
}

export interface DataFreshness {
  overallStatus: 'FRESH' | 'STALE' | 'EXPIRED';
  productFreshness: number;
  competitorFreshness: number;
  lastUpdate: Date;
  refreshRecommended: boolean;
}

export interface PriorityBreakdown {
  [key in DataCollectionPriority]: {
    attempted: number;
    successful: number;
    failed: number;
    averageTime: number;
  };
}

export interface ProductCollectionResult {
  productId: string;
  success: boolean;
  data?: ProductSnapshot;
  error?: string;
  quality: ContentQuality;
}

export interface CompetitorCollectionResult {
  competitorId: string;
  success: boolean;
  data?: CompetitorSnapshot;
  error?: string;
  quality: ContentQuality;
  priority: DataCollectionPriority;
}

export interface FreshnessStatus {
  requiresUpdate: boolean;
  lastCheck: Date;
  nextCheck: Date;
  overallStatus: string;
  details: Record<string, any>;
}

export interface BrowserStatus {
  isInitialized: boolean;
  activePages: number;
  memoryUsage: number;
  uptime: number;
  version: string;
}

export interface BrowserInfo {
  version: string;
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
}

export interface NetworkInfo {
  connectionType: string;
  effectiveType: string;
  rtt: number;
  downlink: number;
}

export interface ResourceUsage {
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface QualityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationResult {
  field: string;
  valid: boolean;
  error?: string;
  warning?: string;
  suggestion?: string;
}

export interface ProductScrapingStatus {
  activeProducts: number;
  queuedProducts: number;
  completedToday: number;
  failureRate: number;
  averageTime: number;
}

export enum FallbackBehavior {
  USE_EXISTING = 'use_existing',
  RETRY_LOWER_PRIORITY = 'retry_lower_priority',
  FAIL_FAST = 'fail_fast',
  PARTIAL_SUCCESS = 'partial_success'
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface DataError {
  code: DataErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  correlationId: string;
  recoverable: boolean;
  suggestions?: string[];
}

export enum DataErrorCode {
  BROWSER_INITIALIZATION_FAILED = 'BROWSER_INITIALIZATION_FAILED',
  SCRAPING_TIMEOUT = 'SCRAPING_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTENT_VALIDATION_FAILED = 'CONTENT_VALIDATION_FAILED',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  BROWSER_CRASH = 'BROWSER_CRASH',
  MEMORY_EXHAUSTED = 'MEMORY_EXHAUSTED',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_URL = 'INVALID_URL',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED'
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_SCRAPING_CONFIG: ScrapingConfig = {
  browserConfig: {
    headless: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewportWidth: 1920,
    viewportHeight: 1080,
    timeout: 30000,
    enableJavaScript: true,
    blockedResourceTypes: ['image', 'font', 'media'],
    launchArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  },
  scrapingBehavior: {
    takeScreenshot: false,
    extractText: true,
    extractMetadata: true,
    followRedirects: true,
    handleCookies: false
  },
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialBackoff: true,
    retryOnTimeout: true,
    retryOnNetworkError: true,
    retryOnServerError: false
  },
  contentConfig: {
    extractFullHTML: true,
    extractText: true,
    extractTitle: true,
    extractMetaTags: true,
    extractImages: false,
    minContentLength: 100,
    maxContentLength: 10000000,
    contentFilters: []
  },
  performance: {
    maxConcurrentPages: 5,
    pagePoolSize: 10,
    memoryThreshold: 500000000, // 500MB
    cleanupInterval: 60000, // 1 minute
    resourceOptimization: true
  },
  validation: {
    validateContentLength: true,
    validateHTML: true,
    validateResponseCode: true,
    qualityChecks: true,
    customValidators: []
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate data collection request
 */
export function validateDataRequest(request: DataRequest): boolean {
  if (!request.collectionType) return false;
  if (!request.correlationId) return false;
  
  switch (request.collectionType) {
    case DataCollectionType.WEB_SCRAPING:
      return !!request.url;
    case DataCollectionType.PRODUCT_SCRAPING:
      return !!request.targetId;
    case DataCollectionType.SMART_COLLECTION:
      return !!request.projectId;
    default:
      return false;
  }
}

/**
 * Check if collection type is valid
 */
export function isDataCollectionType(type: string): type is DataCollectionType {
  return Object.values(DataCollectionType).includes(type as DataCollectionType);
}

/**
 * Generate correlation ID for data operations
 */
export function generateDataCorrelationId(): string {
  return `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate overall data quality score
 */
export function calculateOverallQuality(quality: DataQuality): number {
  const weights = {
    completeness: 0.3,
    freshness: 0.25,
    accuracy: 0.25,
    consistency: 0.2
  };
  
  return (
    quality.completenessScore * weights.completeness +
    quality.freshnessScore * weights.freshness +
    quality.accuracyScore * weights.accuracy +
    quality.consistencyScore * weights.consistency
  );
} 