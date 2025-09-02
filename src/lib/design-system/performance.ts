/**
 * Performance Optimization Utilities
 * Tools for bundle optimization, tree-shaking, and performance monitoring
 * Part of Phase 4: Migration & Integration (Task 8.0)
 */

import * as React from "react";
import { type ComponentType, lazy, Suspense } from "react";

// Bundle analyzer types
export interface BundleAnalysis {
  totalSize: number;
  componentCount: number;
  unusedComponents: string[];
  heaviestComponents: Array<{
    name: string;
    size: number;
    imports: string[];
  }>;
  duplicatedDependencies: string[];
  treeShakenComponents: string[];
}

// Performance metrics collector
export interface PerformanceMetrics {
  renderTime: number;
  bundleSize: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
}

// Tree-shakeable component imports configuration
export const TREESHAKEABLE_COMPONENTS = {
  // Core UI Components (always included)
  core: [
    'Button',
    'Input',
    'Label',
    'Card',
    'Alert',
  ],
  
  // Form Components (lazy loaded)
  forms: [
    'Textarea',
    'Select',
    'Checkbox',
    'RadioGroup',
    'Switch',
  ],
  
  // Navigation Components (lazy loaded)
  navigation: [
    'Tabs',
    'Breadcrumb',
    'Pagination',
    'NavigationMenu',
  ],
  
  // Dialog Components (lazy loaded)
  dialogs: [
    'Dialog',
    'AlertDialog',
    'Sheet',
    'Popover',
    'DropdownMenu',
  ],
  
  // Data Display (lazy loaded)
  dataDisplay: [
    'Table',
    'Avatar',
    'Badge',
    'Progress',
    'Skeleton',
  ],
  
  // Feedback Components (lazy loaded)
  feedback: [
    'Toast',
    'Tooltip',
    'HoverCard',
    'Collapsible',
  ],
  
  // Specialty Components (conditionally loaded)
  specialty: [
    'Calendar',
    'DatePicker',
    'Command',
    'Combobox',
    'DataTable',
    'Chart',
  ],
} as const;

// Dynamic component loader with error boundaries
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T } | { [key: string]: T }>,
  componentName: string,
  fallback?: React.ComponentType
) {
  const LazyComponent = lazy(async () => {
    try {
      const module = await importFn();
      
      // Handle both default and named exports
      if ('default' in module) {
        return { default: module.default };
      } else if (componentName in module) {
        return { default: module[componentName as keyof typeof module] };
      } else {
        throw new Error(`Component ${componentName} not found in module`);
      }
    } catch (error) {
      console.error(`Failed to load component ${componentName}:`, error);
      
      // Return fallback component
      if (fallback) {
        return { default: fallback };
      }
      
      // Return error component
      return {
        default: () => (
          <div className="p-4 border border-destructive bg-destructive/10 rounded-md">
            <p className="text-sm text-destructive">
              Failed to load component: {componentName}
            </p>
          </div>
        )
      };
    }
  });
  
  LazyComponent.displayName = `Lazy(${componentName})`;
  
  return LazyComponent;
}

// Suspense wrapper with loading states
export interface SuspenseWrapperProps {
  children: React.ReactNode;
  fallback?: React.ComponentType;
  errorBoundary?: boolean;
}

export function SuspenseWrapper({ 
  children, 
  fallback: Fallback,
  errorBoundary = true 
}: SuspenseWrapperProps) {
  const fallbackComponent = Fallback ? (
    <Fallback />
  ) : (
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
    </div>
  );
  
  if (errorBoundary) {
    return (
      <ErrorBoundary fallback={(error) => (
        <div className="p-4 border border-destructive bg-destructive/10 rounded-md">
          <p className="text-sm text-destructive mb-2">Component loading error</p>
          <details className="text-xs text-muted-foreground">
            <summary>Error details</summary>
            <pre className="mt-2 overflow-auto">{error.message}</pre>
          </details>
        </div>
      )}>
        <Suspense fallback={fallbackComponent}>
          {children}
        </Suspense>
      </ErrorBoundary>
    );
  }
  
  return (
    <Suspense fallback={fallbackComponent}>
      {children}
    </Suspense>
  );
}

// Error boundary component
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: (error: Error) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error);
    }
    
    return this.props.children;
  }
}

// Bundle size optimizer
export function optimizeBundle() {
  const analysis: Partial<BundleAnalysis> = {
    unusedComponents: [],
    treeShakenComponents: [],
    duplicatedDependencies: [],
  };
  
  // Detect unused components (simplified implementation)
  if (typeof window !== 'undefined' && 'performance' in window) {
    const usedComponents = new Set<string>();
    
    // Track component usage
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              const componentName = node.getAttribute('data-component');
              if (componentName) {
                usedComponents.add(componentName);
              }
            }
          });
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Check after initial render
    setTimeout(() => {
      const allComponents = Object.values(TREESHAKEABLE_COMPONENTS).flat();
      analysis.unusedComponents = allComponents.filter(
        component => !usedComponents.has(component)
      );
      
      console.log('📊 Bundle Analysis:', {
        usedComponents: Array.from(usedComponents),
        unusedComponents: analysis.unusedComponents,
      });
    }, 2000);
  }
  
  return analysis;
}

// Performance monitoring
export class PerformanceMonitor {
  private metrics: Partial<PerformanceMetrics> = {};
  private observers: PerformanceObserver[] = [];
  
  constructor() {
    this.initializeObservers();
  }
  
  private initializeObservers() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
      return;
    }
    
    // Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.largestContentfulPaint = lastEntry.startTime;
      });
      
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);
    } catch (error) {
      console.warn('LCP observer not supported');
    }
    
    // First Contentful Paint
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
          this.metrics.firstContentfulPaint = fcpEntry.startTime;
        }
      });
      
      fcpObserver.observe({ entryTypes: ['paint'] });
      this.observers.push(fcpObserver);
    } catch (error) {
      console.warn('FCP observer not supported');
    }
    
    // Cumulative Layout Shift
    try {
      const clsObserver = new PerformanceObserver((list) => {
        let clsScore = 0;
        
        list.getEntries().forEach((entry) => {
          if (!(entry as any).hadRecentInput) {
            clsScore += (entry as any).value;
          }
        });
        
        this.metrics.cumulativeLayoutShift = clsScore;
      });
      
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    } catch (error) {
      console.warn('CLS observer not supported');
    }
  }
  
  measureRenderTime<T extends ComponentType<any>>(
    Component: T,
    displayName = 'Component'
  ): T {
    const WrappedComponent = React.forwardRef<any, React.ComponentProps<T>>((props, ref) => {
      const startTime = React.useRef<number>(0);
      
      React.useLayoutEffect(() => {
        startTime.current = performance.now();
      });
      
      React.useEffect(() => {
        const endTime = performance.now();
        const renderTime = endTime - startTime.current;
        
        this.metrics.renderTime = renderTime;
        
        if (renderTime > 16) { // > 1 frame at 60fps
          console.warn(`🐌 Slow render: ${displayName} took ${renderTime.toFixed(2)}ms`);
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚡ ${displayName} render time: ${renderTime.toFixed(2)}ms`);
        }
      });
      
      return <Component ref={ref} {...props} />;
    });
    
    WrappedComponent.displayName = `Measured(${displayName})`;
    
    return WrappedComponent as T;
  }
  
  getMetrics(): PerformanceMetrics {
    return {
      renderTime: this.metrics.renderTime || 0,
      bundleSize: this.getBundleSize(),
      firstContentfulPaint: this.metrics.firstContentfulPaint || 0,
      largestContentfulPaint: this.metrics.largestContentfulPaint || 0,
      cumulativeLayoutShift: this.metrics.cumulativeLayoutShift || 0,
      timeToInteractive: this.getTimeToInteractive(),
    };
  }
  
  private getBundleSize(): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      return entries[0]?.transferSize || 0;
    } catch {
      return 0;
    }
  }
  
  private getTimeToInteractive(): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const navigation = entries[0];
      return navigation ? navigation.loadEventEnd - navigation.fetchStart : 0;
    } catch {
      return 0;
    }
  }
  
  dispose() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// CSS optimization utilities
export function optimizeCSS() {
  if (typeof document === 'undefined') return;
  
  // Remove unused CSS custom properties
  const usedProperties = new Set<string>();
  const elements = document.querySelectorAll('*');
  
  elements.forEach(element => {
    const computedStyle = getComputedStyle(element);
    
    // Check for CSS custom properties
    for (let i = 0; i < computedStyle.length; i++) {
      const property = computedStyle[i];
      if (property.startsWith('--')) {
        usedProperties.add(property);
      }
    }
  });
  
  console.log('🎨 Used CSS Properties:', usedProperties.size);
  return usedProperties;
}

// Lazy component factory for shadcn/ui components
export const LazyComponents = {
  // Forms
  Textarea: createLazyComponent(
    () => import('@/components/ui/textarea'),
    'Textarea'
  ),
  Select: createLazyComponent(
    () => import('@/components/ui/select'),
    'Select'
  ),
  
  // Dialogs
  AlertDialog: createLazyComponent(
    () => import('@/components/ui/alert-dialog'),
    'AlertDialog'
  ),
  Sheet: createLazyComponent(
    () => import('@/components/ui/sheet'),
    'Sheet'
  ),
  
  // Data Display
  Table: createLazyComponent(
    () => import('@/components/ui/table'),
    'Table'
  ),
  Avatar: createLazyComponent(
    () => import('@/components/ui/avatar'),
    'Avatar'
  ),
  
  // Navigation
  Tabs: createLazyComponent(
    () => import('@/components/ui/tabs'),
    'Tabs'
  ),
  Breadcrumb: createLazyComponent(
    () => import('@/components/ui/breadcrumb'),
    'Breadcrumb'
  ),
};

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Export all performance utilities
export const PerformanceUtils = {
  createLazyComponent,
  SuspenseWrapper,
  PerformanceMonitor,
  optimizeBundle,
  optimizeCSS,
  performanceMonitor,
  TREESHAKEABLE_COMPONENTS,
  LazyComponents,
};
