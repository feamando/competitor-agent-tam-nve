/**
 * Design System Migration Utilities
 * 
 * Provides utilities for systematic component migration and import updates
 * Part of Phase 5: Systematic Component Migration & Enhancement
 */

import * as React from 'react';

interface ComponentMapping {
  from: string;
  to: string;
  type: 'import' | 'component' | 'prop';
  deprecated?: boolean;
  replacementInstructions?: string;
}

/**
 * Component migration mappings from legacy to shadcn/ui components
 */
export const COMPONENT_MAPPINGS: ComponentMapping[] = [
  // Form Components
  { from: 'native-input', to: '@/components/ui/input', type: 'import' },
  { from: 'native-button', to: '@/components/ui/button', type: 'import' },
  { from: 'native-textarea', to: '@/components/ui/textarea', type: 'import' },
  { from: 'native-select', to: '@/components/ui/select', type: 'import' },
  
  // Layout Components
  { from: 'custom-card', to: '@/components/ui/card', type: 'import' },
  { from: 'custom-dialog', to: '@/components/ui/dialog', type: 'import' },
  
  // Feedback Components
  { from: 'custom-alert', to: '@/components/ui/alert', type: 'import' },
  { from: 'custom-badge', to: '@/components/ui/badge', type: 'import' },
  
  // Loading Components
  { from: 'custom-skeleton', to: '@/components/ui/skeleton', type: 'import' },
  { from: 'LoadingSpinner', to: '@/components/composed/LoadingButton', type: 'import' }
];

/**
 * CSS class mappings from legacy to design token classes
 */
export const CSS_CLASS_MAPPINGS: ComponentMapping[] = [
  { from: 'text-gray-900', to: 'text-foreground', type: 'component' },
  { from: 'text-gray-600', to: 'text-muted-foreground', type: 'component' },
  { from: 'bg-white', to: 'bg-background', type: 'component' },
  { from: 'bg-gray-50', to: 'bg-muted', type: 'component' },
  { from: 'border-gray-200', to: 'border-border', type: 'component' },
  { from: 'bg-blue-600', to: 'bg-primary', type: 'component' },
  { from: 'text-blue-600', to: 'text-primary', type: 'component' }
];

/**
 * Deprecated component patterns to flag for manual review
 */
export const DEPRECATED_PATTERNS = [
  'className.*bg-.*-\\d{2,3}(?!\\s*hover:|\\s*focus:)',
  'className.*text-.*-\\d{2,3}(?!\\s*hover:|\\s*focus:)',
  'className.*border-.*-\\d{2,3}(?!\\s*hover:|\\s*focus:)',
  'style={{.*color:.*}}',
  'style={{.*backgroundColor:.*}}'
];

/**
 * Validate component migration completeness
 */
export function validateMigration(componentPath: string, content: string) {
  const validation = {
    hasDesignTokens: false,
    hasShadcnImports: false,
    hasDeprecatedCSS: false,
    hasHardcodedColors: false,
    score: 0
  };
  
  // Check for design token usage
  const designTokenPatterns = [
    'text-foreground', 'text-muted-foreground', 'bg-background',
    'bg-muted', 'border-border', 'text-primary', 'bg-primary'
  ];
  
  validation.hasDesignTokens = designTokenPatterns.some(pattern => 
    content.includes(pattern)
  );
  validation.hasShadcnImports = content.includes('@/components/ui/');
  validation.hasDeprecatedCSS = DEPRECATED_PATTERNS.some(pattern => 
    new RegExp(pattern).test(content)
  );
  validation.hasHardcodedColors = /className.*\b(text|bg|border)-\w+-\d{2,3}\b/.test(content);
  
  // Calculate score
  let score = 0;
  if (validation.hasDesignTokens) score += 30;
  if (validation.hasShadcnImports) score += 30;
  if (!validation.hasDeprecatedCSS) score += 20;
  if (!validation.hasHardcodedColors) score += 20;
  
  validation.score = score;
  return validation;
}

/**
 * Migration tracking interface
 */
interface MigrationEvent {
  componentName: string;
  action: 'migrated' | 'deprecated_used' | 'enhanced' | 'warning_shown';
  timestamp?: Date;
  metadata?: Record<string, any>;
}

/**
 * Track migration events for analytics and monitoring
 */
export function trackMigrationEvent(event: MigrationEvent): void {
  const trackingEvent = {
    ...event,
    timestamp: event.timestamp || new Date(),
    source: 'design-system-migration'
  };
  
  // In development, log to console
  if (process.env.NODE_ENV === 'development') {
    console.group(`🔄 Migration Event: ${event.componentName}`);
    console.log(`Action: ${event.action}`);
    if (event.metadata) {
      console.log('Metadata:', event.metadata);
    }
    console.groupEnd();
  }
  
  // In production, you might want to send to analytics service
  // analytics.track('component_migration', trackingEvent);
}

/**
 * Higher-Order Component for progressive enhancement
 * Renders new component if available, falls back to legacy component
 */
export function withProgressiveEnhancement<P extends object>(
  LegacyComponent: React.ComponentType<P>,
  NewComponent: React.ComponentType<P>,
  featureFlag?: string,
  enableFallback: boolean = true
): React.ComponentType<P> {
  return React.forwardRef<any, P>((props, ref) => {
    const [hasError, setHasError] = React.useState(false);
    const [shouldUseNew, setShouldUseNew] = React.useState(true);
    
    // Check feature flag if provided
    React.useEffect(() => {
      if (featureFlag && typeof window !== 'undefined') {
        const stored = localStorage.getItem(`feature-${featureFlag}`);
        setShouldUseNew(stored !== 'false');
      }
    }, [featureFlag]);
    
    // Error boundary logic
    React.useEffect(() => {
      if (hasError && enableFallback) {
        trackMigrationEvent({
          componentName: NewComponent.displayName || 'Unknown',
          action: 'deprecated_used',
          metadata: { reason: 'error_fallback' }
        });
      }
    }, [hasError, enableFallback]);
    
    // If there's an error and fallback is enabled, use legacy component
    if (hasError && enableFallback) {
      return React.createElement(LegacyComponent, props);
    }
    
    // If feature flag says to use legacy, use it
    if (!shouldUseNew) {
      return React.createElement(LegacyComponent, props);
    }
    
    // Try to render new component with error boundary
    try {
      return React.createElement(NewComponent, { ...props, ref });
    } catch (error) {
      if (enableFallback) {
        setHasError(true);
        return React.createElement(LegacyComponent, props);
      }
      throw error;
    }
  });
}

/**
 * Higher-Order Component that shows migration warnings
 */
export function withMigrationWarning<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string,
  newComponentPath: string,
  deprecationVersion?: string
): React.ComponentType<P> {
  return React.forwardRef<any, P>((props, ref) => {
    React.useEffect(() => {
      const warningKey = `migration-warning-${componentName}`;
      const hasShownWarning = sessionStorage.getItem(warningKey);
      
      if (!hasShownWarning && process.env.NODE_ENV === 'development') {
        console.warn(
          `⚠️  Migration Warning: ${componentName}\n` +
          `This component is deprecated and will be removed in version ${deprecationVersion || 'next major version'}.\n` +
          `Please migrate to: ${newComponentPath}\n` +
          `This warning will only show once per session.`
        );
        
        sessionStorage.setItem(warningKey, 'true');
        
        trackMigrationEvent({
          componentName,
          action: 'warning_shown',
          metadata: {
            newPath: newComponentPath,
            deprecationVersion
          }
        });
      }
    }, []);
    
    return React.createElement(Component, { ...props, ref });
  });
}