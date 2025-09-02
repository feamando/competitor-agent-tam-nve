import { PrismaClient } from '@prisma/client';
import { logger, generateCorrelationId } from '@/lib/logger';
import { z } from 'zod';

const prisma = new PrismaClient();

// Input validation schema
const competitorInputSchema = z.array(z.string().min(1, "Competitor input cannot be empty"));

// Resolution result interfaces
export interface CompetitorResolution {
  successful: Array<{
    input: string;
    competitor: {
      id: string;
      name: string;
      website?: string;
    };
    resolvedBy: 'name' | 'website' | 'id';
  }>;
  failed: Array<{
    input: string;
    error: string;
    suggestions?: string[];
  }>;
  resolvedIds: string[];
}

export interface Competitor {
  id: string;
  name: string;
  website?: string;
  industry?: string;
}

/**
 * CompetitorResolutionService - TP-027 Implementation
 * 
 * Resolves competitor inputs (names, URLs, or IDs) to database entities.
 * Supports multiple input formats with clear error handling and suggestions.
 */
export class CompetitorResolutionService {
  private correlationId: string;

  constructor(correlationId?: string) {
    this.correlationId = correlationId || generateCorrelationId();
  }

  /**
   * Main resolution method - processes array of competitor inputs
   * @param input Array of competitor identifiers (names, URLs, or IDs)
   * @returns CompetitorResolution with successful and failed resolutions
   */
  async resolveCompetitorInput(input: string[]): Promise<CompetitorResolution> {
    const context = {
      operation: 'resolveCompetitorInput',
      correlationId: this.correlationId,
      inputCount: input.length
    };

    try {
      logger.info('Starting competitor resolution', context);

      // Validate input
      const validatedInput = competitorInputSchema.parse(input);
      
      // Remove duplicates and trim whitespace, filter out empty strings
      const trimmedInputs = validatedInput.map(item => item.trim()).filter(item => item.length > 0);
      const uniqueInputs = [...new Set(trimmedInputs.map(item => item.toLowerCase()))];
      
      if (uniqueInputs.length === 0) {
        throw new Error('No valid competitor inputs provided after trimming whitespace');
      }
      
      logger.info('Processing unique competitor inputs', {
        ...context,
        originalCount: input.length,
        trimmedCount: trimmedInputs.length,
        uniqueCount: uniqueInputs.length,
        inputs: uniqueInputs.slice(0, 5) // Log first 5 for debugging
      });

      const result: CompetitorResolution = {
        successful: [],
        failed: [],
        resolvedIds: []
      };

      // Process each input
      for (const item of uniqueInputs) {
        try {
          const competitor = await this.resolveSingleInput(item);
          
          if (competitor) {
            const resolvedBy = this.determineResolutionMethod(item, competitor);
            result.successful.push({
              input: item,
              competitor: {
                id: competitor.id,
                name: competitor.name,
                website: competitor.website || undefined
              },
              resolvedBy
            });
            result.resolvedIds.push(competitor.id);
          } else {
            // Generate suggestions for failed input
            const suggestions = await this.generateSuggestions(item);
            result.failed.push({
              input: item,
              error: 'Competitor not found',
              suggestions
            });
          }
        } catch (error) {
          result.failed.push({
            input: item,
            error: `Resolution failed: ${(error as Error).message}`
          });
        }
      }

      // Remove duplicate IDs
      result.resolvedIds = [...new Set(result.resolvedIds)];

      logger.info('Competitor resolution completed', {
        ...context,
        successfulCount: result.successful.length,
        failedCount: result.failed.length,
        resolvedIds: result.resolvedIds.length
      });

      return result;

    } catch (error) {
      logger.error('Competitor resolution failed', error as Error, context);
      throw new Error(`Competitor resolution failed: ${(error as Error).message}`);
    }
  }

  /**
   * Resolve a single competitor input using multiple strategies
   */
  private async resolveSingleInput(input: string): Promise<Competitor | null> {
    try {
      // Strategy 1: Check if it's a database ID (looks like an ID pattern)
      if (input.length >= 10 && input.match(/^[a-zA-Z0-9]+$/)) {
        const competitor = await this.lookupById(input);
        if (competitor) return competitor;
      }

      // Strategy 2: Check if it's a website URL
      if (input.startsWith('http://') || input.startsWith('https://') || input.includes('.com') || input.includes('.net') || input.includes('.org')) {
        const competitor = await this.lookupByWebsite(input);
        if (competitor) return competitor;
      }

      // Strategy 3: Exact name match (case-insensitive)
      const competitor = await this.lookupByName(input);
      if (competitor) return competitor;

      return null;
    } catch (error) {
      logger.warn('Error in resolveSingleInput', {
        correlationId: this.correlationId,
        input: input.substring(0, 50),
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Lookup competitor by exact name (case-insensitive)
   */
  async lookupByName(name: string): Promise<Competitor | null> {
    try {
      const competitor = await prisma.competitor.findFirst({
        where: {
          name: {
            equals: name,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true
        }
      });

      return competitor;
    } catch (error) {
      logger.warn('Name lookup failed', {
        correlationId: this.correlationId,
        name: name.substring(0, 50), // Truncate for logging
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Lookup competitor by website URL
   */
  async lookupByWebsite(website: string): Promise<Competitor | null> {
    try {
      // Normalize URL for comparison
      const normalizedWebsite = this.normalizeUrl(website);
      
      const competitor = await prisma.competitor.findFirst({
        where: {
          OR: [
            { website: { equals: website, mode: 'insensitive' } },
            { website: { equals: normalizedWebsite, mode: 'insensitive' } },
            { website: { contains: this.extractDomain(website), mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true
        }
      });

      return competitor;
    } catch (error) {
      logger.warn('Website lookup failed', {
        correlationId: this.correlationId,
        website: website.substring(0, 50), // Truncate for logging
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Lookup competitor by database ID
   */
  async lookupById(id: string): Promise<Competitor | null> {
    try {
      const competitor = await prisma.competitor.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          website: true,
          industry: true
        }
      });

      return competitor;
    } catch (error) {
      logger.warn('ID lookup failed', {
        correlationId: this.correlationId,
        id,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Generate suggestions for failed competitor lookups
   */
  private async generateSuggestions(input: string): Promise<string[]> {
    try {
      // Find similar competitors by name using partial matching
      const similarCompetitors = await prisma.competitor.findMany({
        where: {
          OR: [
            { name: { contains: input, mode: 'insensitive' } },
            { name: { startsWith: input, mode: 'insensitive' } }
          ]
        },
        select: { name: true },
        take: 3
      });

      return similarCompetitors.map(c => c.name);
    } catch (error) {
      logger.warn('Failed to generate suggestions', {
        correlationId: this.correlationId,
        input: input.substring(0, 50),
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Determine how the competitor was resolved
   */
  private determineResolutionMethod(input: string, competitor: Competitor): 'name' | 'website' | 'id' {
    if (input.match(/^[a-zA-Z0-9]{25}$/)) {
      return 'id';
    }
    if (input.startsWith('http://') || input.startsWith('https://') || input.includes('.com') || input.includes('.net') || input.includes('.org')) {
      return 'website';
    }
    return 'name';
  }

  /**
   * Normalize URL for better matching
   */
  private normalizeUrl(url: string): string {
    let normalized = url.toLowerCase().trim();
    
    // Add https:// if no protocol
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    
    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    // Remove www. prefix for comparison
    normalized = normalized.replace(/^https?:\/\/www\./, 'https://');
    
    return normalized;
  }

  /**
   * Extract domain from URL for partial matching
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url.includes('://') ? url : 'https://' + url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      // Fallback: extract manually
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  }

  /**
   * Validate and resolve - convenience method that throws on validation errors
   */
  async validateAndResolve(inputs: string[]): Promise<string[]> {
    const resolution = await this.resolveCompetitorInput(inputs);
    
    if (resolution.failed.length > 0) {
      const errorMessages = resolution.failed.map(f => 
        `"${f.input}": ${f.error}${f.suggestions?.length ? ` (suggestions: ${f.suggestions.join(', ')})` : ''}`
      );
      
      throw new Error(`Some competitors could not be resolved:\n${errorMessages.join('\n')}`);
    }
    
    return resolution.resolvedIds;
  }
}

export default CompetitorResolutionService;
