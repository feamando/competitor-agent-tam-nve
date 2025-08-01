# TP-015-20250801-Comprehensive-Web-Scraping-Enhancement

## Overview
- **Goal**: Enable comprehensive scraping of all pages on product and competitor websites instead of just homepages
- **Project Name**: Competitor Research Agent - Full Website Scraping
- **Date**: 2025-08-01
- **RequestID**: TP-015-20250801-comprehensive-web-scraping-enhancement

## Pre-requisites
- **Git Branch Creation**: `git checkout -b feature/comprehensive-web-scraping-20250801-TP-015`
- **Environment**: Node.js development environment with existing scraping infrastructure
- **Dependencies**: Existing web scraping services, Bedrock integration, Prisma database
- **Tools**: Puppeteer/Playwright for dynamic content, XML parsing libraries

## Dependencies
- **Internal Services**: WebScraperService, ProductScrapingService, CompetitorSnapshotTrigger
- **External Services**: AWS Bedrock (Claude models), existing proxy infrastructure
- **Database**: Prisma ORM with PostgreSQL, existing Snapshot/ProductSnapshot schemas
- **Libraries**: XML parsing (xml2js), content compression (zlib), rate limiting utilities
- **Memory Systems**: Existing memory optimization utilities from TP-010

## Task Breakdown (Atomic Tasks - Execute ONE at a time)

### PHASE 1: Basic Infrastructure Setup
- [ ] 1.1 Create `src/types/crawling.ts` file
- [ ] 1.2 Add `CrawlUrl` interface to crawling types
- [ ] 1.3 Add `SitemapEntry` interface to crawling types
- [ ] 1.4 Add `CrawlQueue` interface to crawling types
- [ ] 1.5 Create `src/services/crawling/` directory
- [ ] 1.6 Create empty `SitemapService.ts` file
- [ ] 1.7 Add class declaration for `SitemapService`
- [ ] 1.8 Add constructor method to `SitemapService`
- [ ] 1.9 Install `xml2js` package dependency
- [ ] 1.10 Add `xml2js` import to `SitemapService`

### PHASE 2: Sitemap Discovery
- [ ] 2.1 Add `discoverSitemap` method signature to `SitemapService`
- [ ] 2.2 Implement sitemap.xml URL construction logic
- [ ] 2.3 Add HTTP request for sitemap.xml file
- [ ] 2.4 Add error handling for missing sitemap files
- [ ] 2.5 Add XML parsing for sitemap content
- [ ] 2.6 Add URL extraction from parsed sitemap
- [ ] 2.7 Add priority extraction from sitemap entries
- [ ] 2.8 Add lastmod date extraction from sitemap entries
- [ ] 2.9 Add return type for discovered URLs
- [ ] 2.10 Add logging for sitemap discovery process

### PHASE 3: Sitemap Index Support
- [ ] 3.1 Add `parseSitemapIndex` method signature
- [ ] 3.2 Add sitemap index file detection logic
- [ ] 3.3 Add recursive sitemap fetching for index files
- [ ] 3.4 Add URL deduplication for multiple sitemaps
- [ ] 3.5 Add error handling for malformed sitemap indexes
- [ ] 3.6 Add timeout handling for slow sitemap responses
- [ ] 3.7 Add retry logic for failed sitemap requests
- [ ] 3.8 Add validation for sitemap URL formats
- [ ] 3.9 Add maximum sitemap size limits
- [ ] 3.10 Add sitemap caching with TTL

### PHASE 4: Basic Web Crawler Setup
- [ ] 4.1 Create empty `WebCrawlerService.ts` file
- [ ] 4.2 Add class declaration for `WebCrawlerService`
- [ ] 4.3 Add constructor with dependencies
- [ ] 4.4 Add `crawlQueue` property as array
- [ ] 4.5 Add `visitedUrls` property as Set
- [ ] 4.6 Add `maxDepth` configuration property
- [ ] 4.7 Add `maxPages` configuration property
- [ ] 4.8 Add `crawlDelay` configuration property
- [ ] 4.9 Add rate limiting service import
- [ ] 4.10 Add logger import and setup

### PHASE 5: URL Queue Management
- [ ] 5.1 Add `addToQueue` method signature
- [ ] 5.2 Implement URL validation in `addToQueue`
- [ ] 5.3 Add duplicate URL checking in `addToQueue`
- [ ] 5.4 Add domain filtering in `addToQueue`
- [ ] 5.5 Add depth tracking in `addToQueue`
- [ ] 5.6 Add priority sorting in queue
- [ ] 5.7 Add `getNextUrl` method for queue processing
- [ ] 5.8 Add queue size limits
- [ ] 5.9 Add queue persistence for recovery
- [ ] 5.10 Add queue statistics tracking

### PHASE 6: Page Fetching
- [ ] 6.1 Add `fetchPage` method signature
- [ ] 6.2 Add HTTP client setup with user agent
- [ ] 6.3 Add request timeout configuration
- [ ] 6.4 Add response status code checking
- [ ] 6.5 Add content-type validation
- [ ] 6.6 Add response size limits
- [ ] 6.7 Add HTML content extraction
- [ ] 6.8 Add error handling for network failures
- [ ] 6.9 Add retry logic for failed requests
- [ ] 6.10 Add response caching

### PHASE 7: Link Extraction
- [ ] 7.1 Add `extractLinks` method signature
- [ ] 7.2 Install `cheerio` package dependency
- [ ] 7.3 Add `cheerio` import for HTML parsing
- [ ] 7.4 Add anchor tag selection (`<a href="">`)
- [ ] 7.5 Add relative URL resolution to absolute URLs
- [ ] 7.6 Add same-domain URL filtering
- [ ] 7.7 Add URL sanitization (remove fragments)
- [ ] 7.8 Add link text extraction for context
- [ ] 7.9 Add skip logic for non-content links (CSS, JS)
- [ ] 7.10 Add extracted links validation

### PHASE 8: Content Processing Setup
- [ ] 8.1 Create `src/lib/scraping/` directory
- [ ] 8.2 Create empty `ContentProcessor.ts` file
- [ ] 8.3 Add class declaration for `ContentProcessor`
- [ ] 8.4 Add constructor method
- [ ] 8.5 Add cheerio import for HTML parsing
- [ ] 8.6 Add `ProcessedContent` interface to types
- [ ] 8.7 Add `ContentFilter` interface to types
- [ ] 8.8 Add content filtering configuration
- [ ] 8.9 Add logger setup
- [ ] 8.10 Add error handling setup

### PHASE 9: Content Extraction
- [ ] 9.1 Add `extractMainContent` method signature
- [ ] 9.2 Add navigation element removal (`nav`, `header`, `footer`)
- [ ] 9.3 Add sidebar element removal
- [ ] 9.4 Add advertisement element removal (by class/id patterns)
- [ ] 9.5 Add main content area detection
- [ ] 9.6 Add text content extraction from main area
- [ ] 9.7 Add title extraction from `<title>` tag
- [ ] 9.8 Add meta description extraction
- [ ] 9.9 Add heading tags extraction (h1-h6)
- [ ] 9.10 Add paragraph content extraction

### PHASE 10: Content Filtering
- [ ] 10.1 Add `filterContent` method signature
- [ ] 10.2 Add minimum content length validation
- [ ] 10.3 Add duplicate content detection using hashing
- [ ] 10.4 Add keyword relevance scoring
- [ ] 10.5 Add content quality scoring algorithm
- [ ] 10.6 Add language detection for content
- [ ] 10.7 Add spam content filtering
- [ ] 10.8 Add boilerplate text removal
- [ ] 10.9 Add content truncation for size limits
- [ ] 10.10 Add filtered content validation

### PHASE 11: Data Compression Setup
- [ ] 11.1 Create empty `DataCompressor.ts` file
- [ ] 11.2 Add class declaration for `DataCompressor`
- [ ] 11.3 Add zlib import for compression
- [ ] 11.4 Add constructor method
- [ ] 11.5 Add `CompressedData` interface to types
- [ ] 11.6 Add compression configuration options
- [ ] 11.7 Add compression ratio tracking
- [ ] 11.8 Add decompression method signature
- [ ] 11.9 Add compression error handling
- [ ] 11.10 Add compression statistics

### PHASE 12: Text Compression Implementation
- [ ] 12.1 Add `compressText` method signature
- [ ] 12.2 Implement gzip compression for text content
- [ ] 12.3 Add compression level configuration
- [ ] 12.4 Add pre-compression text optimization
- [ ] 12.5 Add compression size validation
- [ ] 12.6 Add compression metadata storage
- [ ] 12.7 Add `decompressText` method implementation
- [ ] 12.8 Add compression integrity checking
- [ ] 12.9 Add compression performance monitoring
- [ ] 12.10 Add fallback for compression failures

### PHASE 13: Content Chunking
- [ ] 13.1 Add `chunkContent` method signature
- [ ] 13.2 Add maximum chunk size configuration
- [ ] 13.3 Add sentence-boundary chunking logic
- [ ] 13.4 Add paragraph-boundary chunking logic
- [ ] 13.5 Add chunk overlap configuration
- [ ] 13.6 Add chunk metadata tracking
- [ ] 13.7 Add chunk reassembly method
- [ ] 13.8 Add chunk validation
- [ ] 13.9 Add chunk size optimization
- [ ] 13.10 Add chunk indexing for retrieval

### PHASE 14: Change Detection Setup
- [ ] 14.1 Create empty `ChangeDetector.ts` file
- [ ] 14.2 Add class declaration for `ChangeDetector`
- [ ] 14.3 Add crypto import for hashing
- [ ] 14.4 Add constructor method
- [ ] 14.5 Add `ContentHash` interface to types
- [ ] 14.6 Add `ChangeResult` interface to types
- [ ] 14.7 Add hash storage configuration
- [ ] 14.8 Add change detection thresholds
- [ ] 14.9 Add logger setup
- [ ] 14.10 Add database integration setup

### PHASE 15: Content Hashing
- [ ] 15.1 Add `generateContentHash` method signature
- [ ] 15.2 Implement SHA-256 hashing for content
- [ ] 15.3 Add content normalization before hashing
- [ ] 15.4 Add hash storage in database
- [ ] 15.5 Add hash retrieval method
- [ ] 15.6 Add hash comparison method
- [ ] 15.7 Add hash expiration logic
- [ ] 15.8 Add hash collision handling
- [ ] 15.9 Add hash performance optimization
- [ ] 15.10 Add hash validation

### PHASE 16: Rate Limiting Extension
- [ ] 16.1 Open existing `rateLimitingService.ts` file
- [ ] 16.2 Add `CrawlingRateLimit` interface
- [ ] 16.3 Add domain-specific rate limiting
- [ ] 16.4 Add concurrent request limiting per domain
- [ ] 16.5 Add adaptive rate limiting based on response times
- [ ] 16.6 Add rate limit configuration per website
- [ ] 16.7 Add rate limit statistics tracking
- [ ] 16.8 Add rate limit violation handling
- [ ] 16.9 Add exponential backoff implementation
- [ ] 16.10 Add rate limit reset scheduling

### PHASE 17: Database Schema Extension
- [ ] 17.1 Open `prisma/schema.prisma` file
- [ ] 17.2 Add `CrawledPage` model definition
- [ ] 17.3 Add `url` field to `CrawledPage` model
- [ ] 17.4 Add `content` field to `CrawledPage` model
- [ ] 17.5 Add `contentHash` field to `CrawledPage` model
- [ ] 17.6 Add `crawledAt` field to `CrawledPage` model
- [ ] 17.7 Add `depth` field to `CrawledPage` model
- [ ] 17.8 Add indexes for efficient querying
- [ ] 17.9 Add foreign key relationships
- [ ] 17.10 Generate Prisma migration

### PHASE 18: Bedrock Integration Updates
- [ ] 18.1 Open existing Bedrock service file
- [ ] 18.2 Add `processLargeContent` method signature
- [ ] 18.3 Add content size checking before processing
- [ ] 18.4 Add automatic content chunking for large datasets
- [ ] 18.5 Add chunk processing with context preservation
- [ ] 18.6 Add result aggregation from multiple chunks
- [ ] 18.7 Add error handling for partial failures
- [ ] 18.8 Add progress tracking for long operations
- [ ] 18.9 Add timeout handling for slow processing
- [ ] 18.10 Add retry logic for failed chunks

### PHASE 19: Crawling Coordination
- [ ] 19.1 Create empty `CrawlingCoordinator.ts` file
- [ ] 19.2 Add class declaration for `CrawlingCoordinator`
- [ ] 19.3 Add dependency injection for all services
- [ ] 19.4 Add `startCrawl` method signature
- [ ] 19.5 Add crawl orchestration logic
- [ ] 19.6 Add error handling for service failures
- [ ] 19.7 Add progress reporting
- [ ] 19.8 Add crawl cancellation support
- [ ] 19.9 Add crawl resumption support
- [ ] 19.10 Add crawl completion notification

### PHASE 20: Basic Testing & Validation
- [ ] 20.1 Create test file for `SitemapService`
- [ ] 20.2 Add unit test for sitemap discovery
- [ ] 20.3 Add unit test for URL extraction
- [ ] 20.4 Create test file for `WebCrawlerService`
- [ ] 20.5 Add unit test for queue management
- [ ] 20.6 Add unit test for link extraction
- [ ] 20.7 Create test file for `ContentProcessor`
- [ ] 20.8 Add unit test for content filtering
- [ ] 20.9 Add integration test for end-to-end crawling
- [ ] 20.10 Add performance test for large website crawling

## Implementation Guidelines

### Key Approaches and Technologies
- **Sitemap-First Strategy**: Prioritize XML sitemap discovery for comprehensive URL collection
- **Respectful Crawling**: Implement delays, rate limiting, and robots.txt compliance
- **Memory-Efficient Processing**: Leverage existing memory optimization patterns from TP-010
- **Incremental Updates**: Use content hashing and timestamps to avoid redundant processing
- **Modular Architecture**: Build reusable components that can be extended for different use cases

### Reference Existing Components
- `src/lib/reports/memoryOptimizedReports.ts` - for memory-efficient data processing patterns
- `src/services/rateLimitingService.ts` - for extending rate limiting capabilities
- `src/lib/monitoring/memoryMonitoring.ts` - for performance monitoring patterns
- `src/services/webScraper.ts` - base scraping functionality to extend

### Performance Considerations
- **Concurrent Processing**: Limit concurrent requests per domain to avoid overwhelming servers
- **Memory Management**: Use streaming processing for large datasets
- **Storage Optimization**: Implement compression and selective storage strategies
- **Caching Strategy**: Cache frequently accessed content with appropriate TTL settings

## Proposed File Structure
```
src/
├── services/
│   └── crawling/
│       ├── SitemapService.ts          # XML sitemap discovery and parsing
│       ├── WebCrawlerService.ts       # Comprehensive crawling engine
│       └── CrawlingCoordinator.ts     # Orchestrates crawling operations
├── lib/
│   └── scraping/
│       ├── ContentProcessor.ts        # Content filtering and extraction
│       ├── DataCompressor.ts         # Payload compression for Bedrock
│       └── ChangeDetector.ts         # Incremental update detection
└── types/
    └── crawling.ts                   # Type definitions for crawling operations
```

## Edge Cases & Error Handling
- **Infinite Crawling**: Implement depth limits and visited URL tracking
- **Rate Limiting**: Handle 429 responses with exponential backoff
- **Content Changes**: Manage scenarios where page structure changes during crawling
- **Memory Overflow**: Implement circuit breakers for excessive memory usage
- **Network Failures**: Add retry logic with exponential backoff for failed requests
- **Malformed Sitemaps**: Graceful fallback to link following when sitemaps are invalid
- **Dynamic Content**: Handle JavaScript-rendered content with appropriate rendering
- **Legal Compliance**: Respect robots.txt and implement crawling boundaries

## Code Review Guidelines
- **Memory Efficiency**: Verify all large data operations use streaming or chunking
- **Rate Limiting**: Ensure all external requests respect configured limits
- **Error Handling**: Check comprehensive error handling for network and parsing failures
- **Code Reusability**: Verify modular design allows for extension to new website types
- **Performance Monitoring**: Confirm monitoring and logging for operational visibility
- **Ethical Compliance**: Validate respect for robots.txt and rate limiting implementations

## Acceptance Testing Checklist

### Functional Requirements
- [ ] System can discover and parse XML sitemaps from target websites
- [ ] Crawler can follow links and discover all accessible pages within domain boundaries
- [ ] Content filtering extracts relevant information and removes boilerplate content
- [ ] Data compression reduces payload sizes while preserving essential information
- [ ] Incremental updates detect changes and avoid re-processing unchanged content
- [ ] Rate limiting prevents overwhelming target websites with requests
- [ ] Bedrock integration handles large datasets through chunking and summarization

### Performance Requirements
- [ ] Memory usage remains stable during large-scale crawling operations
- [ ] Crawling speed adapts to server response times and respects rate limits
- [ ] Storage efficiency through compression reduces database size by at least 40%
- [ ] Change detection reduces redundant processing by at least 60%
- [ ] System handles crawling of 1000+ page websites without memory issues

### Quality Requirements
- [ ] All scraped content maintains accuracy and completeness
- [ ] Error handling gracefully manages network failures and malformed content
- [ ] Monitoring provides visibility into crawling performance and issues
- [ ] Compliance with robots.txt and ethical scraping practices
- [ ] Integration tests validate end-to-end functionality

### Integration Requirements
- [ ] Enhanced scraping integrates seamlessly with existing analysis services
- [ ] Database schema changes maintain compatibility with existing data
- [ ] Bedrock integration handles large content datasets without errors
- [ ] Queue recovery system manages failed crawling operations
- [ ] Memory optimization prevents resource exhaustion during large operations

## Notes / Open Questions
- **Legal Considerations**: Review terms of service for target websites to ensure compliance
- **Performance Scaling**: Consider distributed crawling for very large websites (10,000+ pages)
- **Content Classification**: Explore ML-based content classification for improved relevance scoring
- **Real-time Updates**: Investigate webhook or RSS feed integration for real-time content changes
- **Competitive Intelligence**: Evaluate specific content extraction patterns for competitor analysis 