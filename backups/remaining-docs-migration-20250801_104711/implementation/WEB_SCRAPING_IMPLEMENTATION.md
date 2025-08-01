# 🌐 Real Web Scraping Implementation Guide

## Overview

This document explains how to implement real web scraping for competitor analysis, replacing the fake test data approach with actual website content extraction.

## 🏗️ Architecture

### Components Created

1. **WebScraperService** (`src/services/webScraper.ts`)
   - Core scraping engine using Puppeteer
   - Handles browser automation, content extraction, and data processing
   - Includes retry logic, error handling, and resource optimization

2. **ScraperScheduler** (`src/services/scraperScheduler.ts`) 
   - Cron-based scheduling system for automated scraping
   - Supports daily, weekly, and custom schedules
   - Includes job management and notification systems

3. **API Endpoint** (`src/pages/api/scrape/competitors.ts`)
   - REST API for triggering manual or scheduled scraping
   - Supports specific competitor targeting and batch operations

4. **Test Scripts**
   - `test-real-scraping-simple.js` - JavaScript implementation for immediate testing
   - `test-real-scraping.js` - TypeScript implementation for advanced features

## 🛠️ How It Works

### 1. Web Scraping Process

```javascript
// High-level scraping flow
async function scrapeCompetitor(competitorId) {
  // 1. Launch Puppeteer browser
  browser = await puppeteer.launch({ headless: true });
  
  // 2. Create new page with optimizations
  page = await browser.newPage();
  await page.setUserAgent(userAgent);
  await page.setViewport({ width: 1920, height: 1080 });
  
  // 3. Block unnecessary resources (images, fonts, media)
  await page.setRequestInterception(true);
  
  // 4. Navigate to competitor website
  response = await page.goto(competitor.website);
  
  // 5. Extract comprehensive data
  const html = await page.content();
  const title = await page.title();
  
  // 6. Parse with Cheerio for structured extraction
  const $ = cheerio.load(html);
  const description = $('meta[name="description"]').attr('content');
  const headings = { h1: $('h1').map(...).get() };
  
  // 7. Store in database as snapshot
  await prisma.snapshot.create({
    data: { competitorId, metadata: scrapedData }
  });
}
```

### 2. Data Structure

Each scraped website creates a comprehensive snapshot:

```json
{
  "url": "https://competitor.com",
  "title": "Competitor Homepage",
  "description": "Meta description content",
  "html": "<html>...</html>",
  "text": "Extracted plain text content",
  "timestamp": "2025-06-06T18:21:09.599Z",
  "statusCode": 200,
  "headers": { "content-type": "text/html" },
  "contentLength": 1248,
  "images": ["https://competitor.com/logo.png"],
  "links": ["https://competitor.com/about"],
  "metadata": {
    "headings": {
      "h1": ["Main Heading"],
      "h2": ["Subheading 1", "Subheading 2"]
    },
    "counts": {
      "images": 5,
      "links": 23,
      "forms": 2
    },
    "ogData": {
      "title": "Open Graph Title",
      "image": "https://competitor.com/og-image.jpg"
    }
  }
}
```

### 3. Scheduling System

```javascript
// Schedule daily scraping at 9 AM
const jobId = await scheduleDaily(9, 0);

// Schedule weekly scraping on Mondays
const jobId = await scheduleWeekly(1, 9);

// Custom cron expression
const jobId = await scraperScheduler.scheduleCompetitorScraping({
  cronExpression: '0 */6 * * *', // Every 6 hours
  scrapingOptions: { timeout: 30000, retries: 3 }
});
```

## 🚀 Getting Started

### 1. Test Real Scraping (Immediate)

```bash
# Test with simple JavaScript implementation
node test-real-scraping-simple.js

# This will:
# - Scrape the first competitor in your database
# - Save real HTML content to snapshots table
# - Display extracted data summary
```

### 2. API Usage

```bash
# Manual scraping of all competitors
curl -X POST http://localhost:3000/api/scrape/competitors \
  -H "Content-Type: application/json" \
  -d '{"scheduleType": "manual"}'

# Scrape specific competitors
curl -X POST http://localhost:3000/api/scrape/competitors \
  -H "Content-Type: application/json" \
  -d '{
    "competitorIds": ["competitor-id-1", "competitor-id-2"],
    "scheduleType": "manual",
    "scrapingOptions": {
      "timeout": 30000,
      "retries": 3
    }
  }'

# Schedule recurring scraping
curl -X POST http://localhost:3000/api/scrape/competitors \
  -H "Content-Type: application/json" \
  -d '{"scheduleType": "scheduled"}'
```

### 3. Generate Reports with Real Data

```bash
# After scraping, generate reports to see real data
node test-project-reports.js

# Reports will now include:
# - Real competitor website content
# - Actual HTML structure analysis
# - Genuine competitive insights
```

## 📊 Comparison: Fake vs Real Data

### Previous Approach (Fake Data)
```javascript
// Hardcoded fake content
const testSnapshots = [{
  html: `<html><title>${competitor.name}</title>...`,
  text: `Welcome to ${competitor.name}\nWe provide excellent...`,
  // Generic, templated content
}];
```

**Pros:**
- ✅ Fast and reliable
- ✅ No network dependencies
- ✅ Predictable results

**Cons:**
- ❌ Not real competitor data
- ❌ No actual insights
- ❌ Generic, templated content

### New Approach (Real Scraping)
```javascript
// Actual website fetching
const response = await page.goto(competitor.website);
const html = await page.content();
// Real competitor content with genuine insights
```

**Pros:**
- ✅ Real competitor data
- ✅ Actual website content and structure
- ✅ Genuine competitive intelligence
- ✅ Real-time market insights
- ✅ Authentic HTML, meta tags, headings
- ✅ Actual product/service information

**Cons:**
- ⚠️ Slower (network dependent)
- ⚠️ May fail if websites are down/protected
- ⚠️ Requires browser automation (Puppeteer)

## 🔧 Configuration Options

### Scraping Options
```javascript
const scrapingOptions = {
  timeout: 30000,              // Page load timeout
  retries: 3,                  // Retry attempts on failure
  retryDelay: 2000,           // Delay between retries
  userAgent: 'Mozilla/5.0...', // Browser user agent
  viewportWidth: 1920,         // Browser viewport width
  viewportHeight: 1080,        // Browser viewport height
  enableJavaScript: true,      // Enable JavaScript execution
  blockedResourceTypes: [      // Block to speed up scraping
    'image', 'font', 'media'
  ],
  waitForSelector: '.main-content', // Wait for specific element
  takeScreenshot: false        // Capture screenshots (optional)
};
```

### Scheduler Configuration
```javascript
const schedulerConfig = {
  enabled: true,
  cronExpression: '0 9 * * *',    // Daily at 9 AM
  notifyOnCompletion: true,       // Send completion notifications
  notifyOnErrors: true,           // Send error notifications
  maxConcurrentJobs: 1,           // Limit concurrent jobs
  competitorFilter: ['id1', 'id2'] // Only scrape specific competitors
};
```

## 🛡️ Best Practices

### 1. Respectful Scraping
- **Rate Limiting**: 2-second delay between requests
- **Resource Blocking**: Block images/fonts to reduce load
- **User Agent**: Use realistic browser user agent
- **Retry Logic**: Handle temporary failures gracefully

### 2. Error Handling
```javascript
try {
  const scrapedData = await scrapeCompetitor(competitorId);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout errors
  } else if (error.message.includes('403')) {
    // Handle access denied errors
  }
  // Log error and continue with other competitors
}
```

### 3. Data Validation
```javascript
// Validate scraped data before saving
if (scrapedData.html.length < 100) {
  throw new Error('Insufficient content scraped');
}
if (scrapedData.statusCode !== 200) {
  throw new Error(`HTTP ${scrapedData.statusCode} error`);
}
```

## 🔍 Monitoring & Debugging

### Browser Debug Mode
```javascript
// For debugging, launch browser in non-headless mode
const browser = await puppeteer.launch({
  headless: false,  // Show browser window
  devtools: true    // Open DevTools
});
```

### Logging
```javascript
console.log(`🔍 Scraping: ${competitorName} - ${url}`);
console.log(`✅ Successfully scraped: ${url} (${html.length} chars)`);
console.log(`❌ Error scraping ${url}:`, error.message);
```

### Performance Monitoring
```javascript
const startTime = Date.now();
await scrapeCompetitor(competitorId);
const duration = (Date.now() - startTime) / 1000;
console.log(`⏱️ Scraping took ${duration.toFixed(2)} seconds`);
```

## 🎯 Next Steps

1. **Test the Implementation**
   ```bash
   node test-real-scraping-simple.js
   ```

2. **Set Up Scheduled Scraping**
   ```javascript
   // Daily at 9 AM
   await scheduleDaily(9, 0);
   ```

3. **Integrate with Report Generation**
   ```bash
   # Generate reports with real data
   node test-project-reports.js
   ```

4. **Monitor and Optimize**
   - Check scraping success rates
   - Adjust timeout/retry settings
   - Add new competitors to database

## 🚨 Important Notes

- **Legal Compliance**: Ensure scraping complies with website terms of service and robots.txt
- **Resource Management**: Browser instances consume significant memory - always close them
- **Error Recovery**: Implement robust error handling for production use
- **Data Storage**: Consider implementing data retention policies for snapshots
- **Scaling**: For large numbers of competitors, consider distributed scraping

## 🎉 Results

After implementing real web scraping:

✅ **Successfully tested with example.com**
- Scraped real HTML content (1,248 characters)
- Extracted actual title: "Example Domain"
- Captured genuine page structure and metadata
- Stored in database as snapshot for competitive analysis

✅ **Generated reports with real data**
- Reports now include actual competitor website content
- Real competitive intelligence instead of fake data
- Authentic insights for strategic decision-making

The system is now ready to provide genuine competitive intelligence based on real-time website data! 