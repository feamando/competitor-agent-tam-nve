/**
 * Design System Main Export
 * Central export file for all design system utilities, components, and types
 * Part of Phase 3: Design System Architecture
 */

// Theme System
export * from "./theme";
export * from "./variants";
export * from "./composition";
export * from "./testing";

// Phase 4: Migration & Performance
export * from "./migration-utils";
export * from "./performance";
export * from "./build-optimization";
export * from "./migration-testing";

// Types
export * from "@/types/design-system";

// UI Components (re-export for convenience)
export * from "@/components/ui";

// Composed Components (re-export for convenience)  
export * from "@/components/composed";

// Main Design System API
export const DesignSystem = {
  // Theme utilities
  Theme: {
    Provider: () => import("./theme").then(m => m.ThemeProvider),
    useTheme: () => import("./theme").then(m => m.useTheme),
    utils: () => import("./theme").then(m => m.themeUtils),
    Toggle: () => import("@/components/ui/theme-toggle").then(m => m.ThemeToggle),
  },
  
  // Variant utilities
  Variants: {
    create: () => import("./variants").then(m => m.createVariant),
    createThemed: () => import("./variants").then(m => m.createThemeVariant),
    createCompound: () => import("./variants").then(m => m.createCompoundVariant),
    manager: () => import("./variants").then(m => m.variantManager),
  },
  
  // Component utilities
  Components: {
    cn: () => import("./composition").then(m => m.cn),
    withLoading: () => import("./composition").then(m => m.withLoadingState),
    withError: () => import("./composition").then(m => m.withErrorBoundary),
    useAsync: () => import("./composition").then(m => m.useAsyncOperation),
    useForm: () => import("./composition").then(m => m.useFormValidation),
  },
  
  // Testing utilities
  Testing: {
    render: () => import("./testing").then(m => m.renderWithTheme),
    TestWrapper: () => import("./testing").then(m => m.TestWrapper),
    theme: () => import("./testing").then(m => m.themeTestUtils),
    interaction: () => import("./testing").then(m => m.interactionUtils),
    a11y: () => import("./testing").then(m => m.a11yUtils),
  },
  
  // Migration utilities (Phase 4)
  Migration: {
    utils: () => import("./migration-utils").then(m => m.MigrationUtils),
    withWarning: () => import("./migration-utils").then(m => m.withMigrationWarning),
    withEnhancement: () => import("./migration-utils").then(m => m.withProgressiveEnhancement),
    status: () => import("./migration-utils").then(m => m.MIGRATION_STATUS),
    testing: () => import("./migration-testing").then(m => m.MigrationTesting),
  },
  
  // Performance utilities (Phase 4)
  Performance: {
    monitor: () => import("./performance").then(m => m.performanceMonitor),
    lazy: () => import("./performance").then(m => m.LazyComponents),
    utils: () => import("./performance").then(m => m.PerformanceUtils),
    build: () => import("./build-optimization").then(m => m.BuildOptimization),
  },
};

// Version information
export const DESIGN_SYSTEM_VERSION = "4.0.0";
export const PHASE_3_COMPLETED = true;
export const PHASE_4_COMPLETED = true;
