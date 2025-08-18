# TP-014 Task 2.0: Data Model Compatibility Assessment

## Overview
This document provides a detailed assessment of how current database models and snapshot content structures align with CompAI prompt requirements, identifying transformation needs and mapping strategies.

## 2.1 CompAI Prompt Placeholder Mapping

### CompAI Template Variables → Database Field Mapping

#### Product Information Mapping
```typescript
// CompAI Variable: [PRODUCT_NAME]
// Current Mapping: project.products[0].name
// Database Source: Product.name
// Status: ✅ Direct mapping available

// CompAI Variable: [PRODUCT_INFO] 
// Current Mapping: Structured Product model data
// Database Sources: 
Product: {
  name: String,        // Product name
  website: String,     // Product website URL
  positioning: String, // Positioning statement  
  customerData: String,// Customer segments
  userProblem: String, // Customer problems/needs
  industry: String     // Industry classification
}
// Status: ✅ All required fields available

// CompAI Variable: [PRODUCT_WEBSITE_HTML]
// Current Mapping: ProductSnapshot.content.html
// Database Source: ProductSnapshot.content (JSON)
Current Structure:
{
  html: string,           // Raw HTML content
  text: string,           // Extracted text content
  title: string,          // Page title
  description: string,    // Meta description
  url: string,            // Source URL
  timestamp: Date         // Capture timestamp
}
// Status: ✅ HTML content available
```

#### Competitor Information Mapping  
```typescript
// CompAI Variable: [LIST_OF_COMPETITOR_HTML_FILES]
// Current Mapping: competitor Snapshot.metadata array
// Database Source: Snapshot.metadata (JSON)
Current Structure (Competitor Snapshots):
{
  html: string,           // Raw HTML content
  text: string,           // Extracted text content  
  title: string,          // Page title
  description: string,    // Meta description
  url: string,            // Source URL
  metadata: {
    scrapedAt: string,    // ISO timestamp
    contentLength: number, // HTML content length
    statusCode: number,    // HTTP response code
    headers: object,       // HTTP response headers
    scrapingMethod: string // Scraping approach used
  }
}
// Status: ✅ HTML content available in metadata field
```

#### Freshness Data Mapping
```typescript
// CompAI Variable: [LAST_ANALYSIS_DATE]  
// Current Mapping: project freshnessStatus data
// Database Sources: 
ProductSnapshot.createdAt  // Latest product snapshot date
Snapshot.createdAt        // Latest competitor snapshot dates
// Status: ✅ Freshness tracking available via SmartScheduling
```

## 2.2 Missing Data Fields Analysis

### ✅ Available Data Fields
All CompAI template requirements are met by current database structure:

1. **Product Information** - Complete coverage via Product model
2. **Product Website HTML** - Available via ProductSnapshot.content.html  
3. **Competitor Website HTML** - Available via Snapshot.metadata.html
4. **Last Analysis Date** - Available via snapshot timestamps

### ⚠️ Data Format Differences
While all data is available, format transformation is needed:

#### Current Format vs CompAI Expectations
```typescript
// CURRENT: ProductSnapshot content structure
{
  content: {
    html: "<html>...</html>",     // Raw HTML
    text: "extracted text...",    // Processed text
    title: "Page Title",          // Meta title
    description: "Page desc",     // Meta description
    url: "https://...",           // Source URL
    timestamp: "2025-01-01T..."   // Capture time
  },
  metadata: {
    scrapingDuration: 1200,       // Performance metrics
    contentLength: 8500,          // Content size
    statusCode: 200,              // HTTP status
    // ... additional metadata
  }
}

// COMPAI EXPECTS: Raw HTML strings
[PRODUCT_WEBSITE_HTML] = "<html>...</html>"
[LIST_OF_COMPETITOR_HTML_FILES] = [
  "Competitor_1.html: <html>...</html>",
  "Competitor_2.html: <html>...</html>"
]
```

#### Competitor Data Structure Differences
```typescript
// CURRENT: Competitor snapshots in Snapshot.metadata
{
  metadata: {
    html: "<html>...</html>",     // HTML content
    text: "extracted text...",    // Text content  
    title: "Page Title",          // Page title
    description: "Page desc",     // Description
    url: "https://...",           // Source URL
    scrapedAt: "2025-01-01T...",  // Capture timestamp
    // ... scraping metadata
  }
}

// COMPAI EXPECTS: Array of HTML files with competitor names
[LIST_OF_COMPETITOR_HTML_FILES] = [
  "${competitor1.name}_Website.html: ${html1}",
  "${competitor2.name}_Website.html: ${html2}"
]
```

## 2.3 Current Snapshot Content Structure Assessment

### ProductSnapshot Content Analysis
Based on codebase analysis (`src/services/productScrapingService.ts` and `src/services/domains/data/ProductScrapingModule.ts`):

```typescript
interface ProductSnapshotContent {
  html: string;           // ✅ Raw HTML - Perfect for CompAI
  text: string;           // ✅ Extracted text - Additional context
  title: string;          // ✅ Page title - Metadata for CompAI
  description: string;    // ✅ Meta description - SEO context
  url: string;            // ✅ Source URL - Required for citations
  timestamp: Date;        // ✅ Capture time - Freshness tracking
}

interface ProductSnapshotMetadata {
  scrapedAt: string;         // ISO timestamp
  correlationId: string;     // Request tracking
  contentLength: number;     // Content size metrics
  scrapingDuration: number;  // Performance metrics
  textLength: number;        // Text content length
  titleLength: number;       // Title length
  scrapingMethod: string;    // Scraping approach
  validationPassed: boolean; // Quality validation
  retryCount: number;        // Retry attempts
  headers: object;           // HTTP response headers
  statusCode: number;        // HTTP response code
  lastModified: string;      // Last-Modified header
  htmlLength: number;        // HTML content length
  qualityScore: number;      // Content quality score
  contentQuality: object;    // Detailed quality metrics
}
```

**Assessment:** ✅ **Fully Compatible**
- HTML content is stored as raw string in `content.html`
- All required metadata for quality assessment available
- Content extraction methods already implemented
- No structural changes needed for ProductSnapshot

### Competitor Snapshot Content Analysis  
Based on codebase analysis (`src/services/competitorSnapshotTrigger.ts`):

```typescript
// Competitor snapshots stored in Snapshot.metadata (different structure!)
interface CompetitorSnapshotStructure {
  metadata: {
    html: string;           // ✅ Raw HTML content
    text: string;           // ✅ Extracted text
    title: string;          // ✅ Page title  
    description: string;    // ✅ Meta description
    url: string;            // ✅ Source URL
    metadata: {             // Nested metadata object
      statusCode: number;   // HTTP response code
      headers: object;      // Response headers
      // ... additional scraping metadata
    }
  }
}
```

**Assessment:** ⚠️ **Requires Transformation**
- HTML content available but stored in nested `metadata.html`  
- Different structure than ProductSnapshot (content vs metadata)
- Extraction methods already exist (`extractCompetitorContent()`)
- Compatible data, but needs format standardization

## 2.4 Data Transformation Layer Design

### Required Transformations

#### 1. Product Information Formatter
```typescript
// Transform Product model to CompAI [PRODUCT_INFO] format
interface CompAIProductInfo {
  name: string;
  website: string; 
  industry: string;
  description: string;        // From Product.positioning
  targetCustomers: string;    // From Product.customerData  
  customerProblems: string;   // From Product.userProblem
  solutions: string;          // How product addresses problems
}

function formatProductInfo(product: Product): string {
  return `
**Product Name:** ${product.name}
**Website:** ${product.website}
**Industry:** ${product.industry}
**Product Description:** ${product.positioning}
**Target Customer Segments:** ${product.customerData}
**Customer Problems/Needs:** ${product.userProblem}
**How Our Product Addresses Them:** ${product.positioning}
  `.trim();
}
```

#### 2. HTML Content Extractor
```typescript
// Extract raw HTML for CompAI template
function extractProductWebsiteHTML(productSnapshot: ProductSnapshot): string {
  if (!productSnapshot?.content?.html) {
    throw new Error('Product website HTML content not available');
  }
  return productSnapshot.content.html;
}

function extractCompetitorHTMLFiles(
  competitors: Array<{competitor: Competitor, snapshot: Snapshot}>
): string {
  return competitors.map((comp, index) => {
    const html = comp.snapshot.metadata?.html || '';
    const competitorName = comp.competitor.name.replace(/[^a-zA-Z0-9]/g, '_');
    return `**${competitorName}_Website.html:**\n${html}`;
  }).join('\n\n');
}
```

#### 3. Last Analysis Date Formatter
```typescript
// Format freshness data for CompAI template  
function formatLastAnalysisDate(freshnessStatus: ProjectFreshnessStatus): string {
  // Find most recent analysis date across all snapshots
  const productDates = freshnessStatus.products
    .filter(p => p.lastSnapshot)
    .map(p => new Date(p.lastSnapshot!));
  
  const competitorDates = freshnessStatus.competitors
    .filter(c => c.lastSnapshot) 
    .map(c => new Date(c.lastSnapshot!));
    
  const allDates = [...productDates, ...competitorDates];
  if (allDates.length === 0) {
    return 'No previous analysis available';
  }
  
  const mostRecent = new Date(Math.max(...allDates.map(d => d.getTime())));
  return mostRecent.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  });
}
```

### Transformation Service Architecture

```typescript
// New service: src/services/analysis/compaiPromptBuilder.ts
export class CompAIPromptBuilder {
  
  /**
   * Build CompAI prompt from project data
   */
  async buildCompAIPrompt(
    project: Project,
    analysisType: 'competitive' = 'competitive',
    freshnessStatus: ProjectFreshnessStatus
  ): Promise<string> {
    
    // 1. Get latest data
    const product = project.products[0];
    if (!product) throw new Error('No product found for project');
    
    const latestProductSnapshot = await this.getLatestProductSnapshot(product.id);
    const competitorSnapshots = await this.getLatestCompetitorSnapshots(project.competitors);
    
    // 2. Transform data to CompAI format
    const productInfo = this.formatProductInfo(product);
    const productWebsiteHTML = this.extractProductWebsiteHTML(latestProductSnapshot);
    const competitorHTMLFiles = this.extractCompetitorHTMLFiles(competitorSnapshots);
    const lastAnalysisDate = this.formatLastAnalysisDate(freshnessStatus);
    
    // 3. Build CompAI prompt template
    return this.buildPromptFromTemplate({
      productName: product.name,
      productInfo,
      productWebsiteHTML,
      competitorHTMLFiles,
      lastAnalysisDate
    });
  }
  
  private buildPromptFromTemplate(data: CompAIPromptData): string {
    return `### **CompAI Prompt**

**Role:**
You are an expert Senior Market Analyst and Competitive Intelligence Strategist. Your primary function is to analyze market data, identify key competitive differentiators, and provide actionable strategic recommendations. You are methodical, data-driven, and possess a deep understanding of product marketing, user experience, and business strategy. Your analysis must be objective, thorough, and based strictly on the provided data.

**Ask:**
Generate a comprehensive competitive analysis report comparing our product, **${data.productName}**, against its key competitors. Your analysis must synthesize the provided product information and scraped website data to identify critical differences, gaps, and opportunities. The ultimate goal is to produce actionable insights that will inform our product's strategic roadmap for the upcoming quarter.

**Context:**
You will be provided with the following data sources:

1. **Product Information:** 
${data.productInfo}

2. **Product Website Data:** 
${data.productWebsiteHTML}

3. **Competitor Website Data:** 
${data.competitorHTMLFiles}

4. **Last Analysis Date:** ${data.lastAnalysisDate}

Your analysis must be confined to the information present within these provided files. Do not use external knowledge or perform live web searches.

**Output Guidance & Template:**
Generate a detailed report in Markdown format. The report must be structured, well-organized, and closely follow the example and template below. Use tables, bolding, and headers to enhance readability.

[Include full CompAI template structure from docs/CompAIPrompt.md]
`;
  }
}
```

## Implementation Strategy

### Phase 1: Core Transformation Layer
1. **Create CompAIPromptBuilder service** - New prompt building service
2. **Implement data extraction utilities** - HTML content extractors  
3. **Add data formatting functions** - Product info and date formatters
4. **Create type definitions** - CompAI-specific interfaces

### Phase 2: Service Integration  
1. **Update SmartAIService** - Add CompAI prompt option
2. **Update ComparativeAnalyzer** - Integrate CompAI template
3. **Update ReportGenerator** - Add CompAI report format
4. **Maintain backward compatibility** - Keep existing prompt formats

### Phase 3: Testing & Validation
1. **Unit tests for transformation functions** - Data format validation
2. **Integration tests with sample data** - End-to-end prompt generation
3. **Content quality validation** - HTML extraction accuracy
4. **Performance testing** - Large content handling

## Compatibility Summary

### ✅ Fully Compatible Elements
- **Database Models**: Product, Competitor, Project models provide all required data
- **HTML Content**: Both ProductSnapshot and Snapshot store raw HTML content  
- **Freshness Tracking**: SmartScheduling provides analysis date tracking
- **Content Quality**: Existing validation and quality scoring systems

### ⚠️ Transformation Required
- **Data Format Standardization**: Different JSON structures between product/competitor snapshots
- **HTML Content Extraction**: Need unified extraction methods across snapshot types
- **Template Variable Mapping**: Replace simple variable substitution with structured data formatters
- **Output Format Alignment**: Structured markdown reports vs. current JSON responses

### 🔧 Implementation Requirements  
1. **CompAI Prompt Builder Service** - Central prompt generation service
2. **Data Transformation Utilities** - HTML extraction and formatting functions
3. **Service Integration Updates** - Update existing prompt-building services
4. **Backward Compatibility Layer** - Maintain existing analysis types and formats

## Risk Assessment

### Low Risk ✅
- **Data Availability**: All required data exists in current database
- **Content Quality**: Existing HTML content meets CompAI requirements  
- **Performance**: Content extraction methods already optimized

### Medium Risk ⚠️
- **Content Size Management**: Large HTML content may exceed prompt limits
- **Multi-language Support**: Website content may be in different languages
- **Template Complexity**: CompAI template more complex than current prompts

### Mitigation Strategies
- **Content Truncation**: Implement intelligent HTML content summarization
- **Size Limits**: Add content size validation and smart truncation
- **Error Handling**: Graceful degradation for malformed or missing content
- **Quality Validation**: Pre-validate content before prompt generation

## Next Steps
Task 2.0 assessment complete. Ready to proceed with:
- **Task 3.0**: CompAI Prompt Adaptation - Create actual implementation
- **Task 4.0**: Service Implementation Updates - Integrate with existing services
