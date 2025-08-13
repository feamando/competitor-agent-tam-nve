/**
 * Design System Migration Utilities
 * 
 * Provides utilities for systematic component migration and import updates
 * Part of Phase 5: Systematic Component Migration & Enhancement
 */

import * as React from "react";

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

// Higher-order component for progressive enhancement
export function withProgressiveEnhancement<T extends object>(Component: React.ComponentType<T>) {
  return function EnhancedComponent(props: T) {
    return React.createElement(Component, props);
  };
}

// Higher-order component for migration warnings
export function withMigrationWarning<T extends object>(Component: React.ComponentType<T>, warningMessage?: string) {
  return function WarningComponent(props: T) {
    React.useEffect(() => {
      if (warningMessage) {
        console.warn(`Migration Warning: ${warningMessage}`);
      }
    }, []);
    return React.createElement(Component, props);
  };
}

// Function to track migration events
export function trackMigrationEvent(eventName: string, data?: any) {
  console.log(`Migration Event: ${eventName}`, data);
}