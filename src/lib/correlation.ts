/**
 * Task 6.1: Correlation ID Management
 * 
 * Provides correlation IDs for tracking operations and errors across the system
 */

/**
 * Generate a unique correlation ID for tracking operations
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `COR-${timestamp}-${random}`;
}

/**
 * Generate a project-specific correlation ID
 */
export function generateProjectCorrelationId(projectId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);
  return `PRJ-${projectId}-${timestamp}-${random}`;
}

/**
 * Generate an analysis-specific correlation ID
 */
export function generateAnalysisCorrelationId(analysisType: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);
  return `ANL-${analysisType.toUpperCase()}-${timestamp}-${random}`;
}

/**
 * Generate a report-specific correlation ID
 */
export function generateReportCorrelationId(reportType: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);
  return `RPT-${reportType.toUpperCase()}-${timestamp}-${random}`;
}

/**
 * Extract timestamp from correlation ID
 */
export function getTimestampFromCorrelationId(correlationId: string): number | null {
  try {
    const parts = correlationId.split('-');
    if (parts.length >= 2) {
      const timestamp = parseInt(parts[1]);
      return isNaN(timestamp) ? null : timestamp;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate correlation ID format
 */
export function isValidCorrelationId(correlationId: string): boolean {
  const correlationIdPattern = /^(COR|PRJ|ANL|RPT|ERR)-\d+-[a-z0-9]+$/i;
  return correlationIdPattern.test(correlationId);
}

/**
 * Get correlation ID type
 */
export function getCorrelationIdType(correlationId: string): string | null {
  try {
    const parts = correlationId.split('-');
    return parts.length > 0 && parts[0] ? parts[0] : null;
  } catch {
    return null;
  }
}
