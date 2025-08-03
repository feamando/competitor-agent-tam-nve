import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';

export interface ProductSnapshotValidationResult {
  isValid: boolean;
  projectId: string;
  productCount: number;
  snapshotCount: number;
  missingSnapshots: string[];
  validationTime: Date;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export interface ProductSnapshotValidationOptions {
  requireFreshSnapshots?: boolean;
  maxSnapshotAge?: number; // in hours
  minimumDataQuality?: 'basic' | 'good' | 'high';
  waitForSnapshots?: boolean;
  maxWaitTime?: number; // in milliseconds
}

export class ProductSnapshotValidator {
  private static instance: ProductSnapshotValidator;
  
  public static getInstance(): ProductSnapshotValidator {
    if (!ProductSnapshotValidator.instance) {
      ProductSnapshotValidator.instance = new ProductSnapshotValidator();
    }
    return ProductSnapshotValidator.instance;
  }

  /**
   * Validate product snapshots before report generation
   * This prevents the race condition discovered in Phase 1
   */
  public async validateProductSnapshots(
    projectId: string,
    options: ProductSnapshotValidationOptions = {}
  ): Promise<ProductSnapshotValidationResult> {
    const correlationId = generateCorrelationId();
    const context = { projectId, correlationId, operation: 'validateProductSnapshots' };
    
    logger.info('Starting product snapshot validation', context);
    
    const result: ProductSnapshotValidationResult = {
      isValid: false,
      projectId,
      productCount: 0,
      snapshotCount: 0,
      missingSnapshots: [],
      validationTime: new Date(),
      errors: [],
      warnings: [],
      recommendations: []
    };

    try {
      // Get project with products and snapshots
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 5 // Get last 5 snapshots for analysis
              }
            }
          }
        }
      });

      if (!project) {
        result.errors.push(`Project ${projectId} not found`);
        logger.error('Project not found during validation', new Error(`Project ${projectId} not found`), context);
        return result;
      }

      result.productCount = project.products.length;

      // Validate project has products
      if (project.products.length === 0) {
        result.errors.push('No products found in project');
        result.recommendations.push('Add products to the project before generating reports');
        logger.warn('No products found in project', context);
        return result;
      }

      // Validate each product has snapshots
      for (const product of project.products) {
        if (product.snapshots.length === 0) {
          result.missingSnapshots.push(product.name);
          result.errors.push(`Product "${product.name}" has no snapshots`);
        } else {
          result.snapshotCount += product.snapshots.length;
          
          // Check snapshot freshness if required
          if (options.requireFreshSnapshots && options.maxSnapshotAge) {
            const latestSnapshot = product.snapshots[0];
            if (latestSnapshot) {
              const snapshotAge = Date.now() - new Date(latestSnapshot.createdAt).getTime();
              const maxAge = options.maxSnapshotAge * 60 * 60 * 1000; // hours to milliseconds
              
              if (snapshotAge > maxAge) {
                result.warnings.push(`Product "${product.name}" snapshot is ${Math.round(snapshotAge / (60 * 60 * 1000))} hours old`);
                result.recommendations.push(`Consider refreshing snapshot for "${product.name}"`);
              }
            }
          }

          // Check snapshot success status
          const latestSnapshot = product.snapshots[0];
          if (latestSnapshot && !latestSnapshot.captureSuccess) {
            result.warnings.push(`Latest snapshot for "${product.name}" failed: ${latestSnapshot.errorMessage || 'Unknown error'}`);
            result.recommendations.push(`Retry snapshot capture for "${product.name}"`);
          }
        }
      }

      // Determine if validation passed
      result.isValid = result.errors.length === 0 && result.missingSnapshots.length === 0;

      // Add recommendations for missing snapshots
      if (result.missingSnapshots.length > 0) {
        result.recommendations.push('Wait for data collection to complete before generating reports');
        result.recommendations.push('Consider using fallback data generation options');
        
        // If waitForSnapshots is enabled, attempt to wait
        if (options.waitForSnapshots && options.maxWaitTime) {
          logger.info('Attempting to wait for snapshots to be created', { 
            ...context, 
            missingCount: result.missingSnapshots.length,
            maxWaitTime: options.maxWaitTime 
          });
          
          const waitResult = await this.waitForSnapshots(projectId, result.missingSnapshots, options.maxWaitTime);
          if (waitResult.success) {
            result.warnings.push(`Waited ${waitResult.waitTime}ms for snapshots to be created`);
            // Re-run validation
            return this.validateProductSnapshots(projectId, { ...options, waitForSnapshots: false });
          } else {
            result.warnings.push(`Waited ${options.maxWaitTime}ms but snapshots were not created`);
          }
        }
      }

      logger.info('Product snapshot validation completed', {
        ...context,
        isValid: result.isValid,
        productCount: result.productCount,
        snapshotCount: result.snapshotCount,
        errorCount: result.errors.length,
        warningCount: result.warnings.length
      });

      return result;

    } catch (error) {
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error('Product snapshot validation failed', error as Error, context);
      return result;
    }
  }

  /**
   * Wait for snapshots to be created (addresses race condition)
   */
  private async waitForSnapshots(
    projectId: string,
    missingProductNames: string[],
    maxWaitTime: number
  ): Promise<{ success: boolean; waitTime: number; snapshotsFound: string[] }> {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every 1 second
    const snapshotsFound: string[] = [];
    
    while (Date.now() - startTime < maxWaitTime) {
      // Check if snapshots have been created
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          products: {
            where: {
              name: {
                in: missingProductNames.filter(name => !snapshotsFound.includes(name))
              }
            },
            include: {
              snapshots: {
                orderBy: { createdAt: 'desc' },
                take: 1
              }
            }
          }
        }
      });

      if (project) {
        for (const product of project.products) {
          if (product.snapshots.length > 0 && !snapshotsFound.includes(product.name)) {
            snapshotsFound.push(product.name);
            logger.info('Snapshot found during wait', { 
              projectId, 
              productName: product.name,
              waitTime: Date.now() - startTime 
            });
          }
        }

        // If all snapshots are found, return success
        if (snapshotsFound.length === missingProductNames.length) {
          return {
            success: true,
            waitTime: Date.now() - startTime,
            snapshotsFound
          };
        }
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    return {
      success: false,
      waitTime: Date.now() - startTime,
      snapshotsFound
    };
  }

  /**
   * Quick validation check - just verifies snapshots exist
   */
  public async quickValidate(projectId: string): Promise<boolean> {
    try {
      const result = await this.validateProductSnapshots(projectId);
      return result.isValid;
    } catch (error) {
      logger.error('Quick validation failed', error as Error, { projectId });
      return false;
    }
  }

  /**
   * Get validation summary for monitoring
   */
  public async getValidationSummary(projectId: string): Promise<{
    hasProducts: boolean;
    hasSnapshots: boolean;
    snapshotCount: number;
    lastSnapshotTime?: Date;
  }> {
    try {
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
        return { hasProducts: false, hasSnapshots: false, snapshotCount: 0 };
      }

      const hasProducts = project.products.length > 0;
      const snapshotCount = project.products.reduce((count, product) => count + product.snapshots.length, 0);
      const hasSnapshots = snapshotCount > 0;
      
      let lastSnapshotTime: Date | undefined;
      if (hasSnapshots) {
        const allSnapshots = project.products.flatMap(p => p.snapshots);
        if (allSnapshots.length > 0) {
          lastSnapshotTime = new Date(Math.max(...allSnapshots.map(s => new Date(s.createdAt).getTime())));
        }
      }

      const summary: {
        hasProducts: boolean;
        hasSnapshots: boolean;
        snapshotCount: number;
        lastSnapshotTime?: Date;
      } = {
        hasProducts,
        hasSnapshots,
        snapshotCount
      };

      if (lastSnapshotTime) {
        summary.lastSnapshotTime = lastSnapshotTime;
      }

      return summary;

    } catch (error) {
      logger.error('Failed to get validation summary', error as Error, { projectId });
      return { hasProducts: false, hasSnapshots: false, snapshotCount: 0 };
    }
  }
}

// Export singleton instance
export const productSnapshotValidator = ProductSnapshotValidator.getInstance(); 