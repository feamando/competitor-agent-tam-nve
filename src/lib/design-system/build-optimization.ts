/**
 * Build Optimization Configuration
 * Production build optimizations for the design system
 * Part of Phase 4: Migration & Integration (Task 8.6)
 */

// Webpack optimization configuration
export const webpackOptimization = {
  // Bundle splitting for design system
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      // Core design system bundle
      designSystemCore: {
        name: 'design-system-core',
        test: /[\\/]src[\\/]components[\\/]ui[\\/]/,
        priority: 30,
        reuseExistingChunk: true,
      },
      
      // Composed components bundle
      designSystemComposed: {
        name: 'design-system-composed',
        test: /[\\/]src[\\/]components[\\/]composed[\\/]/,
        priority: 25,
        reuseExistingChunk: true,
      },
      
      // Design system utilities
      designSystemUtils: {
        name: 'design-system-utils',
        test: /[\\/]src[\\/]lib[\\/]design-system[\\/]/,
        priority: 20,
        reuseExistingChunk: true,
      },
      
      // Radix UI primitives
      radixUI: {
        name: 'radix-ui',
        test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
        priority: 15,
        reuseExistingChunk: true,
      },
      
      // Icons bundle
      icons: {
        name: 'icons',
        test: /[\\/]node_modules[\\/]@heroicons[\\/]|[\\/]node_modules[\\/]lucide-react[\\/]/,
        priority: 10,
        reuseExistingChunk: true,
      },
    },
  },
  
  // Minimize configuration
  minimize: true,
  minimizer: [
    // CSS optimization
    {
      options: {
        preset: [
          'default',
          {
            discardComments: {
              removeAll: true,
            },
            normalizeUnicode: false,
          },
        ],
      },
    },
  ],
  
  // Tree shaking
  usedExports: true,
  sideEffects: false,
};

// Next.js configuration optimizations
export const nextjsOptimization = {
  // Experimental features
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'lucide-react',
      '@heroicons/react',
    ],
  },
  
  // Bundle analyzer configuration
  bundleAnalyzer: {
    enabled: process.env.ANALYZE === 'true',
    openAnalyzer: false,
  },
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 31536000, // 1 year
  },
  
  // Compression
  compress: true,
  
  // Static optimization
  swcMinify: true,
  
  // Output configuration
  output: 'standalone',
  
  // Performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
    styledComponents: false, // We use Tailwind
  },
};

// Tailwind CSS optimization
export const tailwindOptimization = {
  // Purge configuration
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  
  // Optimize for production
  plugins: [
    // Remove unused styles
    require('@tailwindcss/forms'),
    require('tailwindcss-animate'),
  ],
  
  // Dark mode optimization
  darkMode: 'class',
  
  // Safelist critical classes
  safelist: [
    // Animation classes
    'animate-spin',
    'animate-pulse',
    'animate-bounce',
    
    // Theme classes
    'dark',
    'light',
    
    // Critical component classes
    'sr-only',
    'focus-visible:outline-none',
    'focus-visible:ring-1',
    'focus-visible:ring-ring',
  ],
};

// CSS optimization utilities
export const cssOptimizations = {
  // Critical CSS extraction
  extractCriticalCSS: () => ({
    // Above-the-fold styles
    critical: [
      // Layout
      '.container',
      '.flex',
      '.grid',
      '.hidden',
      '.block',
      
      // Typography
      '.text-sm',
      '.text-base',
      '.text-lg',
      '.font-medium',
      '.font-semibold',
      
      // Colors
      '.text-foreground',
      '.text-muted-foreground',
      '.bg-background',
      '.bg-card',
      
      // Spacing
      '.p-4',
      '.px-4',
      '.py-2',
      '.m-4',
      '.mx-auto',
      
      // Borders
      '.border',
      '.border-border',
      '.rounded-md',
      '.rounded-lg',
      
      // Shadows
      '.shadow-sm',
      '.shadow-md',
    ],
    
    // Defer non-critical styles
    deferred: [
      // Animations
      '.animate-*',
      '.transition-*',
      '.duration-*',
      '.ease-*',
      
      // Hover states
      '.hover\\:*',
      '.focus\\:*',
      '.active\\:*',
      
      // Complex layouts
      '.grid-cols-*',
      '.gap-*',
      
      // Advanced styling
      '.backdrop-*',
      '.transform',
      '.scale-*',
      '.rotate-*',
    ],
  }),
  
  // CSS custom property optimization
  optimizeCustomProperties: () => ({
    // Group related properties
    layout: [
      '--container-max-width',
      '--header-height',
      '--sidebar-width',
    ],
    
    colors: [
      '--background',
      '--foreground',
      '--primary',
      '--primary-foreground',
      '--secondary',
      '--secondary-foreground',
      '--muted',
      '--muted-foreground',
      '--accent',
      '--accent-foreground',
      '--destructive',
      '--destructive-foreground',
      '--border',
      '--input',
      '--ring',
    ],
    
    typography: [
      '--font-sans',
      '--font-mono',
      '--font-size-xs',
      '--font-size-sm',
      '--font-size-base',
      '--font-size-lg',
      '--font-size-xl',
    ],
    
    spacing: [
      '--spacing-xs',
      '--spacing-sm',
      '--spacing-md',
      '--spacing-lg',
      '--spacing-xl',
    ],
    
    animation: [
      '--duration-fast',
      '--duration-normal',
      '--duration-slow',
      '--ease-in',
      '--ease-out',
      '--ease-in-out',
    ],
  }),
};

// Performance budgets
export const performanceBudgets = {
  // Bundle size limits
  bundleSize: {
    // JavaScript bundles
    'design-system-core': 50 * 1024, // 50KB
    'design-system-composed': 75 * 1024, // 75KB
    'design-system-utils': 25 * 1024, // 25KB
    'radix-ui': 100 * 1024, // 100KB
    'icons': 30 * 1024, // 30KB
  },
  
  // CSS size limits
  cssSize: {
    critical: 14 * 1024, // 14KB (critical CSS)
    total: 50 * 1024, // 50KB (total CSS)
  },
  
  // Performance metrics
  metrics: {
    firstContentfulPaint: 1500, // 1.5s
    largestContentfulPaint: 2500, // 2.5s
    cumulativeLayoutShift: 0.1, // CLS score
    timeToInteractive: 3000, // 3s
  },
};

// Bundle analysis reporting
export interface BundleReport {
  timestamp: number;
  totalSize: number;
  bundles: Record<string, {
    size: number;
    gzippedSize: number;
    modules: number;
  }>;
  recommendations: string[];
  warnings: string[];
}

export function generateBundleReport(): BundleReport {
  const report: BundleReport = {
    timestamp: Date.now(),
    totalSize: 0,
    bundles: {},
    recommendations: [],
    warnings: [],
  };
  
  // Analyze bundle sizes (simplified implementation)
  Object.entries(performanceBudgets.bundleSize).forEach(([bundleName, budget]) => {
    const actualSize = Math.floor(Math.random() * budget * 1.5); // Mock size
    
    report.bundles[bundleName] = {
      size: actualSize,
      gzippedSize: Math.floor(actualSize * 0.3),
      modules: Math.floor(actualSize / 1000),
    };
    
    report.totalSize += actualSize;
    
    // Check against budget
    if (actualSize > budget) {
      report.warnings.push(
        `Bundle ${bundleName} (${actualSize} bytes) exceeds budget (${budget} bytes)`
      );
    }
    
    // Generate recommendations
    if (actualSize > budget * 0.8) {
      report.recommendations.push(
        `Consider code splitting or lazy loading for ${bundleName}`
      );
    }
  });
  
  return report;
}

// Build-time optimization checks
export function validateBuildOptimizations() {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  // Check if tree shaking is enabled
  if (process.env.NODE_ENV === 'production') {
    if (!webpackOptimization.usedExports) {
      issues.push('Tree shaking is not enabled');
    }
    
    if (!webpackOptimization.minimize) {
      issues.push('Minification is not enabled');
    }
  }
  
  // Check bundle splitting configuration
  if (!webpackOptimization.splitChunks) {
    recommendations.push('Enable bundle splitting for better caching');
  }
  
  // Check CSS optimization
  if (!nextjsOptimization.experimental?.optimizeCss) {
    recommendations.push('Enable CSS optimization');
  }
  
  return { issues, recommendations };
}

// Runtime performance monitoring
export function setupProductionMonitoring() {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') {
    return;
  }
  
  // Monitor Core Web Vitals
  const vitals = {
    FCP: 0,
    LCP: 0,
    FID: 0,
    CLS: 0,
  };
  
  // First Contentful Paint
  new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.name === 'first-contentful-paint') {
        vitals.FCP = entry.startTime;
      }
    });
  }).observe({ entryTypes: ['paint'] });
  
  // Largest Contentful Paint
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    vitals.LCP = lastEntry.startTime;
  }).observe({ entryTypes: ['largest-contentful-paint'] });
  
  // Cumulative Layout Shift
  let clsScore = 0;
  new PerformanceObserver((list) => {
    list.getEntries().forEach((entry: any) => {
      if (!entry.hadRecentInput) {
        clsScore += entry.value;
      }
    });
    vitals.CLS = clsScore;
  }).observe({ entryTypes: ['layout-shift'] });
  
  // Report vitals periodically
  setInterval(() => {
    if (vitals.FCP > 0 || vitals.LCP > 0) {
      console.log('📊 Core Web Vitals:', vitals);
      
      // Check against budgets
      Object.entries(performanceBudgets.metrics).forEach(([metric, budget]) => {
        const value = vitals[metric as keyof typeof vitals];
        if (value > budget) {
          console.warn(`⚠️ ${metric} (${value}ms) exceeds budget (${budget}ms)`);
        }
      });
    }
  }, 30000); // Every 30 seconds
}

// Export all optimization utilities
export const BuildOptimization = {
  webpackOptimization,
  nextjsOptimization,
  tailwindOptimization,
  cssOptimizations,
  performanceBudgets,
  generateBundleReport,
  validateBuildOptimizations,
  setupProductionMonitoring,
};
