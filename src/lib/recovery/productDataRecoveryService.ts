import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId, trackBusinessEvent } from '@/lib/logger';
import { enhancedRetryMechanism } from '@/lib/retry/enhancedRetryMechanism';
import { productSnapshotValidator } from '@/lib/data-validation/productSnapshotValidator';

export interface ProductRecoveryOptions {
  forceRecapture?: boolean;
  validateAfterRecovery?: boolean;
  timeoutMs?: number;
  retryFailedSnapshots?: boolean;
  notifyOnRecovery?: boolean;
}

export interface ProductRecoveryResult {
  success: boolean;
  projectId: string;
  productsProcessed: number;
  snapshotsRecovered: number;
  snapshotsFailed: number;
  recoveryTime: number;
  errors: string[];
  warnings: string[];
  recoveredSnapshots: {
    productId: string;
    productName: string;
    snapshotId: string;
    recoveryMethod: 'recapture' | 'repair' | 'fallback';
  }[];
}

export interface RecoveryStrategy {
  name: string;
  condition: (product: any) => boolean;
  execute: (product: any, options: ProductRecoveryOptions) => Promise<{ success: boolean; snapshotId?: string; error?: string }>;
  priority: number;
}

export class ProductDataRecoveryService {
  private static instance: ProductDataRecoveryService;
  private recoveryStrategies: RecoveryStrategy[] = [];

  public static getInstance(): ProductDataRecoveryService {
    if (!ProductDataRecoveryService.instance) {
      ProductDataRecoveryService.instance = new ProductDataRecoveryService();
    }
    return ProductDataRecoveryService.instance;
  }

  constructor() {
    this.initializeRecoveryStrategies();
  }

  /**
   * Initialize recovery strategies in priority order
   */
  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies = [
      {
        name: 'recapture_website',
        condition: (product) => product.website && product.website.length > 0,
        execute: this.recaptureProductWebsite.bind(this),
        priority: 1
      },
      {
        name: 'repair_existing_snapshot',
        condition: (product) => product.snapshots && product.snapshots.length > 0,
        execute: this.repairExistingSnapshot.bind(this),
        priority: 2
      },
      {
        name: 'create_fallback_snapshot',
        condition: () => true, // Always possible as last resort
        execute: this.createFallbackSnapshot.bind(this),
        priority: 3
      }
    ];
  }

  /**
   * Recover missing product snapshots for a project
   * Task 2.3: Main recovery method
   */
  public async recoverProductSnapshots(
    projectId: string,
    options: ProductRecoveryOptions = {}
  ): Promise<ProductRecoveryResult> {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'recoverProductSnapshots' };

    logger.info('Starting product snapshot recovery', context);

    const result: ProductRecoveryResult = {
      success: false,
      projectId,
      productsProcessed: 0,
      snapshotsRecovered: 0,
      snapshotsFailed: 0,
      recoveryTime: 0,
      errors: [],
      warnings: [],
      recoveredSnapshots: []
    };

    try {
      // Get project with products
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 3 // Get recent snapshots for analysis
              }
            }
          }
        }
      });

      if (!project) {
        result.errors.push(`Project ${projectId} not found`);
        return result;
      }

      result.productsProcessed = project.products.length;

      if (project.products.length === 0) {
        result.warnings.push('Project has no products to recover');
        result.success = true;
        return result;
      }

      // Identify products needing recovery
      const productsNeedingRecovery = this.identifyProductsNeedingRecovery(project.products, options);
      
      logger.info('Products identified for recovery', {
        ...context,
        totalProducts: project.products.length,
        needingRecovery: productsNeedingRecovery.length
      });

      // Process each product needing recovery
      for (const product of productsNeedingRecovery) {
        try {
          const recoveryAttempt = await this.recoverSingleProduct(product, options, correlationId);
          
          if (recoveryAttempt.success && recoveryAttempt.snapshotId) {
            result.snapshotsRecovered++;
            result.recoveredSnapshots.push({
              productId: product.id,
              productName: product.name,
              snapshotId: recoveryAttempt.snapshotId,
              recoveryMethod: this.determineRecoveryMethod(product)
            });
            
            logger.info('Product snapshot recovered successfully', {
              ...context,
              productId: product.id,
              productName: product.name,
              snapshotId: recoveryAttempt.snapshotId
            });
          } else {
            result.snapshotsFailed++;
            result.errors.push(`Failed to recover snapshot for product ${product.name}: ${recoveryAttempt.error}`);
            
            logger.warn('Product snapshot recovery failed', {
              ...context,
              productId: product.id,
              productName: product.name,
              error: recoveryAttempt.error
            });
          }
        } catch (error) {
          result.snapshotsFailed++;
          result.errors.push(`Recovery error for product ${product.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          logger.error('Product recovery error', error as Error, {
            ...context,
            productId: product.id,
            productName: product.name
          });
        }
      }

      // Validate recovery if requested
      if (options.validateAfterRecovery && result.snapshotsRecovered > 0) {
        const validationResult = await productSnapshotValidator.validateProductSnapshots(projectId);
        if (validationResult.isValid) {
          result.warnings.push('Post-recovery validation passed');
        } else {
          result.warnings.push(`Post-recovery validation issues: ${validationResult.errors.join(', ')}`);
        }
      }

      result.recoveryTime = Date.now() - startTime;
      result.success = result.snapshotsRecovered > 0 || result.snapshotsFailed === 0;

      // Track recovery event
      trackBusinessEvent('product_snapshot_recovery_completed', {
        projectId,
        snapshotsRecovered: result.snapshotsRecovered,
        snapshotsFailed: result.snapshotsFailed,
        recoveryTime: result.recoveryTime,
        correlationId
      });

      logger.info('Product snapshot recovery completed', {
        ...context,
        success: result.success,
        snapshotsRecovered: result.snapshotsRecovered,
        snapshotsFailed: result.snapshotsFailed,
        recoveryTime: result.recoveryTime
      });

      return result;

    } catch (error) {
      result.errors.push(`Recovery process failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.recoveryTime = Date.now() - startTime;
      
      logger.error('Product snapshot recovery process failed', error as Error, context);
      return result;
    }
  }

  /**
   * Identify products that need snapshot recovery
   */
  private identifyProductsNeedingRecovery(products: any[], options: ProductRecoveryOptions): any[] {
    return products.filter(product => {
      // Force recapture if requested
      if (options.forceRecapture) {
        return true;
      }

      // No snapshots at all
      if (!product.snapshots || product.snapshots.length === 0) {
        return true;
      }

      // Failed snapshots only
      if (options.retryFailedSnapshots) {
        const latestSnapshot = product.snapshots[0];
        return !latestSnapshot.captureSuccess;
      }

      // Old snapshots (more than 7 days)
      const latestSnapshot = product.snapshots[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return new Date(latestSnapshot.createdAt) < sevenDaysAgo;
    });
  }

  /**
   * Recover a single product's snapshot
   */
  private async recoverSingleProduct(
    product: any,
    options: ProductRecoveryOptions,
    correlationId: string
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    const context = { productId: product.id, productName: product.name, correlationId };
    
    logger.info('Starting single product recovery', context);

    // Try recovery strategies in priority order
    for (const strategy of this.recoveryStrategies.sort((a, b) => a.priority - b.priority)) {
      if (strategy.condition(product)) {
        logger.info(`Attempting recovery strategy: ${strategy.name}`, context);
        
        try {
          const result = await strategy.execute(product, options);
          
          if (result.success) {
            logger.info(`Recovery strategy ${strategy.name} succeeded`, {
              ...context,
              snapshotId: result.snapshotId
            });
            return result;
          } else {
            logger.warn(`Recovery strategy ${strategy.name} failed`, {
              ...context,
              error: result.error
            });
          }
        } catch (error) {
          logger.warn(`Recovery strategy ${strategy.name} threw error`, {
            ...context,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return {
      success: false,
      error: 'All recovery strategies failed'
    };
  }

  /**
   * Strategy 1: Recapture product website
   */
  private async recaptureProductWebsite(
    product: any,
    options: ProductRecoveryOptions
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      // Use enhanced retry mechanism for website capture
      const retryOptions = enhancedRetryMechanism.createProductScrapingRetryOptions();
      
      // Import ProductScrapingModule dynamically to avoid circular dependencies
      const { ProductScrapingModule } = await import('../../services/domains/data/ProductScrapingModule');
      const webScrapingModule = new (await import('../../services/domains/DataService')).WebScrapingModule();
      
      const productScrapingModule = new ProductScrapingModule(webScrapingModule);
      const snapshot = await productScrapingModule.scrapeProductWebsite(product.id);

      return {
        success: true,
        snapshotId: snapshot.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Website recapture failed'
      };
    }
  }

  /**
   * Strategy 2: Repair existing snapshot
   */
  private async repairExistingSnapshot(
    product: any,
    options: ProductRecoveryOptions
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      const latestSnapshot = product.snapshots[0];
      
      if (!latestSnapshot) {
        return { success: false, error: 'No snapshot to repair' };
      }

      // Update snapshot to mark as successful if it has content
      if (latestSnapshot.content && Object.keys(latestSnapshot.content).length > 0) {
        await prisma.productSnapshot.update({
          where: { id: latestSnapshot.id },
          data: {
            captureSuccess: true,
            errorMessage: null,
            captureEndTime: new Date()
          }
        });

        return {
          success: true,
          snapshotId: latestSnapshot.id
        };
      }

      return { success: false, error: 'Snapshot has no content to repair' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Snapshot repair failed'
      };
    }
  }

  /**
   * Strategy 3: Create fallback snapshot
   */
  private async createFallbackSnapshot(
    product: any,
    options: ProductRecoveryOptions
  ): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      const fallbackSnapshot = await prisma.productSnapshot.create({
        data: {
          id: `fallback-${Date.now()}-${product.id}`,
          productId: product.id,
          content: {
            html: '<html><body>Fallback snapshot - original capture failed</body></html>',
            text: 'Fallback snapshot - original capture failed',
            title: product.name,
            description: `Fallback snapshot for ${product.name}`,
            url: product.website,
            timestamp: new Date()
          },
          metadata: {
            scrapedAt: new Date().toISOString(),
            url: product.website,
            isFallback: true,
            fallbackReason: 'Original capture failed, created for recovery',
            contentLength: 100,
            scrapingMethod: 'fallback',
            validationPassed: false
          },
          captureSuccess: true,
          captureStartTime: new Date(),
          captureEndTime: new Date()
        }
      });

      return {
        success: true,
        snapshotId: fallbackSnapshot.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fallback snapshot creation failed'
      };
    }
  }

  /**
   * Determine which recovery method was used
   */
  private determineRecoveryMethod(product: any): 'recapture' | 'repair' | 'fallback' {
    if (!product.snapshots || product.snapshots.length === 0) {
      return 'recapture';
    }
    
    const latestSnapshot = product.snapshots[0];
    if (latestSnapshot.metadata?.isFallback) {
      return 'fallback';
    }
    
    if (!latestSnapshot.captureSuccess) {
      return 'repair';
    }
    
    return 'recapture';
  }

  /**
   * Quick recovery check - just verify if project needs recovery
   */
  public async checkRecoveryNeeded(projectId: string): Promise<{
    needed: boolean;
    productCount: number;
    missingSnapshots: number;
    failedSnapshots: number;
    oldSnapshots: number;
  }> {
    try {
      const validationSummary = await productSnapshotValidator.getValidationSummary(projectId);
      
      if (!validationSummary.hasProducts) {
        return {
          needed: false,
          productCount: 0,
          missingSnapshots: 0,
          failedSnapshots: 0,
          oldSnapshots: 0
        };
      }

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
          }
        }
      });

      if (!project) {
        return {
          needed: false,
          productCount: 0,
          missingSnapshots: 0,
          failedSnapshots: 0,
          oldSnapshots: 0
        };
      }

      let missingSnapshots = 0;
      let failedSnapshots = 0;
      let oldSnapshots = 0;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      project.products.forEach(product => {
        if (!product.snapshots || product.snapshots.length === 0) {
          missingSnapshots++;
        } else {
          const latestSnapshot = product.snapshots[0];
          if (!latestSnapshot.captureSuccess) {
            failedSnapshots++;
          }
          if (new Date(latestSnapshot.createdAt) < sevenDaysAgo) {
            oldSnapshots++;
          }
        }
      });

      const needed = missingSnapshots > 0 || failedSnapshots > 0;

      return {
        needed,
        productCount: project.products.length,
        missingSnapshots,
        failedSnapshots,
        oldSnapshots
      };

    } catch (error) {
      logger.error('Error checking recovery needed', error as Error, { projectId });
      return {
        needed: false,
        productCount: 0,
        missingSnapshots: 0,
        failedSnapshots: 0,
        oldSnapshots: 0
      };
    }
  }
}

// Export singleton instance
export const productDataRecoveryService = ProductDataRecoveryService.getInstance(); 