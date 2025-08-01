/**
 * Project Discovery Service
 * 
 * Resolves project associations for competitors to fix the "projectId: unknown" issue
 * in report generation. Provides automatic project discovery from competitor IDs
 * with multi-project handling and caching capabilities.
 * 
 * Part of TP-013-20250801-project-report-association-fix
 */

import { prisma } from '@/lib/prisma';
import { logger, generateCorrelationId } from '@/lib/logger';
import { ProjectStatus } from '@prisma/client';

// Types for project discovery operations
export interface ProjectDiscoveryResult {
  success: boolean;
  projectId?: string;
  projects?: ProjectInfo[];
  error?: string;
  requiresExplicitSelection?: boolean;
}

export interface ProjectInfo {
  id: string;
  name: string;
  status: ProjectStatus;
  priority?: number;
  isActive: boolean;
}

export interface ProjectDiscoveryOptions {
  includeInactive?: boolean;
  priorityRules?: 'newest' | 'active_first' | 'by_priority';
  correlationId?: string;
}

// Cache interface for project discovery operations
interface ProjectCache {
  set(key: string, value: ProjectInfo[], ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<ProjectInfo[] | null>;
  invalidate(competitorId: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): CacheStats;
}

interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
  size: number;
}

interface CacheEntry {
  data: ProjectInfo[];
  expiresAt: number;
  createdAt: number;
}

/**
 * In-memory cache implementation for project discovery
 * Optimized for performance with automatic TTL expiration
 * Can be easily replaced with Redis or other external cache systems
 */
class InMemoryProjectCache implements ProjectCache {
  private cache = new Map<string, CacheEntry>();
  private stats = {
    hits: 0,
    misses: 0
  };
  
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  async set(key: string, value: ProjectInfo[], ttlSeconds?: number): Promise<void> {
    const ttlMs = (ttlSeconds || 300) * 1000; // Default 5 minutes
    const now = Date.now();
    
    const entry: CacheEntry = {
      data: value,
      expiresAt: now + ttlMs,
      createdAt: now
    };
    
    this.cache.set(key, entry);
    
    logger.debug('Cache entry stored', {
      key,
      dataLength: value.length,
      ttlMs,
      expiresAt: new Date(entry.expiresAt).toISOString()
    });
  }

  async get(key: string): Promise<ProjectInfo[] | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      logger.debug('Cache miss', { key, reason: 'not_found' });
      return null;
    }
    
    const now = Date.now();
    if (now > entry.expiresAt) {
      // Entry expired - remove it
      this.cache.delete(key);
      this.stats.misses++;
      logger.debug('Cache miss', { 
        key, 
        reason: 'expired',
        expiredAt: new Date(entry.expiresAt).toISOString()
      });
      return null;
    }
    
    this.stats.hits++;
    logger.debug('Cache hit', { 
      key, 
      dataLength: entry.data.length,
      age: now - entry.createdAt 
    });
    
    return entry.data;
  }

  async invalidate(competitorId: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    // Find all cache keys that contain this competitor ID
    for (const key of this.cache.keys()) {
      if (key.includes(competitorId)) {
        keysToDelete.push(key);
      }
    }
    
    // Delete the entries
    keysToDelete.forEach(key => this.cache.delete(key));
    
    logger.debug('Cache invalidation completed', {
      competitorId,
      keysDeleted: keysToDelete.length,
      deletedKeys: keysToDelete
    });
  }

  async clear(): Promise<void> {
    const entriesCleared = this.cache.size;
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    
    logger.info('Cache cleared completely', { entriesCleared });
  }

  getStats(): CacheStats {
    // Clean up expired entries for accurate stats
    this.cleanupExpiredEntries();
    
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
      size: this.calculateCacheSize()
    };
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      logger.debug('Cleaned up expired cache entries', {
        expiredEntries: keysToDelete.length
      });
    }
  }

  private calculateCacheSize(): number {
    // Rough estimation of memory usage in bytes
    let size = 0;
    for (const [key, entry] of this.cache.entries()) {
      size += key.length * 2; // String characters are 2 bytes each
      size += JSON.stringify(entry.data).length * 2; // Approximate JSON size
      size += 16; // Overhead for timestamps and metadata
    }
    return size;
  }
}

/**
 * Service for discovering and resolving project associations from competitor IDs
 * Addresses the core issue where reports are created without proper project linkage
 */
export class ProjectDiscoveryService {
  private cache: ProjectCache;
  
  constructor(cache?: ProjectCache) {
    // Use provided cache or default to in-memory implementation
    this.cache = cache || new InMemoryProjectCache();
    
    logger.info('ProjectDiscoveryService initialized', {
      cacheEnabled: true,
      cacheType: cache ? 'external' : 'in-memory'
    });
  }

  /**
   * Main method to resolve a single project ID from a competitor ID
   * Uses smart logic to handle multiple projects gracefully
   * 
   * @param competitorId - The competitor to find projects for
   * @param options - Discovery options and preferences
   * @returns ProjectDiscoveryResult with resolved project or error details
   */
  async resolveProjectId(
    competitorId: string, 
    options?: ProjectDiscoveryOptions
  ): Promise<ProjectDiscoveryResult> {
    const correlationId = options?.correlationId || generateCorrelationId();
    const context = {
      operation: 'resolveProjectId',
      competitorId,
      correlationId,
      options
    };

    try {
      logger.info('Starting project resolution for competitor', context);

      // Input validation
      if (!competitorId || competitorId.trim() === '') {
        logger.warn('Invalid competitor ID provided', context);
        return {
          success: false,
          error: 'Competitor ID is required and cannot be empty'
        };
      }

      // Find all projects associated with this competitor
      const projects = await this.findProjectsByCompetitorId(competitorId, options);
      
      if (projects.length === 0) {
        logger.warn('No projects found for competitor', context);
        return {
          success: false,
          error: 'No projects associated with this competitor',
          projects: []
        };
      }

      // Single project - easy resolution
      if (projects.length === 1) {
        const project = projects[0]!; // Safe because we checked length === 1
        logger.info('Single project resolved successfully', {
          ...context,
          resolvedProjectId: project.id,
          projectName: project.name
        });
        
        return {
          success: true,
          projectId: project.id,
          projects: [project]
        };
      }

      // Multiple projects - apply priority rules
      const resolvedProject = this.applyMultiProjectRules(projects, options);
      
      if (resolvedProject) {
        logger.info('Multiple projects resolved using priority rules', {
          ...context,
          resolvedProjectId: resolvedProject.id,
          projectName: resolvedProject.name,
          totalProjects: projects.length,
          appliedRule: options?.priorityRules || 'active_first'
        });
        
        return {
          success: true,
          projectId: resolvedProject.id,
          projects
        };
      }

      // Cannot auto-resolve - require explicit selection
      logger.warn('Multiple projects found, explicit selection required', {
        ...context,
        projectCount: projects.length
      });
      
      return {
        success: false,
        requiresExplicitSelection: true,
        projects,
        error: `Competitor belongs to ${projects.length} projects. Please specify projectId explicitly.`
      };

    } catch (error) {
      logger.error('Project resolution failed', error as Error, context);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during project resolution'
      };
    }
  }

  /**
   * Find all projects associated with a competitor ID
   * Foundation method for all project discovery operations
   * 
   * @param competitorId - The competitor to search for
   * @param options - Query options and filters
   * @returns Array of ProjectInfo objects
   */
  async findProjectsByCompetitorId(
    competitorId: string,
    options?: ProjectDiscoveryOptions
  ): Promise<ProjectInfo[]> {
    const correlationId = options?.correlationId || generateCorrelationId();
    const context = {
      operation: 'findProjectsByCompetitorId',
      competitorId,
      correlationId,
      options
    };

    try {
      logger.debug('Starting project lookup for competitor', context);

      // Generate cache key based on competitor ID and options
      const cacheKey = this.generateCacheKey(competitorId, options);
      
      // Try to get from cache first
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        logger.info('Project lookup completed from cache', {
          ...context,
          projectCount: cachedResult.length,
          source: 'cache'
        });
        return cachedResult;
      }

      // Build filter conditions based on options
      const whereCondition: any = {
        competitors: {
          some: { id: competitorId }
        }
      };

      // Apply inactive project filtering
      if (!options?.includeInactive) {
        whereCondition.status = {
          in: ['ACTIVE', 'DRAFT'] // Include active and draft projects, exclude archived/paused
        };
        logger.debug('Filtering to active projects only', context);
      }

      // Execute database query with optimized selection
      const startTime = Date.now();
      const projects = await prisma.project.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          // Include minimal competitor info for validation
          competitors: {
            where: { id: competitorId },
            select: { id: true }
          }
        },
        orderBy: [
          { status: 'asc' }, // Active projects first
          { priority: 'desc' }, // Higher priority first  
          { createdAt: 'desc' } // Newer projects first
        ]
      });

      const queryTime = Date.now() - startTime;
      logger.debug('Database query completed', {
        ...context,
        projectCount: projects.length,
        queryTimeMs: queryTime
      });

      // Transform database results to ProjectInfo objects
      const projectInfos: ProjectInfo[] = projects.map(project => ({
        id: project.id,
        name: project.name,
        status: project.status,
        priority: this.mapPriorityToNumber(project.priority),
        isActive: this.isProjectActive(project.status)
      }));

      // Store results in cache for future requests
      await this.cache.set(cacheKey, projectInfos, 300); // 5 minutes TTL

      // Log successful lookup with details
      logger.info('Project lookup completed successfully', {
        ...context,
        projectCount: projectInfos.length,
        queryTimeMs: queryTime,
        activeProjects: projectInfos.filter(p => p.isActive).length,
        projectStatuses: projectInfos.map(p => p.status),
        source: 'database',
        cached: true
      });

      return projectInfos;

    } catch (error) {
      logger.error('Failed to find projects for competitor', error as Error, context);
      
      // Return empty array on error to prevent cascade failures
      // The calling method will handle the empty result appropriately
      return [];
    }
  }

  /**
   * Apply business rules to resolve a single project from multiple candidates
   * Implements priority logic for automatic project selection
   * 
   * @param projects - Array of candidate projects
   * @param options - Priority rules and preferences
   * @returns Single resolved project or null if cannot auto-resolve
   */
  private applyMultiProjectRules(
    projects: ProjectInfo[], 
    options?: ProjectDiscoveryOptions
  ): ProjectInfo | null {
    const priorityRule = options?.priorityRules || 'active_first';
    const context = {
      operation: 'applyMultiProjectRules',
      projectCount: projects.length,
      priorityRule,
      projects: projects.map(p => ({ id: p.id, name: p.name, status: p.status, priority: p.priority }))
    };

    logger.debug('Applying multi-project resolution rules', context);

    // No projects to resolve
    if (projects.length === 0) {
      logger.debug('No projects provided for resolution', context);
      return null;
    }

    // Single project - return immediately
    if (projects.length === 1) {
      logger.debug('Single project provided - no resolution needed', context);
      return projects[0]!;
    }

    try {
      let selectedProject: ProjectInfo | null = null;

      switch (priorityRule) {
        case 'active_first':
          selectedProject = this.resolveByActiveFirst(projects);
          break;
        
        case 'by_priority':
          selectedProject = this.resolveByPriority(projects);
          break;
        
        case 'newest':
          selectedProject = this.resolveByNewest(projects);
          break;
        
        default:
          logger.warn('Unknown priority rule, falling back to active_first', {
            ...context,
            unknownRule: priorityRule
          });
          selectedProject = this.resolveByActiveFirst(projects);
      }

      if (selectedProject) {
        logger.info('Multi-project resolution successful', {
          ...context,
          selectedProjectId: selectedProject.id,
          selectedProjectName: selectedProject.name,
          resolutionMethod: priorityRule
        });
      } else {
        logger.warn('Multi-project resolution failed - no clear winner', context);
      }

      return selectedProject;

    } catch (error) {
      logger.error('Error during multi-project resolution', error as Error, context);
      return null;
    }
  }

  /**
   * Validate that a competitor-project relationship exists in the database
   * Used to verify associations before saving reports
   * 
   * @param competitorId - Competitor ID to validate
   * @param projectId - Project ID to validate  
   * @returns Boolean indicating if relationship exists
   */
  async validateProjectCompetitorRelationship(
    competitorId: string,
    projectId: string
  ): Promise<boolean> {
    const correlationId = generateCorrelationId();
    const context = {
      operation: 'validateProjectCompetitorRelationship',
      competitorId,
      projectId,
      correlationId
    };

    try {
      logger.debug('Validating project-competitor relationship', context);

      // Check if the competitor belongs to the specified project
      const relationship = await prisma.project.findFirst({
        where: {
          id: projectId,
          competitors: {
            some: { id: competitorId }
          }
        },
        select: { id: true }
      });

      const isValid = !!relationship;
      logger.debug('Project-competitor relationship validation result', {
        ...context,
        isValid
      });

      return isValid;

    } catch (error) {
      logger.error('Failed to validate project-competitor relationship', error as Error, context);
      return false;
    }
  }

  /**
   * Get cache statistics and health information
   * Useful for monitoring and debugging cache performance
   */
  getCacheStats(): { enabled: boolean; stats: CacheStats } {
    return {
      enabled: true,
      stats: this.cache.getStats()
    };
  }

  /**
   * Clear all cached project-competitor mappings
   * Useful for cache invalidation scenarios
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    logger.info('Project discovery cache cleared');
  }

  /**
   * Generate a consistent cache key for project discovery requests
   * Includes competitor ID and relevant options to ensure proper cache isolation
   * 
   * @param competitorId - The competitor ID being looked up
   * @param options - Discovery options that affect the query results
   * @returns String cache key for consistent caching
   */
  private generateCacheKey(competitorId: string, options?: ProjectDiscoveryOptions): string {
    const includeInactive = options?.includeInactive || false;
    const priorityRules = options?.priorityRules || 'active_first';
    
    // Create a deterministic key that captures all query variations
    const keyComponents = [
      'project-discovery',
      competitorId,
      `inactive:${includeInactive}`,
      `priority:${priorityRules}`
    ];
    
    const key = keyComponents.join('|');
    
    logger.debug('Generated cache key', {
      competitorId,
      options,
      cacheKey: key
    });
    
    return key;
  }

  /**
   * Helper method to map Prisma priority enum to numeric value for sorting
   * Used in project discovery ordering logic
   * 
   * @param priority - Prisma ProjectPriority enum value
   * @returns Numeric priority value (higher = more important)
   */
  private mapPriorityToNumber(priority: any): number {
    switch (priority) {
      case 'URGENT': return 4;
      case 'HIGH': return 3;
      case 'MEDIUM': return 2;
      case 'LOW': return 1;
      default: return 2; // Default to medium priority
    }
  }

  /**
   * Helper method to determine if a project status represents an active project
   * Used for filtering and priority logic
   * 
   * @param status - Prisma ProjectStatus enum value
   * @returns Boolean indicating if project is considered active
   */
  private isProjectActive(status: any): boolean {
    return status === 'ACTIVE' || status === 'DRAFT';
  }

  /**
   * Resolution strategy: Prefer active projects, then by priority, then newest
   * Default strategy that balances business needs
   * 
   * @param projects - Array of candidate projects
   * @returns Selected project or null if tie cannot be resolved
   */
  private resolveByActiveFirst(projects: ProjectInfo[]): ProjectInfo | null {
    // Step 1: Prioritize active projects
    const activeProjects = projects.filter(p => p.isActive);
    const candidateProjects = activeProjects.length > 0 ? activeProjects : projects;

    logger.debug('Active-first resolution filtering', {
      totalProjects: projects.length,
      activeProjects: activeProjects.length,
      candidatesAfterFilter: candidateProjects.length
    });

    // Step 2: If still multiple, use priority
    if (candidateProjects.length > 1) {
      const highestPriority = Math.max(...candidateProjects.map(p => p.priority || 2));
      const highPriorityProjects = candidateProjects.filter(p => (p.priority || 2) === highestPriority);
      
      if (highPriorityProjects.length === 1) {
        return highPriorityProjects[0]!;
      }

      // Step 3: If still tied, return first project as tie-breaker
      logger.debug('Active-first resolution: using first project as tie-breaker', {
        tiedProjectCount: highPriorityProjects.length
      });
      return highPriorityProjects[0]!;
    }

    return candidateProjects[0] || null;
  }

  /**
   * Resolution strategy: Strictly by priority level, then active status
   * Business-focused strategy for high-priority projects
   * 
   * @param projects - Array of candidate projects
   * @returns Selected project or null if tie cannot be resolved
   */
  private resolveByPriority(projects: ProjectInfo[]): ProjectInfo | null {
    // Step 1: Find highest priority level
    const highestPriority = Math.max(...projects.map(p => p.priority || 2));
    const highPriorityProjects = projects.filter(p => (p.priority || 2) === highestPriority);

    logger.debug('Priority-based resolution filtering', {
      totalProjects: projects.length,
      highestPriority,
      highPriorityProjectsCount: highPriorityProjects.length
    });

    if (highPriorityProjects.length === 1) {
      return highPriorityProjects[0]!;
    }

    // Step 2: Among equal priority, prefer active projects
    const activeHighPriority = highPriorityProjects.filter(p => p.isActive);
    if (activeHighPriority.length === 1) {
      return activeHighPriority[0]!;
    }

    // Step 3: Tie-breaker - return first project
    const candidates = activeHighPriority.length > 0 ? activeHighPriority : highPriorityProjects;
    logger.debug('Priority resolution: using first project as tie-breaker', {
      tiedProjectCount: candidates.length
    });
    
    return candidates[0]!;
  }

  /**
   * Resolution strategy: Newest project (based on database ordering)
   * Development-focused strategy for latest projects
   * 
   * @param projects - Array of candidate projects (should be ordered by creation date desc)
   * @returns Selected project or null if empty
   */
  private resolveByNewest(projects: ProjectInfo[]): ProjectInfo | null {
    // Since our database query orders by createdAt DESC, first project is newest
    // We can optionally prefer active projects among newest
    
    logger.debug('Newest-first resolution', {
      totalProjects: projects.length,
      selectingFirst: true // First in array is newest due to ordering
    });

    if (projects.length === 0) {
      return null;
    }

    // Optional: Among newest projects, prefer active ones
    // For simplicity, just return the first (newest) project
    return projects[0]!;
  }
} 