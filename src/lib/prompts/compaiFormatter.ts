import { Product, Competitor, ProductSnapshot, Snapshot } from '@prisma/client';
import { ProjectFreshnessStatus } from '@/types/smartScheduling';
import { logger } from '@/lib/logger';

/**
 * CompAI Data Formatting Utilities
 * 
 * Shared utilities for transforming database models into CompAI prompt format.
 * These functions handle data extraction, formatting, and content optimization.
 */

export interface CompetitorWithSnapshot {
  competitor: Competitor;
  snapshot: Snapshot;
}

export interface ContentExtractionOptions {
  maxLength?: number;
  preserveStructure?: boolean;
  includeMetadata?: boolean;
}

/**
 * Format product information for CompAI template
 */
export function formatProductInfo(product: Product): string {
  const info = [
    `**Product Name:** ${product.name}`,
    `**Website:** ${product.website}`,
    `**Industry:** ${product.industry}`,
    `**Product Description:** ${product.positioning}`,
    `**Target Customer Segments:** ${product.customerData}`,
    `**Customer Problems/Needs:** ${product.userProblem}`,
    `**How Our Product Addresses Them:** ${product.positioning}`
  ];

  return info.join('\n');
}

/**
 * Extract HTML content from ProductSnapshot
 */
export function extractProductHTML(
  snapshot: ProductSnapshot | null,
  options: ContentExtractionOptions = {}
): string {
  if (!snapshot?.content) {
    return 'Product website HTML content not available - no recent snapshot found.';
  }

  const content = snapshot.content as any;
  const html = content.html || content.content || '';

  if (!html) {
    return 'Product website HTML content not available - no HTML content in snapshot.';
  }

  // Apply length limit if specified
  if (options.maxLength && html.length > options.maxLength) {
    logger.info('Truncating product HTML content', {
      originalLength: html.length,
      maxLength: options.maxLength,
      productId: snapshot.productId
    });

    return options.preserveStructure 
      ? intelligentHTMLTruncation(html, options.maxLength, 'product')
      : html.substring(0, options.maxLength) + '...[truncated]';
  }

  return html;
}

/**
 * Extract HTML content from competitor snapshots
 */
export function extractCompetitorHTML(
  competitorSnapshots: CompetitorWithSnapshot[],
  options: ContentExtractionOptions = {}
): string {
  if (competitorSnapshots.length === 0) {
    return 'No competitor website data available - no recent snapshots found.';
  }

  const htmlFiles = competitorSnapshots.map((comp) => {
    const metadata = comp.snapshot.metadata as any;
    let html = '';

    // Handle different metadata structures
    if (metadata?.html) {
      html = metadata.html;
    } else if (metadata?.content?.html) {
      html = metadata.content.html;
    } else if (typeof metadata === 'string') {
      // Some snapshots might store HTML directly as string
      html = metadata;
    }

    if (!html) {
      return `**${comp.competitor.name}_Website.html:**\nHTML content not available for this competitor.`;
    }

    // Apply length limit per competitor
    if (options.maxLength && html.length > options.maxLength) {
      html = options.preserveStructure
        ? intelligentHTMLTruncation(html, options.maxLength, comp.competitor.name)
        : html.substring(0, options.maxLength) + '...[truncated]';
    }

    const competitorName = sanitizeFilename(comp.competitor.name);
    return `**${competitorName}_Website.html:**\n${html}`;
  });

  return htmlFiles.join('\n\n');
}

/**
 * Format last analysis date from freshness status
 */
export function formatLastAnalysisDate(freshnessStatus: ProjectFreshnessStatus): string {
  try {
    // Collect all snapshot dates
    const allDates: Date[] = [];

    // Add product snapshot dates
    freshnessStatus.products
      .filter(p => p.lastSnapshot)
      .forEach(p => {
        try {
          allDates.push(new Date(p.lastSnapshot!));
        } catch (error) {
          logger.warn('Invalid product snapshot date', { 
            productId: p.id, 
            lastSnapshot: p.lastSnapshot 
          });
        }
      });

    // Add competitor snapshot dates
    freshnessStatus.competitors
      .filter(c => c.lastSnapshot)
      .forEach(c => {
        try {
          allDates.push(new Date(c.lastSnapshot!));
        } catch (error) {
          logger.warn('Invalid competitor snapshot date', { 
            competitorId: c.id, 
            lastSnapshot: c.lastSnapshot 
          });
        }
      });

    if (allDates.length === 0) {
      return 'No previous analysis available';
    }

    // Find most recent date
    const mostRecent = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    return mostRecent.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

  } catch (error) {
    logger.error('Failed to format last analysis date', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return 'Analysis date unavailable';
  }
}

/**
 * Intelligent HTML truncation preserving important content
 */
export function intelligentHTMLTruncation(
  html: string, 
  maxLength: number, 
  source: string
): string {
  if (html.length <= maxLength) return html;

  // Define important HTML sections to preserve
  const importantSections = [
    { regex: /<head>.*?<\/head>/s, priority: 1, name: 'head' },
    { regex: /<title>.*?<\/title>/s, priority: 1, name: 'title' },
    { regex: /<nav>.*?<\/nav>/s, priority: 2, name: 'navigation' },
    { regex: /<header>.*?<\/header>/s, priority: 2, name: 'header' },
    { regex: /<main>.*?<\/main>/s, priority: 1, name: 'main content' },
    { regex: /<article>.*?<\/article>/s, priority: 1, name: 'article' },
    { regex: /<footer>.*?<\/footer>/s, priority: 3, name: 'footer' }
  ];

  let preservedContent = '';
  let remainingLength = maxLength - 200; // Reserve space for truncation notice
  const preservedSections: string[] = [];

  // Sort by priority and try to preserve important sections
  const sortedSections = importantSections.sort((a, b) => a.priority - b.priority);

  for (const section of sortedSections) {
    const match = html.match(section.regex);
    if (match && match[0].length < remainingLength * 0.4) {
      preservedContent += match[0] + '\n';
      remainingLength -= match[0].length;
      preservedSections.push(section.name);
    }
  }

  // If we have remaining space, add content from the beginning
  if (remainingLength > 500 && preservedContent.length < maxLength * 0.7) {
    const startContent = html.substring(0, remainingLength);
    // Avoid duplicating content
    if (!preservedContent.includes(startContent.substring(0, 100))) {
      preservedContent = startContent + '\n' + preservedContent;
    }
  }

  // Ensure we don't exceed max length
  if (preservedContent.length > maxLength - 200) {
    preservedContent = preservedContent.substring(0, maxLength - 200);
  }

  // Add truncation notice
  const truncationNotice = `

<!-- Content truncated for ${source} -->
<!-- Original length: ${html.length} characters -->
<!-- Preserved sections: ${preservedSections.join(', ')} -->
<!-- Truncated length: ${preservedContent.length} characters -->`;

  const finalContent = preservedContent + truncationNotice;

  logger.info('Applied intelligent HTML truncation', {
    source,
    originalLength: html.length,
    truncatedLength: finalContent.length,
    preservedSections,
    compressionRatio: (finalContent.length / html.length * 100).toFixed(1) + '%'
  });

  return finalContent;
}

/**
 * Sanitize competitor name for filename usage
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '_')            // Replace spaces with underscores
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .replace(/^_|_$/g, '')           // Remove leading/trailing underscores
    .substring(0, 50);               // Limit length
}

/**
 * Validate HTML content quality
 */
export function validateHTMLContent(html: string, source: string): {
  isValid: boolean;
  issues: string[];
  quality: 'high' | 'medium' | 'low';
} {
  const issues: string[] = [];
  let quality: 'high' | 'medium' | 'low' = 'high';

  // Check for minimum content length
  if (html.length < 500) {
    issues.push('Content too short (< 500 characters)');
    quality = 'low';
  }

  // Check for basic HTML structure
  if (!html.includes('<html') && !html.includes('<body') && !html.includes('<div')) {
    issues.push('Missing basic HTML structure');
    quality = 'low';
  }

  // Check for error pages
  const errorIndicators = ['404', 'not found', 'error', 'access denied'];
  const lowerHTML = html.toLowerCase();
  if (errorIndicators.some(indicator => lowerHTML.includes(indicator))) {
    issues.push('Possible error page content detected');
    quality = 'medium';
  }

  // Check for substantial content (not just navigation/headers)
  const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (textContent.length < html.length * 0.1) {
    issues.push('Low text-to-markup ratio');
    quality = 'medium';
  }

  const isValid = quality !== 'low';

  if (issues.length > 0) {
    logger.warn('HTML content quality issues detected', {
      source,
      issues,
      quality,
      contentLength: html.length,
      textLength: textContent.length
    });
  }

  return { isValid, issues, quality };
}

/**
 * Extract competitor names from snapshots for prompt context
 */
export function extractCompetitorNames(competitorSnapshots: CompetitorWithSnapshot[]): string[] {
  return competitorSnapshots.map(comp => comp.competitor.name);
}

/**
 * Calculate content statistics for monitoring
 */
export interface ContentStatistics {
  totalHTMLLength: number;
  averageCompetitorLength: number;
  productHTMLLength: number;
  competitorCount: number;
  truncatedSources: string[];
  qualityIssues: string[];
}

export function calculateContentStatistics(
  productHTML: string,
  competitorHTML: string,
  competitorSnapshots: CompetitorWithSnapshot[]
): ContentStatistics {
  const competitorLengths = competitorSnapshots.map(comp => {
    const metadata = comp.snapshot.metadata as any;
    const html = metadata?.html || metadata?.content?.html || '';
    return html.length;
  });

  const stats: ContentStatistics = {
    totalHTMLLength: productHTML.length + competitorHTML.length,
    averageCompetitorLength: competitorLengths.length > 0 
      ? Math.round(competitorLengths.reduce((a, b) => a + b, 0) / competitorLengths.length)
      : 0,
    productHTMLLength: productHTML.length,
    competitorCount: competitorSnapshots.length,
    truncatedSources: [],
    qualityIssues: []
  };

  // Check for truncation indicators
  if (productHTML.includes('[truncated]')) {
    stats.truncatedSources.push('product');
  }
  if (competitorHTML.includes('[truncated]')) {
    stats.truncatedSources.push('competitors');
  }

  // Basic quality checks
  if (stats.productHTMLLength < 1000) {
    stats.qualityIssues.push('Product HTML content is very short');
  }
  if (stats.averageCompetitorLength < 1000) {
    stats.qualityIssues.push('Competitor HTML content is very short');
  }
  if (stats.competitorCount === 0) {
    stats.qualityIssues.push('No competitor data available');
  }

  return stats;
}
