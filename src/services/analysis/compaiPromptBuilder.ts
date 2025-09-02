import { Project, Product, Competitor, ProductSnapshot, Snapshot } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ProjectFreshnessStatus } from '@/types/smartScheduling';

// Type definitions for CompAI prompt data
export interface CompAIPromptData {
  productName: string;
  productInfo: string;
  productWebsiteHTML: string;
  competitorHTMLFiles: string;
  lastAnalysisDate: string;
}

export interface CompAIPromptOptions {
  maxHTMLLength?: number;
  maxCompetitors?: number;
  includeMetadata?: boolean;
}

// Extended types for database relations
interface ProjectWithRelations extends Project {
  products: Product[];
  competitors: Competitor[];
}

interface CompetitorWithSnapshot {
  competitor: Competitor;
  snapshot: Snapshot;
}

/**
 * CompAI Prompt Builder Service
 * 
 * Transforms current application data model into CompAI prompt format.
 * Handles HTML content extraction, data formatting, and template generation.
 */
export class CompAIPromptBuilder {
  private readonly DEFAULT_MAX_HTML_LENGTH = 50000; // 50KB limit per HTML content
  private readonly DEFAULT_MAX_COMPETITORS = 5;     // Limit competitors to prevent prompt bloat

  /**
   * Build CompAI prompt from project data
   */
  async buildCompAIPrompt(
    project: ProjectWithRelations,
    analysisType: 'competitive' = 'competitive',
    freshnessStatus: ProjectFreshnessStatus,
    options: CompAIPromptOptions = {}
  ): Promise<string> {
    const startTime = Date.now();
    const correlationId = `compai-${project.id}-${Date.now()}`;

    try {
      logger.info('Building CompAI prompt', {
        projectId: project.id,
        projectName: project.name,
        correlationId,
        analysisType,
        productCount: project.products.length,
        competitorCount: project.competitors.length
      });

      // 1. Validate project data
      const product = project.products[0];
      if (!product) {
        throw new Error(`No product found for project ${project.id}`);
      }

      if (project.competitors.length === 0) {
        throw new Error(`No competitors found for project ${project.id}`);
      }

      // 2. Get latest snapshots
      const latestProductSnapshot = await this.getLatestProductSnapshot(product.id);
      const competitorSnapshots = await this.getLatestCompetitorSnapshots(
        project.competitors,
        options.maxCompetitors || this.DEFAULT_MAX_COMPETITORS
      );

      // 3. Transform data to CompAI format
      const productInfo = this.formatProductInfo(product);
      const productWebsiteHTML = this.extractProductWebsiteHTML(
        latestProductSnapshot,
        options.maxHTMLLength || this.DEFAULT_MAX_HTML_LENGTH
      );
      const competitorHTMLFiles = this.extractCompetitorHTMLFiles(
        competitorSnapshots,
        options.maxHTMLLength || this.DEFAULT_MAX_HTML_LENGTH
      );
      const lastAnalysisDate = this.formatLastAnalysisDate(freshnessStatus);

      // 4. Build CompAI prompt template
      const promptData: CompAIPromptData = {
        productName: product.name,
        productInfo,
        productWebsiteHTML,
        competitorHTMLFiles,
        lastAnalysisDate
      };

      const prompt = this.buildPromptFromTemplate(promptData);

      logger.info('CompAI prompt built successfully', {
        correlationId,
        projectId: project.id,
        buildTime: Date.now() - startTime,
        promptLength: prompt.length,
        productSnapshotAge: latestProductSnapshot ? 
          Math.floor((Date.now() - latestProductSnapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
        competitorsIncluded: competitorSnapshots.length
      });

      return prompt;

    } catch (error) {
      logger.error('Failed to build CompAI prompt', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
        projectId: project.id,
        buildTime: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Get latest product snapshot
   */
  private async getLatestProductSnapshot(productId: string): Promise<ProductSnapshot | null> {
    const snapshot = await prisma.productSnapshot.findFirst({
      where: {
        productId,
        captureSuccess: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!snapshot) {
      logger.warn('No successful product snapshot found', { productId });
    }

    return snapshot;
  }

  /**
   * Get latest competitor snapshots
   */
  private async getLatestCompetitorSnapshots(
    competitors: Competitor[],
    maxCompetitors: number
  ): Promise<CompetitorWithSnapshot[]> {
    const competitorSnapshots: CompetitorWithSnapshot[] = [];

    // Limit competitors to prevent prompt bloat
    const limitedCompetitors = competitors.slice(0, maxCompetitors);

    for (const competitor of limitedCompetitors) {
      const snapshot = await prisma.snapshot.findFirst({
        where: {
          competitorId: competitor.id,
          captureSuccess: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (snapshot) {
        competitorSnapshots.push({ competitor, snapshot });
      } else {
        logger.warn('No successful snapshot found for competitor', {
          competitorId: competitor.id,
          competitorName: competitor.name
        });
      }
    }

    return competitorSnapshots;
  }

  /**
   * Format product information for CompAI template
   */
  private formatProductInfo(product: Product): string {
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

  /**
   * Extract product website HTML content
   */
  private extractProductWebsiteHTML(
    productSnapshot: ProductSnapshot | null,
    maxLength: number
  ): string {
    if (!productSnapshot?.content) {
      return 'Product website HTML content not available - no recent snapshot found.';
    }

    const content = productSnapshot.content as any;
    const html = content.html || '';

    if (!html) {
      return 'Product website HTML content not available - no HTML content in snapshot.';
    }

    // Apply intelligent truncation if content is too large
    if (html.length > maxLength) {
      logger.info('Truncating product HTML content', {
        originalLength: html.length,
        maxLength,
        productId: productSnapshot.productId
      });

      return this.intelligentHTMLTruncation(html, maxLength, 'product website');
    }

    return html;
  }

  /**
   * Extract competitor HTML files content
   */
  private extractCompetitorHTMLFiles(
    competitorSnapshots: CompetitorWithSnapshot[],
    maxLength: number
  ): string {
    if (competitorSnapshots.length === 0) {
      return 'No competitor website data available - no recent snapshots found.';
    }

    const competitorHTMLFiles = competitorSnapshots.map((comp, index) => {
      const metadata = comp.snapshot.metadata as any;
      const html = metadata?.html || metadata?.content?.html || '';
      
      if (!html) {
        return `**${comp.competitor.name}_Website.html:**\nHTML content not available for this competitor.`;
      }

      // Apply intelligent truncation per competitor
      const truncatedHTML = html.length > maxLength 
        ? this.intelligentHTMLTruncation(html, maxLength, comp.competitor.name)
        : html;

      const competitorName = comp.competitor.name.replace(/[^a-zA-Z0-9]/g, '_');
      return `**${competitorName}_Website.html:**\n${truncatedHTML}`;
    });

    return competitorHTMLFiles.join('\n\n');
  }

  /**
   * Intelligent HTML truncation preserving important content
   */
  private intelligentHTMLTruncation(html: string, maxLength: number, source: string): string {
    if (html.length <= maxLength) return html;

    // Try to preserve important sections
    const importantSections = [
      /<head>.*?<\/head>/s,
      /<nav>.*?<\/nav>/s,
      /<header>.*?<\/header>/s,
      /<main>.*?<\/main>/s,
      /<footer>.*?<\/footer>/s
    ];

    let preservedContent = '';
    let remainingLength = maxLength;

    // First, try to preserve complete important sections
    for (const sectionRegex of importantSections) {
      const match = html.match(sectionRegex);
      if (match && match[0].length < remainingLength * 0.3) {
        preservedContent += match[0] + '\n';
        remainingLength -= match[0].length;
      }
    }

    // Fill remaining space with truncated content
    if (remainingLength > 100) {
      const remainingHTML = html.substring(0, remainingLength - preservedContent.length);
      preservedContent = remainingHTML + preservedContent;
    }

    const truncatedContent = preservedContent.substring(0, maxLength - 100) + 
      `\n\n<!-- Content truncated for ${source} - original length: ${html.length} characters -->`;

    logger.info('Applied intelligent HTML truncation', {
      source,
      originalLength: html.length,
      truncatedLength: truncatedContent.length,
      preservedSections: importantSections.length
    });

    return truncatedContent;
  }

  /**
   * Format last analysis date from freshness status
   */
  private formatLastAnalysisDate(freshnessStatus: ProjectFreshnessStatus): string {
    try {
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
    } catch (error) {
      logger.warn('Failed to format last analysis date', { error });
      return 'Analysis date unavailable';
    }
  }

  /**
   * Build complete CompAI prompt from template
   */
  private buildPromptFromTemplate(data: CompAIPromptData): string {
    return `### **CompAI Prompt**

**Role:**
You are an expert Senior Market Analyst and Competitive Intelligence Strategist. Your primary function is to analyze market data, identify key competitive differentiators, and provide actionable strategic recommendations. You are methodical, data-driven, and possess a deep understanding of product marketing, user experience, and business strategy. Your analysis must be objective, thorough, and based strictly on the provided data.

**Ask:**
Generate a comprehensive competitive analysis report comparing our product, **${data.productName}**, against its key competitors. Your analysis must synthesize the provided product information and scraped website data to identify critical differences, gaps, and opportunities. The ultimate goal is to produce actionable insights that will inform our product's strategic roadmap for the upcoming quarter.

**Context:**
You will be provided with the following data sources:

1. **Product Information (\`[PRODUCT_INFO]\`):** 
${data.productInfo}

2. **Product Website Data (\`[PRODUCT_WEBSITE_HTML]\`):** 
${data.productWebsiteHTML}

3. **Competitor Website Data (\`[LIST_OF_COMPETITOR_HTML_FILES]\`):** 
${data.competitorHTMLFiles}

4. **Last Analysis Date (\`[LAST_ANALYSIS_DATE]\`):** ${data.lastAnalysisDate}

Your analysis must be confined to the information present within these provided files. Do not use external knowledge or perform live web searches.

**Output Guidance & Template:**
Generate a detailed report in Markdown format. The report must be structured, well-organized, and closely follow the example and template below. Use tables, bolding, and headers to enhance readability.

---

# Competitive Landscape Analysis: ${data.productName} vs. Key Competitors

## I. Executive Summary
*(Provide a concise, high-level overview of the most critical findings. Summarize the key competitive advantages and disadvantages for **${data.productName}**. Briefly mention the most significant strategic opportunities identified in your analysis.)*

## II. Introduction
*(State the purpose of the report: to analyze **${data.productName}** against its rivals to inform the next product roadmap. Briefly describe the market/industry based on the provided context.)*

## III. Competitor Profiles
*(Create a detailed profile for **${data.productName}** and each competitor. Extract and synthesize information from the provided HTML to fill out these sections.)*

### A. ${data.productName}
   - **Product Offerings:** *(Describe the core products/services, variety, and any unique items.)*
   - **Business/Subscription Model:** *(Detail the plans, pricing tiers, and flexibility.)*
   - **Key Claims & Positioning:** *(What are the main messages about quality, sourcing, or value?)*

### B. [COMPETITOR_1_NAME]
   - **Product Offerings:** *(Describe their core products/services, variety, and any unique items.)*
   - **Business/Subscription Model:** *(Detail their plans, pricing tiers, and flexibility.)*
   - **Key Claims & Positioning:** *(What are their main messages about quality, sourcing, or value?)*

### C. [COMPETITOR_2_NAME]
   - *(Repeat the structure above for each competitor.)*

## IV. Comparative Analysis
*(This is the core analytical section. Address each of the following points in detail, using comparative language and creating Markdown tables for direct, side-by-side comparisons where appropriate.)*

### A. Website Customer Experience (CX)
*(Analyze and compare the user journey on each website. Consider navigation clarity, ease of finding information, calls-to-action (CTAs), overall aesthetic, and mobile responsiveness. What are the key differences?)*

### B. Key Claims & Communication
*(Compare the primary marketing messages, value propositions, and unique selling points (USPs) communicated on each site. Use a table to compare claims related to quality, trust signals (e.g., certifications, testimonials), and brand narrative.)*

### C. Offers & Promotions
*(Detail and compare the customer offers, such as new subscriber discounts, free trials, long-term value promises ("free for life"), or referral programs. What are the different acquisition tactics?)*

### D. Pricing & Value Proposition
*(Create a detailed pricing comparison table. Include base prices, shipping costs, cost per unit/serving (if available), and any other fees. Analyze the overall perceived value each brand is trying to convey.)*

### E. Feature Differences & Gaps
*(Identify specific feature differences between **${data.productName}** and its competitors. This could relate to account management, product customization, delivery options, or unique site functionalities. Where does **${data.productName}** have gaps, and where does it excel?)*

### F. Addressing Customer Pain Points
*(Based on the **Product Information** provided, analyze how effectively each website's messaging and offerings address the defined customer problems and needs. Does one competitor solve a specific pain point more directly or convincingly than others?)*

## V. SWOT Analysis for ${data.productName}
*(Based on your comparative analysis, generate a SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis for **${data.productName}**.)*
   - **Strengths:** *(Internal factors that give it an advantage.)*
   - **Weaknesses:** *(Internal factors that are disadvantages.)*
   - **Opportunities:** *(External factors it can leverage for growth.)*
   - **Threats:** *(External factors that could harm the business, such as competitor actions.)*

## VI. Changes Since Last Analysis (${data.lastAnalysisDate})
*(Scrutinize the current website data against your understanding of its state as of the last analysis date. Detail any significant changes observed on the product or competitor websites. This could include new features, pricing changes, new promotional offers, or shifts in marketing messages.)*

## VII. Strategic Recommendations for Future Roadmap
*(This is the most critical section. Synthesize all your findings into a set of clear, actionable recommendations for **${data.productName}**. Frame these as potential roadmap items. For each recommendation, provide a brief justification based on your analysis.)*
   - **Recommendation 1:** *(e.g., "Eliminate Shipping Fees by Integrating Cost into Product Price.")*
      - **Justification:** *(e.g., "Both major competitors offer free shipping. Our $9.99 fee creates a pricing disadvantage and friction at checkout, impacting conversion rates.")*
   - **Recommendation 2:** *(e.g., "Pursue Third-Party 'X' Certification.")*
      - **Justification:** *(e.g., "Competitor Y prominently features its certification, building significant trust. Lacking this, our claims appear less credible to values-driven consumers.")*
   - *(Provide 3-5 key recommendations.)*

## VIII. Conclusion
*(Provide a final summary of the competitive landscape and reiterate the importance of the key strategic recommendations for **${data.productName}**'s continued growth and success.)*

#### Works Cited
*(List the website URLs of the product and all competitors analyzed as sources.)*`;
  }
}

// Export singleton instance
export const compaiPromptBuilder = new CompAIPromptBuilder();
