/**
 * Task 6.1: Standardized Error Message Templates
 * 
 * This module provides consistent, user-friendly error messages across all business logic
 * with context-aware content, actionable guidance, and correlation IDs for debugging.
 */

import { generateCorrelationId } from './correlation';

// Base error template interface
export interface ErrorTemplate {
  code: string;
  title: string;
  message: string;
  actionableGuidance?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

// Error context for dynamic message generation
export interface ErrorContext {
  operation?: string;
  component?: string;
  userId?: string;
  projectId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

// Standardized error response
export interface StandardizedError {
  correlationId: string;
  timestamp: string;
  code: string;
  title: string;
  message: string;
  actionableGuidance?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  context: ErrorContext;
  supportInfo?: string;
}

/**
 * Task 6.1: Comprehensive Error Message Templates
 */
export class ErrorMessageTemplates {
  
  // Business Logic Error Templates
  static readonly BUSINESS_LOGIC = {
    PROJECT_CREATION_FAILED: {
      code: 'BL001',
      title: 'Project Creation Failed',
      message: 'Unable to create your project due to {reason}',
      actionableGuidance: 'Please verify your project details and try again. If the issue persists, contact support with correlation ID: {correlationId}',
      severity: 'high' as const,
      category: 'business_logic'
    },
    
    CONVERSATION_STATE_ERROR: {
      code: 'BL002', 
      title: 'Conversation State Error',
      message: 'There was an issue managing your conversation state: {reason}',
      actionableGuidance: 'Your progress has been preserved. You can continue from where you left off or restart if needed.',
      severity: 'medium' as const,
      category: 'business_logic'
    },
    
    DATA_VALIDATION_FAILED: {
      code: 'BL003',
      title: 'Data Validation Error', 
      message: 'The provided data failed validation: {reason}',
      actionableGuidance: 'Please review and correct the highlighted fields: {fields}',
      severity: 'medium' as const,
      category: 'business_logic'
    },
    
    PARSING_FAILED: {
      code: 'BL004',
      title: 'Input Parsing Error',
      message: 'Unable to understand your input format: {reason}',
      actionableGuidance: 'Try using simpler formatting or numbered lists. Type "help" for guided assistance.',
      severity: 'low' as const,
      category: 'business_logic'
    }
  };

  // Analysis Service Error Templates  
  static readonly ANALYSIS = {
    AI_SERVICE_UNAVAILABLE: {
      code: 'AS001',
      title: 'AI Analysis Service Unavailable',
      message: 'The AI analysis service is temporarily unavailable: {reason}',
      actionableGuidance: 'We\'ll automatically retry your analysis. You can also try again in 5 minutes.',
      severity: 'medium' as const,
      category: 'analysis'
    },
    
    INSUFFICIENT_DATA: {
      code: 'AS002',
      title: 'Insufficient Analysis Data',
      message: 'Not enough data available for comprehensive analysis: {reason}',
      actionableGuidance: 'Please ensure your project has competitor data and product information before running analysis.',
      severity: 'medium' as const,
      category: 'analysis'
    },
    
    ANALYSIS_TIMEOUT: {
      code: 'AS003',
      title: 'Analysis Timeout',
      message: 'Analysis took longer than expected and was stopped: {reason}',
      actionableGuidance: 'The analysis will be retried automatically with optimized parameters.',
      severity: 'low' as const,
      category: 'analysis'
    }
  };

  // AWS Service Error Templates
  static readonly AWS = {
    CREDENTIALS_EXPIRED: {
      code: 'AWS001',
      title: 'AWS Credentials Expired',
      message: 'Your AWS credentials have expired and need to be refreshed',
      actionableGuidance: 'Your project will be created without AI-generated reports. Please contact your administrator to refresh AWS credentials.',
      severity: 'medium' as const,
      category: 'aws'
    },
    
    RATE_LIMIT_EXCEEDED: {
      code: 'AWS002',
      title: 'AWS Rate Limit Exceeded',
      message: 'AWS service rate limit has been exceeded: {reason}',
      actionableGuidance: 'Please wait a few minutes before trying again. High usage detected.',
      severity: 'low' as const,
      category: 'aws'
    },
    
    SERVICE_UNAVAILABLE: {
      code: 'AWS003',
      title: 'AWS Service Unavailable',
      message: 'AWS services are temporarily unavailable: {reason}',
      actionableGuidance: 'Your project will be created without AI features. AWS services will be automatically retried.',
      severity: 'medium' as const,
      category: 'aws'
    }
  };

  // Database Error Templates
  static readonly DATABASE = {
    CONNECTION_FAILED: {
      code: 'DB001',
      title: 'Database Connection Failed',
      message: 'Unable to connect to the database: {reason}',
      actionableGuidance: 'This is a temporary issue. Your request will be retried automatically.',
      severity: 'high' as const,
      category: 'database'
    },
    
    TRANSACTION_FAILED: {
      code: 'DB002',
      title: 'Database Transaction Failed',
      message: 'Database transaction could not be completed: {reason}',
      actionableGuidance: 'No changes were made to your data. Please try the operation again.',
      severity: 'high' as const,
      category: 'database'
    },
    
    DATA_INTEGRITY_ERROR: {
      code: 'DB003',
      title: 'Data Integrity Error',
      message: 'Data integrity validation failed: {reason}',
      actionableGuidance: 'Please verify your data and try again. Contact support if this persists.',
      severity: 'high' as const,
      category: 'database'
    }
  };

  // Report Generation Error Templates
  static readonly REPORTS = {
    GENERATION_FAILED: {
      code: 'RP001',
      title: 'Report Generation Failed',
      message: 'Unable to generate your report: {reason}',
      actionableGuidance: 'We\'ll try generating an emergency report with available data. Check your email for updates.',
      severity: 'medium' as const,
      category: 'reports'
    },
    
    ZOMBIE_REPORT_DETECTED: {
      code: 'RP002',
      title: 'Report Inconsistency Detected',
      message: 'A report was created but may not be accessible: {reason}',
      actionableGuidance: 'Our system will automatically fix this. You\'ll receive a corrected report shortly.',
      severity: 'low' as const,
      category: 'reports'
    },
    
    CONTENT_VALIDATION_FAILED: {
      code: 'RP003',
      title: 'Report Content Validation Failed',
      message: 'Generated report content did not meet quality standards: {reason}',
      actionableGuidance: 'We\'ll regenerate the report with enhanced content. This may take a few extra minutes.',
      severity: 'medium' as const,
      category: 'reports'
    }
  };

  // System Error Templates
  static readonly SYSTEM = {
    UNEXPECTED_ERROR: {
      code: 'SYS001',
      title: 'Unexpected System Error',
      message: 'An unexpected error occurred: {reason}',
      actionableGuidance: 'Please try again. If the issue persists, contact support with correlation ID: {correlationId}',
      severity: 'high' as const,
      category: 'system'
    },
    
    SERVICE_INITIALIZATION_FAILED: {
      code: 'SYS002',
      title: 'Service Initialization Failed',
      message: 'A required service failed to initialize: {reason}',
      actionableGuidance: 'The system will attempt to use fallback services. Some features may be limited.',
      severity: 'medium' as const,
      category: 'system'
    },
    
    CONFIGURATION_ERROR: {
      code: 'SYS003',
      title: 'Configuration Error',
      message: 'System configuration issue detected: {reason}',
      actionableGuidance: 'This is an infrastructure issue. Please contact support immediately.',
      severity: 'critical' as const,
      category: 'system'
    }
  };

  /**
   * Generate a standardized error response with correlation ID and context
   */
  static generateStandardizedError(
    template: ErrorTemplate,
    context: ErrorContext,
    replacements: Record<string, string> = {}
  ): StandardizedError {
    const correlationId = context.correlationId || generateCorrelationId();
    
    // Replace placeholders in message and guidance
    let message = template.message;
    let actionableGuidance = template.actionableGuidance || '';
    
    // Add correlation ID to replacements
    replacements.correlationId = correlationId;
    
    // Replace all placeholders
    Object.entries(replacements).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      message = message.replace(placeholder, value);
      actionableGuidance = actionableGuidance.replace(placeholder, value);
    });

    // Generate support information
    const supportInfo = `For technical support, reference: ${template.code} | Correlation ID: ${correlationId}`;

    return {
      correlationId,
      timestamp: new Date().toISOString(),
      code: template.code,
      title: template.title,
      message,
      actionableGuidance: actionableGuidance || undefined,
      severity: template.severity,
      category: template.category,
      context,
      supportInfo
    };
  }

  /**
   * Generate user-friendly error message for display
   */
  static generateUserFriendlyMessage(error: StandardizedError): string {
    let userMessage = `❌ **${error.title}**\n\n`;
    userMessage += `${error.message}\n\n`;
    
    if (error.actionableGuidance) {
      userMessage += `💡 **How to proceed:**\n${error.actionableGuidance}\n\n`;
    }
    
    if (error.severity === 'critical' || error.severity === 'high') {
      userMessage += `🆘 **Need help?** ${error.supportInfo}`;
    }
    
    return userMessage;
  }

  /**
   * Get error template by code
   */
  static getTemplateByCode(code: string): ErrorTemplate | null {
    const allTemplates = [
      ...Object.values(this.BUSINESS_LOGIC),
      ...Object.values(this.ANALYSIS),
      ...Object.values(this.AWS),
      ...Object.values(this.DATABASE),
      ...Object.values(this.REPORTS),
      ...Object.values(this.SYSTEM)
    ];
    
    return allTemplates.find(template => template.code === code) || null;
  }

  /**
   * Generate error list for debugging/monitoring
   */
  static getAllErrorCodes(): string[] {
    const allTemplates = [
      ...Object.values(this.BUSINESS_LOGIC),
      ...Object.values(this.ANALYSIS), 
      ...Object.values(this.AWS),
      ...Object.values(this.DATABASE),
      ...Object.values(this.REPORTS),
      ...Object.values(this.SYSTEM)
    ];
    
    return allTemplates.map(template => template.code).sort();
  }
}

/**
 * Helper function to create standardized errors quickly
 */
export function createStandardizedError(
  template: ErrorTemplate,
  context: ErrorContext,
  reason?: string,
  additionalReplacements?: Record<string, string>
): StandardizedError {
  const replacements = { ...(additionalReplacements || {}) };
  if (reason) {
    replacements.reason = reason;
  }
  
  return ErrorMessageTemplates.generateStandardizedError(template, context, replacements);
}

/**
 * Helper function to create correlation module reference
 */
function generateCorrelationId(): string {
  // Fallback correlation ID generation if correlation module isn't available
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
} 