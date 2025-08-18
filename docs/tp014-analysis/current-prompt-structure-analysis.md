# TP-014 Task 1.0: Current Prompt Structure Analysis

## Overview
This document provides a comprehensive analysis of the current prompt generation system across all services that integrate with AWS Bedrock for AI analysis.

## 1.1 Current Prompt Structure Documentation

### Primary Services Using Prompts

#### 1. SmartAIService (`src/services/smartAIService.ts`)
**Method:** `buildEnhancedPrompt()` (lines 326-376)

**Current Structure:**
```typescript
// Base prompt varies by analysis type
switch (analysisType) {
  case 'competitive': basePrompt = `Perform a comprehensive competitive analysis for ${project.name}.`;
  case 'trend': basePrompt = `Analyze market trends and patterns for ${project.name}.`;
  case 'comprehensive': basePrompt = `Provide a comprehensive business intelligence analysis for ${project.name}.`;
}

// Combined structure:
`${basePrompt}

**DATA FRESHNESS CONTEXT:**
${freshDataIndicators}

**PROJECT INFORMATION:**
- Name: ${project.name}
- Description: ${project.description || 'N/A'}
- Industry: ${project.industry || 'Not specified'}

**PRODUCT INFORMATION:**
${productData}

**COMPETITOR INFORMATION:**
${competitorData}

**ANALYSIS REQUIREMENTS:**
- Focus on actionable insights based on the fresh data available
- Highlight any data limitations due to freshness issues
- Provide both immediate and long-term recommendations
- Include competitive positioning analysis
- Identify market opportunities and threats

${additionalContext ? `**ADDITIONAL CONTEXT:**\n${JSON.stringify(additionalContext, null, 2)}` : ''}

Please provide a detailed analysis with clear sections for insights, recommendations, and strategic implications.`
```

**Data Sources:**
- Project model: name, description, industry
- Product data via `buildProductContext()`
- Competitor data via `buildCompetitorContext()`
- Freshness indicators via `buildDataFreshnessContext()`

#### 2. ComparativeAnalyzer (`src/services/domains/analysis/ComparativeAnalyzer.ts`)
**Method:** `buildAnalysisPrompt()` (lines 288-321)

**Current Structure:**
Uses template-based approach with variable replacement:
```typescript
// Template variables replaced:
- {{productName}} → input.product.name
- {{productWebsite}} → input.product.website
- {{productPositioning}} → input.product.positioning
- {{productIndustry}} → input.product.industry
- {{customerData}} → input.product.customerData
- {{userProblem}} → input.product.userProblem
- {{productContent}} → extracted snapshot content
- {{#competitors}}...{{/competitors}} → competitor section loop

// Competitor section format:
**${comp.competitorName}** (${comp.competitorWebsite})
Industry: ${comp.competitorIndustry}
${comp.competitorDescription}

Content: ${comp.competitorContent}
```

**Data Sources:**
- Product model: name, website, positioning, industry, customerData, userProblem
- ProductSnapshot: content field (JSON)
- Competitor model: name, website, industry, description
- Snapshot model: metadata field (for competitor content)

#### 3. ReportGenerator (`src/lib/reports.ts`)
**Method:** `buildComparativeAnalysisPrompt()` (lines 901-945)

**Current Structure:**
```typescript
`As a competitive analysis expert, analyze the following product against its competitors with a focus on ${focusArea}.

PRODUCT BEING ANALYZED:
Name: ${product.name}
Website: ${product.website}
Industry: ${product.industry}
Positioning: ${product.positioning}
Customer Problem: ${product.userProblem}

Recent Product Data:
${product.snapshots?.slice(0, 2).map((snapshot, index) => `
Snapshot ${index + 1} (${new Date(snapshot.createdAt).toLocaleDateString()}):
${JSON.stringify(snapshot.content, null, 2)}
`).join('\n')}

COMPETITORS:
${competitors.map(competitor => `
Name: ${competitor.name}
Website: ${competitor.website}
Industry: ${competitor.industry}
Recent Data: ${competitor.snapshots?.slice(0, 1).map(s => JSON.stringify(s.content, null, 2)).join('\n')}
`).join('\n\n')}

...`
```

**Data Sources:**
- Product model: name, website, industry, positioning, userProblem
- ProductSnapshot: content field, createdAt
- Competitor model: name, website, industry
- Competitor snapshots: content field

#### 4. Analysis Templates (`src/services/analysis/analysisPrompts.ts`)
**Templates Available:**
- `COMPARATIVE_ANALYSIS_SYSTEM_PROMPT`: System-level prompt for competitive analysis
- `FEATURE_COMPARISON_PROMPT`: Template for feature-based comparison
- `PRICING_ANALYSIS_PROMPT`: Template for pricing analysis
- `UX_ANALYSIS_PROMPT`: Template for user experience analysis
- `POSITIONING_ANALYSIS_PROMPT`: Template for market positioning analysis

**Template Structure:**
```typescript
{
  system: "System prompt defining role and framework",
  userTemplate: "User prompt with {{variable}} placeholders"
}
```

### Other Services with Prompt Generation

#### 5. AIAnalyzer (`src/services/domains/analysis/AIAnalyzer.ts`)
- **Method:** `buildEnhancedPrompt()` (lines 380-432)
- **Note:** CRITICAL comment indicates it preserves exact SmartAIService implementation
- Same structure as SmartAIService

#### 6. UXAnalyzer (`src/services/domains/analysis/UXAnalyzer.ts`)
- Uses template-based approach for UX-specific analysis
- Focuses on user experience evaluation

#### 7. ComparativeAnalysisService (`src/services/analysis/comparativeAnalysisService.ts`)
- Handles comparative analysis workflows
- Uses template system from analysisPrompts.ts

## 1.2 Data Flow Mapping

### Current Data Flow Architecture
```
Database Models → Service Prompt Builders → BedrockService → Claude AI → Analysis Results
```

### Detailed Data Flow

#### From Database to Prompt Variables
1. **Project Data**
   - `Project.name` → prompt project name
   - `Project.description` → project description context
   - `Project.industry` → industry context

2. **Product Data**
   - `Product.name` → `{{productName}}` / product name
   - `Product.website` → `{{productWebsite}}` / product URL
   - `Product.positioning` → `{{productPositioning}}` / positioning statement
   - `Product.customerData` → `{{customerData}}` / customer information
   - `Product.userProblem` → `{{userProblem}}` / problem statement
   - `Product.industry` → `{{productIndustry}}` / product industry

3. **Product Content Data**
   - `ProductSnapshot.content` (JSON) → `{{productContent}}` / `[PRODUCT_WEBSITE_HTML]`
   - `ProductSnapshot.createdAt` → freshness indicators
   - `ProductSnapshot.metadata` → additional context

4. **Competitor Data**
   - `Competitor.name` → `{{competitorName}}` / competitor name
   - `Competitor.website` → `{{competitorWebsite}}` / competitor URL
   - `Competitor.industry` → `{{competitorIndustry}}` / competitor industry
   - `Competitor.description` → competitor description

5. **Competitor Content Data**
   - `Snapshot.metadata` (JSON) → `{{competitorContent}}` / `[LIST_OF_COMPETITOR_HTML_FILES]`
   - `Snapshot.createdAt` → freshness indicators
   - `Snapshot.captureSuccess` → data quality indicators

### Content Extraction Patterns

#### HTML Content Extraction
Current services use different approaches:
- **SmartAIService**: Uses helper methods `buildProductContext()` and `buildCompetitorContext()`
- **ComparativeAnalyzer**: Uses `extractContent()` and `extractCompetitorContent()` methods
- **ReportGenerator**: Direct JSON serialization of snapshot content

#### Data Freshness Integration
- Uses `ProjectFreshnessStatus` from SmartScheduling system
- Tracks days since last snapshot for products and competitors
- Provides FRESH/STALE status indicators
- Includes last update timestamps

## 1.3 Services Generating Prompts for Bedrock Integration

### Primary Integration Services
1. **SmartAIService** - Main AI analysis service
2. **ComparativeAnalyzer** - Specialized comparative analysis
3. **ReportGenerator** - Report generation with AI analysis
4. **AIAnalyzer** - Analysis domain service
5. **ComparativeAnalysisService** - Comparative analysis workflows
6. **UXAnalyzer** - User experience analysis

### Bedrock Integration Pattern
All services use the same integration pattern:
```typescript
// via BedrockService.generateCompletion()
const command = new InvokeModelCommand({
  modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  contentType: 'application/json',
  accept: 'application/json',
  body: JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4000,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }]
  })
});
```

### Common Patterns
- Correlation ID tracking for request tracing
- Error handling with fallback analysis
- Performance monitoring and logging
- Thread-safe prompt generation
- Memory optimization for large content

## 1.4 CompAI Prompt Template Analysis

### CompAI Template Structure
Based on `docs/CompAIPrompt.md`:

```markdown
### **CompAI Prompt**

**Role:**
You are an expert Senior Market Analyst and Competitive Intelligence Strategist...

**Ask:**
Generate a comprehensive competitive analysis report comparing our product, **`[PRODUCT_NAME]`**, against its key competitors...

**Context:**
You will be provided with the following data sources:
1. **Product Information (`[PRODUCT_INFO]`):** structured data about our product...
2. **Product Website Data (`[PRODUCT_WEBSITE_HTML]`):** full scraped HTML content...
3. **Competitor Website Data (`[LIST_OF_COMPETITOR_HTML_FILES]`):** list of full scraped HTML content files...
4. **Last Analysis Date (`[LAST_ANALYSIS_DATE]`):** date of last analysis...

**Output Guidance & Template:**
Generate a detailed report in Markdown format with specific sections:
- I. Executive Summary
- II. Introduction  
- III. Competitor Profiles
- IV. Comparative Analysis
- V. SWOT Analysis
- VI. Changes Since Last Analysis
- VII. Strategic Recommendations
- VIII. Conclusion
```

### Key Differences from Current System

#### Variable Mapping Requirements
- `[PRODUCT_NAME]` → `project.products[0].name`
- `[PRODUCT_INFO]` → structured Product model data
- `[PRODUCT_WEBSITE_HTML]` → `ProductSnapshot.content`
- `[LIST_OF_COMPETITOR_HTML_FILES]` → array of `Snapshot.metadata`
- `[LAST_ANALYSIS_DATE]` → freshness data from SmartScheduling

#### Structural Changes Needed
1. **Role Definition**: More specific market analyst role vs. generic business strategist
2. **Output Format**: Structured markdown report vs. JSON/general analysis
3. **Content Requirements**: Full HTML content vs. summarized data
4. **Analysis Framework**: Specific competitive intelligence methodology
5. **Section Structure**: Predefined report sections vs. flexible analysis

#### Data Format Alignment
- Current: JSON serialization of snapshot content
- CompAI: Expects raw HTML content from website scraping
- Current: Multiple analysis types (competitive/trend/comprehensive)  
- CompAI: Specialized competitive analysis focus
- Current: General business intelligence
- CompAI: Market analyst competitive intelligence

## Compatibility Assessment

### ✅ Compatible Elements
- Project, Product, Competitor models align with CompAI data requirements
- ProductSnapshot and Snapshot content can provide HTML data
- Freshness tracking system supports last analysis date requirement
- BedrockService integration can handle new prompt format

### ⚠️ Areas Requiring Adaptation
- Content extraction needs to handle HTML vs. JSON serialization
- Variable mapping needs standardization across services
- Output format expectations differ (markdown vs. JSON)
- Multiple analysis types need CompAI template variants

### 🔧 Implementation Requirements
1. Create CompAI-specific prompt builder service
2. Implement HTML content extraction utilities
3. Add data transformation layer for CompAI format
4. Update existing services to use CompAI templates
5. Maintain backward compatibility for existing analysis types

## Next Steps for Task 1.0 Completion
- [x] Document current prompt structures ✓
- [x] Map data flow from database to prompts ✓  
- [x] Identify all prompt-generating services ✓
- [x] Analyze CompAI template requirements ✓

Ready to proceed to Task 2.0: Data Model Compatibility Assessment
