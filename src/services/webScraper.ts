import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ScrapedData {
  url: string;
  title: string;
  description: string;
  html: string;
  text: string;
  timestamp: Date;
  statusCode: number;
  headers: Record<string, string>;
  contentLength: number;
  images?: string[];
  links?: string[];
  metadata?: Record<string, any>;
}

export interface ScrapingOptions {
  timeout?: number;
  waitForSelector?: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  enableJavaScript?: boolean;
  takeScreenshot?: boolean;
  blockedResourceTypes?: string[];
  retries?: number;
  retryDelay?: number;
}

export class WebScraperService {
  private browser: Browser | null = null;
  private defaultOptions: ScrapingOptions = {
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewportWidth: 1920,
    viewportHeight: 1080,
    enableJavaScript: true,
    takeScreenshot: false,
    blockedResourceTypes: ['image', 'font', 'media'],
    retries: 3,
    retryDelay: 1000
  };

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-features=TranslateUI',
          '--disable-web-security',
          '--allow-running-insecure-content'
        ]
      });
      console.log('✅ Browser initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Close the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔒 Browser closed');
    }
  }

  /**
   * Scrape a single URL
   */
  async scrapeUrl(url: string, options: ScrapingOptions = {}): Promise<ScrapedData> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    let page: Page | null = null;

    try {
      if (!this.browser) {
        await this.initialize();
      }

      page = await this.browser!.newPage();

      // Set user agent and viewport
      await page.setUserAgent(mergedOptions.userAgent!);
      await page.setViewport({
        width: mergedOptions.viewportWidth!,
        height: mergedOptions.viewportHeight!
      });

      // Block unnecessary resources to speed up scraping
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        if (mergedOptions.blockedResourceTypes!.includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Set timeout
      page.setDefaultTimeout(mergedOptions.timeout!);

      console.log(`🔍 Scraping: ${url}`);

      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: mergedOptions.timeout
      });

      if (!response) {
        throw new Error('Failed to get response from page');
      }

      // Wait for specific selector if provided
      if (mergedOptions.waitForSelector) {
        await page.waitForSelector(mergedOptions.waitForSelector, {
          timeout: 5000
        }).catch(() => {
          console.warn(`⚠️ Selector ${mergedOptions.waitForSelector} not found, continuing...`);
        });
      }

      // Get page content
      const html = await page.content();
      const title = await page.title();

      // Use Cheerio to parse HTML and extract additional data
      const $ = cheerio.load(html);
      
      // Extract meta description
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || 
                         $('meta[name="twitter:description"]').attr('content') || 
                         '';

      // Extract text content (remove scripts and styles)
      $('script, style, nav, footer, header, aside').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      // Extract images
      const images: string[] = [];
      $('img').each((_, element) => {
        const src = $(element).attr('src');
        if (src && !src.startsWith('data:')) {
          const absoluteUrl = new URL(src, url).href;
          images.push(absoluteUrl);
        }
      });

      // Extract links
      const links: string[] = [];
      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            const absoluteUrl = new URL(href, url).href;
            links.push(absoluteUrl);
          } catch (e) {
            // Invalid URL, skip
          }
        }
      });

      // Extract additional metadata
      const metadata: Record<string, any> = {
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
        ogImage: $('meta[property="og:image"]').attr('content') || '',
        ogUrl: $('meta[property="og:url"]').attr('content') || '',
        canonical: $('link[rel="canonical"]').attr('href') || '',
        viewport: $('meta[name="viewport"]').attr('content') || '',
        robots: $('meta[name="robots"]').attr('content') || '',
        author: $('meta[name="author"]').attr('content') || '',
        keywords: $('meta[name="keywords"]').attr('content') || '',
        generator: $('meta[name="generator"]').attr('content') || '',
        language: $('html').attr('lang') || '',
        headings: {
          h1: $('h1').map((_, el) => $(el).text().trim()).get(),
          h2: $('h2').map((_, el) => $(el).text().trim()).get(),
          h3: $('h3').map((_, el) => $(el).text().trim()).get()
        },
        forms: $('form').length,
        buttons: $('button, input[type="button"], input[type="submit"]').length,
        inputElements: $('input, textarea, select').length
      };

      // Get response headers
      const headers: Record<string, string> = {};
      const responseHeaders = response.headers();
      Object.keys(responseHeaders).forEach(key => {
        headers[key] = responseHeaders[key];
      });

      const scrapedData: ScrapedData = {
        url,
        title: title || '',
        description: description || '',
        html,
        text: text.substring(0, 10000), // Limit text length
        timestamp: new Date(),
        statusCode: response.status(),
        headers,
        contentLength: html.length,
        images: images.slice(0, 20), // Limit images
        links: Array.from(new Set(links)).slice(0, 50), // Unique links, limited
        metadata
      };

      console.log(`✅ Successfully scraped: ${url} (${html.length} chars)`);
      return scrapedData;

    } catch (error) {
      console.error(`❌ Error scraping ${url}:`, error);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Scrape a competitor and create a snapshot
   */
  async scrapeCompetitor(competitorId: string, options: ScrapingOptions = {}): Promise<string> {
    try {
      // Get competitor details
      const competitor = await prisma.competitor.findUnique({
        where: { id: competitorId }
      });

      if (!competitor) {
        throw new Error(`Competitor with ID ${competitorId} not found`);
      }

      console.log(`📊 Scraping competitor: ${competitor.name} (${competitor.website})`);

      // Scrape the competitor's website
      const scrapedData = await this.scrapeUrl(competitor.website, options);

      // Create snapshot in database with comprehensive logging
      console.log('📊 Creating snapshot record via WebScraperService', {
        competitorId: competitor.id,
        competitorName: competitor.name,
        url: competitor.website,
        dataSize: JSON.stringify(scrapedData).length,
        hasContent: !!(scrapedData.html || scrapedData.text),
        statusCode: scrapedData.statusCode,
        contentLength: scrapedData.contentLength,
        timestamp: new Date().toISOString()
      });

      const snapshot = await prisma.snapshot.create({
        data: {
          competitorId: competitor.id,
          metadata: scrapedData as any,
          captureStartTime: new Date(),
          captureEndTime: new Date(),
          captureSuccess: true,
          captureSize: JSON.stringify(scrapedData).length
        }
      });

      console.log('✅ Snapshot created successfully via WebScraperService', {
        snapshotId: snapshot.id,
        competitorId: competitor.id,
        competitorName: competitor.name,
        createdAt: snapshot.createdAt,
        metadataSize: JSON.stringify(snapshot.metadata).length,
        captureSuccess: snapshot.captureSuccess
      });

      console.log(`💾 Created snapshot: ${snapshot.id} for ${competitor.name}`);
      return snapshot.id;

    } catch (error) {
      console.error(`❌ Error scraping competitor ${competitorId}:`, error);
      throw error;
    }
  }

  /**
   * Scrape all competitors
   */
  async scrapeAllCompetitors(options: ScrapingOptions = {}): Promise<string[]> {
    try {
      console.log('🌐 Starting to scrape all competitors...');

      const competitors = await prisma.competitor.findMany({
        select: {
          id: true,
          name: true,
          website: true
        }
      });

      if (competitors.length === 0) {
        console.log('📭 No competitors found to scrape');
        return [];
      }

      console.log(`📋 Found ${competitors.length} competitors to scrape`);

      const results: string[] = [];
      const errors: Array<{ competitorId: string; error: string }> = [];

      // Process competitors sequentially to avoid overwhelming target sites
      for (const competitor of competitors) {
        try {
          console.log(`\n🎯 Processing: ${competitor.name}`);
          const snapshotId = await this.scrapeCompetitor(competitor.id, options);
          results.push(snapshotId);
          
          // Add delay between requests to be respectful
          if (competitors.indexOf(competitor) < competitors.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error(`❌ Failed to scrape ${competitor.name}:`, error);
          errors.push({
            competitorId: competitor.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      console.log(`\n📊 Scraping Summary:`);
      console.log(`✅ Successful: ${results.length}/${competitors.length}`);
      console.log(`❌ Failed: ${errors.length}/${competitors.length}`);

      if (errors.length > 0) {
        console.log(`\n❌ Errors:`);
        errors.forEach(({ competitorId, error }) => {
          console.log(`- ${competitorId}: ${error}`);
        });
      }

      return results;

    } catch (error) {
      console.error('❌ Error in scrapeAllCompetitors:', error);
      throw error;
    }
  }

  /**
   * Scrape competitors with retry logic
   */
  async scrapeWithRetry(url: string, options: ScrapingOptions = {}): Promise<ScrapedData> {
    const maxRetries = options.retries || this.defaultOptions.retries!;
    const retryDelay = options.retryDelay || this.defaultOptions.retryDelay!;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.scrapeUrl(url, options);
      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed for ${url}:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }

    throw new Error('All retry attempts failed');
  }
}

// Singleton instance
export const webScraperService = new WebScraperService();

// Utility functions
export async function scrapeCompetitorWebsite(competitorId: string, options?: ScrapingOptions): Promise<string> {
  return await webScraperService.scrapeCompetitor(competitorId, options);
}

export async function scrapeAllCompetitorWebsites(options?: ScrapingOptions): Promise<string[]> {
  return await webScraperService.scrapeAllCompetitors(options);
}

export async function initializeWebScraper(): Promise<void> {
  await webScraperService.initialize();
}

export async function closeWebScraper(): Promise<void> {
  await webScraperService.close();
} 