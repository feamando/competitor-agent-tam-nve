import { ChatState } from '@/types/chat';
import { ComprehensiveProjectRequirements, RequirementsValidationResult, ComprehensiveRequirementsCollector } from './comprehensiveRequirementsCollector';

export interface EnhancedChatProjectData {
  // Core Project Info (Required)
  userEmail: string;
  reportFrequency: string; // Updated from 'frequency' to match comprehensive requirements
  projectName: string;
  
  // Product Info (Optional for extraction, Required for validation)
  productName?: string | undefined;
  productUrl?: string | undefined; // Updated from 'productWebsite' to match comprehensive requirements
  productWebsite?: string | undefined; // Backward compatibility alias for productUrl
  
  // Business Context (Optional for extraction, Required for validation)
  industry?: string | undefined;
  positioning?: string | undefined;
  customerData?: string | undefined;
  userProblem?: string | undefined;
  
  // Optional Enhancement Fields
  competitorHints?: string[] | undefined;
  focusAreas?: string[] | undefined;
  reportTemplate?: string | undefined;
}

export interface ExtractionResult {
  success: boolean;
  data?: EnhancedChatProjectData;
  errors: string[];
  suggestions: string[];
  completeness: number; // Percentage 0-100
  confidence: { [key: string]: number }; // Field-level confidence scores
}

export class EnhancedProjectExtractor {
  private comprehensiveCollector: ComprehensiveRequirementsCollector;

  constructor() {
    this.comprehensiveCollector = new ComprehensiveRequirementsCollector();
  }

  /**
   * Enhanced project data extraction with intelligent parsing
   * Now integrates with comprehensive requirements collection
   */
  extractProjectData(message: string): ExtractionResult {
    try {
      // First try comprehensive parsing for better accuracy
      const comprehensiveResult = this.comprehensiveCollector.parseComprehensiveInput(message);
      
      if (comprehensiveResult.completeness >= 40) {
        return this.convertFromComprehensiveResult(comprehensiveResult);
      }
      
      // Fall back to legacy extraction for backward compatibility
      const lines = message.trim().split('\n').filter(line => line.trim());
      
      // Try structured extraction first (backward compatible)
      const structuredResult = this.tryStructuredExtraction(lines);
      if (structuredResult.success) {
        return structuredResult;
      }
      
      // Fall back to intelligent unstructured extraction
      const unstructuredResult = this.tryUnstructuredExtraction(message);
      return unstructuredResult;
      
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse project information: ${(error as Error).message}`],
        suggestions: [
          'Please provide your information in this format:',
          '1. Email address',
          '2. Report frequency (Weekly/Monthly)', 
          '3. Project name',
          '4. Product website URL',
          '5. Product name (optional)',
          '6. Industry (optional)'
        ],
        completeness: 0,
        confidence: {}
      };
    }
  }

  /**
   * Convert comprehensive requirements result to enhanced extraction result
   */
  private convertFromComprehensiveResult(comprehensiveResult: RequirementsValidationResult): ExtractionResult {
    const data = comprehensiveResult.extractedData;
    
    return {
      success: comprehensiveResult.completeness >= 30, // At least 3 of 9 required fields
      data: {
        userEmail: data.userEmail || '',
        reportFrequency: data.reportFrequency || '',
        projectName: data.projectName || '',
        productName: data.productName,
        productUrl: data.productUrl,
        productWebsite: data.productUrl, // Backward compatibility alias
        industry: data.industry,
        positioning: data.positioning,
        customerData: data.customerData,
        userProblem: data.userProblem,
        competitorHints: data.competitorHints,
        focusAreas: data.focusAreas,
        reportTemplate: data.reportTemplate
      },
      errors: comprehensiveResult.invalidFields.map(f => f.reason),
      suggestions: comprehensiveResult.suggestions,
      completeness: comprehensiveResult.completeness,
      confidence: comprehensiveResult.confidence
    };
  }

  /**
   * Backward-compatible structured extraction (line-by-line)
   */
  private tryStructuredExtraction(lines: string[]): ExtractionResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (lines.length < 3) {
      return {
        success: false,
        errors: ['Insufficient information provided'],
        suggestions: [
          'Please provide at least:',
          '• Email address', 
          '• Report frequency (Weekly/Monthly)',
          '• Project name',
          '• Product website URL (highly recommended)'
        ],
        completeness: 10,
        confidence: {}
      };
    }

    // Check if this looks like structured input (first 3 lines are simple values)
    const firstThreeLines = lines.slice(0, 3);
    const looksStructured = firstThreeLines.length >= 3 && 
      this.extractEmail(firstThreeLines[0]) !== null &&
      this.extractFrequency(firstThreeLines[1]) !== null &&
      firstThreeLines[2].trim().length > 0;

    if (!looksStructured) {
      return { success: false, errors: [], suggestions: [], completeness: 0, confidence: {} };
    }

    // Extract core required fields
    const userEmail = this.extractEmail(lines[0]);
    const frequency = this.extractFrequency(lines[1]);
    const projectName = lines[2].trim();

    if (!userEmail) {
      errors.push('Invalid email address format in first line');
      suggestions.push('Email should be in format: user@company.com');
    }

    if (!frequency) {
      errors.push('Invalid frequency in second line');
      suggestions.push('Frequency should be: Weekly, Monthly, or similar');
    }

    if (!projectName || projectName.length < 2) {
      errors.push('Project name too short or missing in third line');
      suggestions.push('Project name should be descriptive (e.g., "Good Chop Analysis")');
    }

    // Extract additional product information from remaining lines
    const productWebsite = this.extractWebsite(lines);
    const productName = this.extractProductName(lines, projectName);
    const industry = this.extractIndustry(lines);
    const positioning = this.extractPositioning(lines);
    const customerData = this.extractCustomerData(lines);
    const userProblem = this.extractUserProblem(lines);

    // Product website is highly recommended but not required for backward compatibility
    if (!productWebsite) {
      suggestions.push('Consider including your product website URL for better analysis');
    }

    // Return result even with minor issues for backward compatibility
    if (userEmail && frequency && projectName) {
      return {
        success: true,
        data: {
          userEmail,
          reportFrequency: frequency,
          projectName,
          productUrl: productWebsite || undefined,
          productWebsite: productWebsite || undefined, // Backward compatibility alias
          productName: productName || undefined,
          industry: industry || undefined,
          positioning: positioning || undefined,
          customerData: customerData || undefined,
          userProblem: userProblem || undefined
        },
        errors,
        suggestions,
        completeness: this.calculateCompleteness({
          userEmail,
          reportFrequency: frequency,
          projectName,
          productUrl: productWebsite,
          productName,
          industry,
          positioning,
          customerData,
          userProblem
        }),
        confidence: {
          userEmail: userEmail ? 95 : 0,
          reportFrequency: frequency ? 90 : 0,
          projectName: projectName ? 85 : 0,
          productUrl: productWebsite ? 80 : 0,
          productName: productName ? 75 : 0,
          industry: industry ? 70 : 0
        }
      };
    }

    return {
      success: false,
      errors,
      suggestions,
      completeness: 0,
      confidence: {}
    };
  }

  /**
   * Enhanced URL extraction with confidence scoring - Task 5.1
   */
  private extractUrlWithConfidence(message: string): { url: string | null; confidence: number } {
    // Enhanced URL patterns with different confidence levels
    const urlPatterns = [
      { pattern: /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/g, confidence: 95 },
      { pattern: /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/g, confidence: 85 },
      { pattern: /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/g, confidence: 70 }
    ];

    for (const { pattern, confidence } of urlPatterns) {
      const matches = Array.from(message.matchAll(pattern));
      if (matches.length > 0) {
        const url = matches[0][0];
        const validatedUrl = this.validateAndCleanUrl(url);
        if (validatedUrl) {
          return { url: validatedUrl, confidence };
        }
      }
    }

    return { url: null, confidence: 0 };
  }

  /**
   * Enhanced product name extraction with confidence scoring - Task 5.1
   */
  private extractProductNameWithConfidence(message: string): { name: string | null; confidence: number } {
    const productPatterns = [
      // High confidence patterns - explicit product mentions
      { pattern: /(?:product|company|brand|business)\s*(?:name|is)?\s*:?\s*["']?([^"',\n]{2,50})["']?/i, confidence: 95 },
      { pattern: /(?:analyzing|analyze|review)\s+(?:the\s+)?["']?([^"',\n]{2,50})["']?\s+(?:product|company|app|website|platform)/i, confidence: 90 },
      
      // Medium confidence patterns - context-based
      { pattern: /(?:working\s+(?:on|at)|developing)\s+["']?([^"',\n]{2,50})["']?/i, confidence: 80 },
      { pattern: /(?:our|my)\s+(?:product|company|startup|business)\s+["']?([^"',\n]{2,50})["']?/i, confidence: 85 },
      
      // Lower confidence patterns - general extraction
      { pattern: /^(?:product|company|brand)\s*:?\s*([^,\n]+)/i, confidence: 70 },
      { pattern: /(?:called|named)\s+["']?([^"',\n]{2,50})["']?/i, confidence: 75 }
    ];

    for (const { pattern, confidence } of productPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim().replace(/^["'](.*)["']$/, '$1');
        
        // Additional confidence adjustments based on content quality
        let adjustedConfidence = confidence;
        
        // Reduce confidence for very short names (likely not complete)
        if (name.length < 3) adjustedConfidence *= 0.5;
        
        // Reduce confidence for names with suspicious patterns
        if (name.includes('...') || name.includes('etc') || name.match(/^[a-z]+$/)) {
          adjustedConfidence *= 0.7;
        }
        
        // Increase confidence for names with proper capitalization
        if (name.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/)) {
          adjustedConfidence *= 1.1;
        }
        
        return { name, confidence: Math.min(adjustedConfidence, 100) };
      }
    }

    return { name: null, confidence: 0 };
  }

  /**
   * Enhanced URL validation with better normalization - Task 5.1
   */
  private validateAndCleanUrl(url: string): string | null {
    try {
      // Remove trailing punctuation that might not be part of URL
      const cleanUrl = url.replace(/[.,;!?)]+$/, '');
      
      // Handle cases where user provides URL without protocol
      let urlToValidate = cleanUrl;
      if (!urlToValidate.startsWith('http://') && !urlToValidate.startsWith('https://')) {
        urlToValidate = 'https://' + urlToValidate;
      }

      const parsedUrl = new URL(urlToValidate);
      
      // Enhanced validation checks
      if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
        return null;
      }

      // Ensure protocol is http or https
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return null;
      }

      // Domain validation - must contain at least one dot (except localhost)
      if (!parsedUrl.hostname.includes('.') && 
          !parsedUrl.hostname.startsWith('localhost') && 
          !parsedUrl.hostname.includes(':')) {
        return null;
      }

      // Reject invalid domain patterns
      const invalidPatterns = [
        /^\./, // starts with dot
        /\.\.$/, // ends with double dot
        /\s/, // contains spaces
        /[<>"]/, // contains invalid characters
        /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ // bare IP addresses (require context)
      ];

      if (invalidPatterns.some(pattern => pattern.test(parsedUrl.hostname))) {
        return null;
      }

      // Normalize URL format
      let normalizedUrl = parsedUrl.toString();
      
      // Remove default ports
      if ((parsedUrl.protocol === 'https:' && parsedUrl.port === '443') ||
          (parsedUrl.protocol === 'http:' && parsedUrl.port === '80')) {
        normalizedUrl = normalizedUrl.replace(`:${parsedUrl.port}`, '');
      }
      
      // Ensure trailing slash for consistency
      if (parsedUrl.pathname === '/') {
        normalizedUrl = normalizedUrl.replace(/\/$/, '');
      }

      return normalizedUrl;
    } catch (error) {
      // URL parsing failed
      return null;
    }
  }

  /**
   * Intelligent unstructured extraction using pattern matching
   */
  private tryUnstructuredExtraction(message: string): ExtractionResult {
    const errors: string[] = [];
    const suggestions: string[] = [];
    
    // Extract email using regex patterns
    const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    const userEmail = emailMatch ? emailMatch[0] : null;

    // Extract frequency using pattern matching
    const frequencyMatch = message.match(/\b(weekly|monthly|daily|quarterly|bi-weekly|annually)\b/i);
    const frequency = frequencyMatch ? frequencyMatch[1] : null;

    // Enhanced project name extraction with confidence
    const projectPatterns = [
      /should be called\s*["']([^"']+)["']/i,
      /(?:project|report|analysis)\s+should be called\s*["']([^"']+)["']/i,
      /(?:project|report|analysis)\s*:?\s*["']?([^"',\n]+?)["']?$/i,
      /(?:name|title)\s*:?\s*["']?([^"',\n]+?)["']?$/i,
      /(?:called?)\s+(?:the\s+)?(?:project|report|analysis)\s*:?\s*["']?([^"',\n]+?)["']?/i,
      /(?:project|analysis|report).*?["']([^"']{10,})["']/i
    ];
    
    let projectName = null;
    for (const pattern of projectPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        projectName = match[1].trim().replace(/['"]/g, '');
        break;
      }
    }

    // Enhanced URL extraction with confidence
    const urlResult = this.extractUrlWithConfidence(message);
    const productWebsite = urlResult.url;

    // Enhanced product name extraction with confidence
    const productResult = this.extractProductNameWithConfidence(message);
    const productName = productResult.name;

    // Extract industry with enhanced patterns
    const industryPatterns = [
      /(?:industry|market|sector)\s*:?\s*([^,\n]+)/i,
      /(?:in\s+the)\s+([^,\n\s]+(?:\s+[^,\n\s]+)*?)\s+(?:industry|market|space)/i,
      /(?:focused\s+on|specializing\s+in)\s+([^,\n]+)/i
    ];
    
    let industry = null;
    for (const pattern of industryPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        industry = match[1].trim().replace(/['"]/g, '');
        break;
      }
    }

    // Enhanced validation with confidence-based error messages
    if (!userEmail) {
      errors.push('Invalid email address format');
      suggestions.push('Please include your email address (e.g., user@company.com)');
    }

    if (!frequency) {
      errors.push('Invalid frequency specification');
      suggestions.push('Please specify report frequency (weekly, monthly, quarterly)');
    }

    if (!projectName) {
      errors.push('Project name missing or too short');
      suggestions.push('Please provide a clear project name (e.g., "Competitive Analysis for ProductX")');
    }

    // Task 5.1: Add confidence-based suggestions for improvements
    if (productResult.confidence > 0 && productResult.confidence < 80 && productName) {
      suggestions.push(`Product name "${productName}" detected with ${Math.round(productResult.confidence)}% confidence. Consider providing more context.`);
    }

    if (urlResult.confidence > 0 && urlResult.confidence < 80 && productWebsite) {
      suggestions.push(`URL "${productWebsite}" detected with ${Math.round(urlResult.confidence)}% confidence. Please verify the URL is correct.`);
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? {
        userEmail,
        reportFrequency: frequency,
        projectName,
        productName: productName || undefined,
        productUrl: productWebsite || undefined,
        industry: industry || undefined,
        positioning: undefined,
        customerData: undefined,
        userProblem: undefined
      } : null,
      errors,
      suggestions,
      completeness: 0,
      confidence: {
        productName: productResult.confidence,
        productUrl: urlResult.confidence,
        overall: errors.length === 0 ? 85 : 0
      }
    };
  }

  private extractEmail(line: string): string | null {
    const emailMatch = line.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    return emailMatch ? emailMatch[0] : null;
  }

  private extractFrequency(line: string): string | null {
    const frequencyPattern = /\b(weekly|monthly|daily|quarterly|biweekly|annually)\b/i;
    const match = line.match(frequencyPattern);
    return match ? match[1] : null;
  }

  private extractWebsite(lines: string[]): string | null {
    for (const line of lines) {
      const urlMatch = line.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        return this.validateAndCleanUrl(urlMatch[0]);
      }
    }
    return null;
  }

  private extractProductName(lines: string[], projectName: string): string | null {
    // Look for explicit product declarations (must start with the keyword)
    for (const line of lines) {
      const productMatch = line.match(/^(?:product|company|brand)\s*:?\s*([^,\n]+)/i);
      if (productMatch) {
        const extracted = productMatch[1].trim().replace(/['"]/g, '');
        // Avoid extracting email domains or URLs
        if (!extracted.includes('@') && !extracted.startsWith('http') && extracted.length > 2) {
          return extracted;
        }
      }
    }
    
    // Extract from project name if it contains recognizable product patterns
    const projectProductPatterns = [
      // Match "ProductName Competitive/Analysis/Research" patterns - capture more words
      /^(.+?)\s+(?:analysis|research|study)$/i,
      // Match "ProductName Competitive" patterns specifically
      /^(.+?)\s+competitive$/i,
      // Match "ProductName vs Competitors" patterns
      /^(.+?)\s+(?:vs|against|compared?\s+to)/i,
      // Fallback: first word or two if descriptive enough
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
    ];
    
    for (const pattern of projectProductPatterns) {
      const match = projectName.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        // Avoid extracting email domains or URLs
        if (!extracted.includes('@') && !extracted.startsWith('http') && extracted.length > 2) {
          return extracted;
        }
      }
    }
    
    return null;
  }

  private extractIndustry(lines: string[]): string | null {
    // Look for explicit industry declarations first (line-based, more precise)
    for (const line of lines) {
      const industryMatch = line.match(/^(?:industry)\s*:?\s*([^\n,]+)/i);
      if (industryMatch) {
        const extracted = industryMatch[1].trim().replace(/['"]/g, '');
        // Avoid extracting other text as industry
        if (!extracted.includes('@') && !extracted.startsWith('http') && extracted.length > 1) {
          return extracted;
        }
      }
    }
    
    // Try unstructured text as fallback (natural language patterns)
    const fullText = lines.join(' ');
    
    // Pattern for "in the X industry" or "X industry"
    const industryPatterns = [
      /\b(?:in\s+the\s+)?([a-z]+tech|fintech|healthcare|education|retail|finance|automotive|aerospace|gaming|entertainment|media|consulting|manufacturing|energy|telecommunications?|biotech|agtech|proptech|edtech|regtech|insurtech|legaltech|martech|adtech|foodtech|cleantech)\s+(?:industry|sector|space|market)?/i,
      /\b(?:we're|work\s+in|operate\s+in|focus\s+on)\s+(?:the\s+)?([a-z]+)\s+(?:industry|sector|space|market)/i
    ];
    
    for (const pattern of industryPatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        return match[1].trim().toLowerCase().replace(/['"]/g, '');
      }
    }
    
    return null;
  }

  private extractPositioning(lines: string[]): string | null {
    for (const line of lines) {
      const positioningMatch = line.match(/(?:positioning|position|value\s+prop)\s*:?\s*([^\n]+)/i);
      if (positioningMatch) {
        return positioningMatch[1].trim().replace(/['"]/g, '');
      }
    }
    return null;
  }

  private extractCustomerData(lines: string[]): string | null {
    for (const line of lines) {
      // Only look for explicit customer data declarations
      const customerMatch = line.match(/(?:customer|client|user)\s*(?:data|info|segment)\s*:?\s*([^,\n]+)/i);
      if (customerMatch) {
        const extracted = customerMatch[1].trim().replace(/['"]/g, '');
        // Avoid extracting email domains as customer data
        if (!extracted.includes('@') && !extracted.startsWith('http') && extracted.length > 3) {
          return extracted;
        }
      }
    }
    return null;
  }

  private extractUserProblem(lines: string[]): string | null {
    for (const line of lines) {
      const problemMatch = line.match(/(?:problem|challenge|pain\s+point|issue)\s*:?\s*([^\n]+)/i);
      if (problemMatch) {
        return problemMatch[1].trim().replace(/['"]/g, '');
      }
    }
    return null;
  }

  /**
   * Calculate completeness percentage based on available fields
   */
  private calculateCompleteness(data: Partial<EnhancedChatProjectData>): number {
    const requiredFields = [
      'userEmail', 'reportFrequency', 'projectName', 
      'productName', 'productUrl', 'industry', 
      'positioning', 'customerData', 'userProblem'
    ];
    
    const presentFields = requiredFields.filter(field => {
      const value = (data as any)[field];
      return value && value.trim && value.trim().length > 0;
    });
    
    return Math.round((presentFields.length / requiredFields.length) * 100);
  }

  /**
   * Create actionable error message for missing information
   */
  createActionableErrorMessage(extractionResult: ExtractionResult): string {
    if (extractionResult.success) {
      return '';
    }

    let message = '⚠️ **Missing Required Information**\n\n';
    
    if (extractionResult.errors.length > 0) {
      message += '**Issues Found:**\n';
      extractionResult.errors.forEach((error, index) => {
        message += `${index + 1}. ${error}\n`;
      });
      message += '\n';
    }

    if (extractionResult.suggestions.length > 0) {
      message += '**Please provide:**\n';
      extractionResult.suggestions.forEach(suggestion => {
        if (suggestion.startsWith('•') || suggestion.startsWith('-')) {
          message += `${suggestion}\n`;
        } else if (suggestion.trim() === '') {
          message += '\n';
        } else {
          message += `• ${suggestion}\n`;
        }
      });
    }

    message += '\n**💡 Tip:** You can provide information in any order or format. I\'ll extract what I need!';

    return message;
  }

  /**
   * Create confirmation message showing extracted data
   */
  createConfirmationMessage(data: EnhancedChatProjectData, suggestions: string[] = []): string {
    let message = '✅ **Project Information Extracted Successfully!**\n\n';
    
    message += `📧 **Email:** ${data.userEmail}\n`;
    message += `📊 **Frequency:** ${data.reportFrequency}\n`;
    message += `📋 **Project:** ${data.projectName}\n`;
    
    if (data.productWebsite) {
      message += `🌐 **Website:** ${data.productWebsite}\n`;
    }
    
    if (data.productName) {
      message += `🏷️ **Product:** ${data.productName}\n`;
    }
    
    if (data.industry) {
      message += `🏭 **Industry:** ${data.industry}\n`;
    }

    if (data.positioning) {
      message += `🎯 **Positioning:** ${data.positioning.substring(0, 100)}${data.positioning.length > 100 ? '...' : ''}\n`;
    }

    if (suggestions.length > 0) {
      message += '\n**💡 Recommendations:**\n';
      suggestions.forEach(suggestion => {
        message += `• ${suggestion}\n`;
      });
    }

    return message;
  }
}

export const enhancedProjectExtractor = new EnhancedProjectExtractor(); 