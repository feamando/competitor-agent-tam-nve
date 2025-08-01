/**
 * Web Scraper Service for Competitive Analysis
 * Provides website scraping capabilities for competitor research
 */

import { logger } from '@/lib/logger';

export interface ScrapingOptions {
  waitForSelector?: string;
  timeout?: number;
  userAgent?: string;
  includeMeta?: boolean;
  includeImages?: boolean;
  maxRetries?: number;
}

export interface ScrapedContent {
  url: string;
  title?: string;
  content: string;
  metadata: {
    statusCode: number;
    timestamp: string;
    loadTime: number;
    wordCount: number;
    links: string[];
    images?: string[];
    metaTags?: Record<string, string>;
  };
}

export interface CompetitorProfile {
  url: string;
  name?: string;
  description?: string;
  features: string[];
  pricing?: {
    plans: Array<{
      name: string;
      price: string;
      features: string[];
    }>;
  };
  technologies?: string[];
  socialMediaLinks?: string[];
}

class WebScraperService {
  private defaultOptions: ScrapingOptions = {
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (compatible; CompetitorResearchBot/1.0)',
    includeMeta: true,
    includeImages: false,
    maxRetries: 3
  };

  /**
   * Scrape a website and extract content
   */
  async scrapeWebsite(url: string, options: ScrapingOptions = {}): Promise<ScrapedContent> {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      logger.info('Starting website scraping', { url, options: mergedOptions });

      // Check if we should use real scraping or fallback to mock
      const useRealScraping = process.env.ENABLE_REAL_WEB_SCRAPING === 'true' || process.env.NODE_ENV === 'production';
      
      let scrapedContent: ScrapedContent;
      
      if (useRealScraping) {
        // Use real web scraping
        scrapedContent = await this.performRealScraping(url, mergedOptions);
      } else {
        // Fallback to mock for development
        logger.warn('Using mock scraping - set ENABLE_REAL_WEB_SCRAPING=true for real data', { url });
        scrapedContent = await this.mockScrapeWebsite(url, mergedOptions);
      }
      
      const loadTime = Date.now() - startTime;
      
      const result = {
        ...scrapedContent,
        metadata: {
          ...scrapedContent.metadata,
          loadTime
        }
      };

      logger.info('Website scraping completed', {
        url,
        loadTime,
        wordCount: result.metadata.wordCount,
        linksFound: result.metadata.links.length,
        scrapingMethod: useRealScraping ? 'real' : 'mock'
      });

      return result;

    } catch (error) {
      logger.error('Website scraping failed', error instanceof Error ? error : new Error(String(error)), { url });
      throw error;
    }
  }

  /**
   * Extract competitor profile from a website
   */
  async extractCompetitorProfile(url: string): Promise<CompetitorProfile> {
    try {
      logger.info('Extracting competitor profile', { url });

      const scrapedContent = await this.scrapeWebsite(url, {
        includeMeta: true,
        includeImages: false
      });

      // Mock competitor profile extraction
      const profile: CompetitorProfile = {
        url,
        name: this.extractCompanyName(scrapedContent),
        description: this.extractDescription(scrapedContent),
        features: this.extractFeatures(scrapedContent),
        pricing: this.extractPricing(scrapedContent),
        technologies: this.extractTechnologies(scrapedContent),
        socialMediaLinks: this.extractSocialLinks(scrapedContent)
      };

      logger.info('Competitor profile extracted', {
        url,
        companyName: profile.name,
        featuresCount: profile.features.length,
        hasPricing: !!profile.pricing
      });

      return profile;

    } catch (error) {
      logger.error('Competitor profile extraction failed', error instanceof Error ? error : new Error(String(error)), { url });
      throw error;
    }
  }

  /**
   * Batch scrape multiple URLs
   */
  async scrapeMultiple(urls: string[], options: ScrapingOptions = {}): Promise<ScrapedContent[]> {
    try {
      logger.info('Starting batch scraping', { urlCount: urls.length });

      const results = await Promise.allSettled(
        urls.map(url => this.scrapeWebsite(url, options))
      );

      const successful = results
        .filter((result): result is PromiseFulfilledResult<ScrapedContent> => result.status === 'fulfilled')
        .map(result => result.value);

      const failed = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .length;

      logger.info('Batch scraping completed', {
        total: urls.length,
        successful: successful.length,
        failed
      });

      return successful;

    } catch (error) {
      logger.error('Batch scraping failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Mock scraping implementation for development/testing
   */
  private async mockScrapeWebsite(url: string, options: ScrapingOptions): Promise<ScrapedContent> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    const domain = new URL(url).hostname;
    const companyName = domain.split('.')[0];

    const mockContent = `
      Welcome to ${companyName}! We are a leading provider of innovative solutions.
      
      Our key features include:
      - Advanced analytics and reporting
      - Real-time data processing  
      - Scalable cloud infrastructure
      - Enterprise-grade security
      
      Pricing starts at $29/month for our basic plan.
      Contact us for enterprise pricing options.
      
      Follow us on social media for updates and insights.
    `;

    return {
      url,
      title: `${companyName} - Innovative Solutions`,
      content: mockContent,
      metadata: {
        statusCode: 200,
        timestamp: new Date().toISOString(),
        loadTime: 0, // Will be set by caller
        wordCount: mockContent.split(/\s+/).length,
        links: [
          `${url}/about`,
          `${url}/pricing`,
          `${url}/contact`,
          `${url}/blog`
        ],
        ...(options.includeImages ? {
          images: [
            `${url}/images/hero.jpg`,
            `${url}/images/product-screenshot.png`
          ]
        } : {}),
        ...(options.includeMeta ? {
          metaTags: {
            description: `${companyName} provides innovative solutions for modern businesses`,
            keywords: 'analytics, reporting, cloud, enterprise',
            'og:title': `${companyName} - Innovative Solutions`,
            'og:description': `Leading provider of analytics and cloud solutions`
          }
        } : {})
      }
    };
  }

  /**
   * Perform real web scraping using Puppeteer
   */
  private async performRealScraping(url: string, options: ScrapingOptions): Promise<ScrapedContent> {
    // Dynamic import to avoid bundling issues
    const puppeteer = await import('puppeteer');
    
    let browser;
    try {
      browser = await puppeteer.default.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent(options.userAgent || this.defaultOptions.userAgent!);
      
      // Set timeout and navigate
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: options.timeout || this.defaultOptions.timeout
      });
      
      // Extract content
      const result = await page.evaluate((opts) => {
        const title = document.title;
        const content = document.body?.innerText || '';
        
        // Extract links
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => (a as HTMLAnchorElement).href)
          .filter(href => href.startsWith('http'))
          .slice(0, 20); // Limit to 20 links
          
        // Extract images if requested
        const images = opts.includeImages ? 
          Array.from(document.querySelectorAll('img[src]'))
            .map(img => (img as HTMLImageElement).src)
            .filter(src => src.startsWith('http'))
            .slice(0, 10) : [];
            
        // Extract meta tags if requested
        const metaTags: Record<string, string> = {};
        if (opts.includeMeta) {
          document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            if (name && content) {
              metaTags[name] = content;
            }
          });
        }
        
        return {
          title,
          content,
          links,
          images,
          metaTags,
          wordCount: content.split(/\s+/).length
        };
      }, options);
      
      return {
        url,
        title: result.title,
        content: result.content,
        metadata: {
          statusCode: 200,
          timestamp: new Date().toISOString(),
          loadTime: 0, // Will be set by caller
          wordCount: result.wordCount,
          links: result.links,
          ...(options.includeImages ? { images: result.images } : {}),
          ...(options.includeMeta ? { metaTags: result.metaTags } : {})
        }
      };
      
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Extract company name from scraped content
   */
  private extractCompanyName(content: ScrapedContent): string {
    const domain = new URL(content.url).hostname;
    return content.title?.split(' - ')[0] || domain.split('.')[0];
  }

  /**
   * Extract company description
   */
  private extractDescription(content: ScrapedContent): string {
    const metaDescription = content.metadata.metaTags?.description;
    if (metaDescription) return metaDescription;

    // Extract first sentence or paragraph
    const sentences = content.content.split(/[.!?]+/);
    return sentences[0]?.trim() || 'No description available';
  }

  /**
   * Extract key features from content
   */
  private extractFeatures(content: ScrapedContent): string[] {
    const features: string[] = [];
    
    // Look for bullet points or feature lists
    const lines = content.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        features.push(trimmed.substring(1).trim());
      }
    }

    return features.slice(0, 10); // Limit to top 10 features
  }

  /**
   * Extract pricing information
   */
  private extractPricing(content: ScrapedContent): CompetitorProfile['pricing'] {
    const pricingRegex = /\$(\d+)(?:\/month|\/mo|\/year|\/yr)?/gi;
    const matches = content.content.match(pricingRegex);
    
    if (matches && matches.length > 0) {
      return {
        plans: matches.slice(0, 3).map((price, index) => ({
          name: ['Basic', 'Pro', 'Enterprise'][index] || `Plan ${index + 1}`,
          price,
          features: ['Basic features', 'Standard support']
        }))
      };
    }

    return undefined;
  }

  /**
   * Extract technology stack information
   */
  private extractTechnologies(content: ScrapedContent): string[] {
    const techKeywords = [
      'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'AWS', 
      'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'MongoDB', 
      'PostgreSQL', 'Redis', 'GraphQL', 'REST API'
    ];

    return techKeywords.filter(tech => 
      content.content.toLowerCase().includes(tech.toLowerCase())
    );
  }

  /**
   * Extract social media links
   */
  private extractSocialLinks(content: ScrapedContent): string[] {
    const socialDomains = ['twitter.com', 'linkedin.com', 'facebook.com', 'instagram.com'];
    return content.metadata.links.filter(link => 
      socialDomains.some(domain => link.includes(domain))
    );
  }
}

// Export singleton instance
export const webScraperService = new WebScraperService(); 