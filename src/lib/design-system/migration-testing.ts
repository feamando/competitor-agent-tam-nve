/**
 * Migration Testing Utilities
 * Testing tools and utilities for component migration validation
 * Part of Phase 4: Migration & Integration (Task 7.6)
 */

import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { ThemeProvider } from "./theme";
import { type MigrationStatus, MIGRATION_STATUS } from "./migration-utils";

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Migration test configuration
export interface MigrationTestConfig {
  componentName: string;
  legacyComponent: React.ComponentType<any>;
  newComponent: React.ComponentType<any>;
  testProps: Record<string, any>;
  expectedBehaviors: string[];
}

// Visual regression test utilities
export interface VisualTestOptions {
  themes?: Array<"light" | "dark">;
  viewports?: Array<{
    name: string;
    width: number;
    height: number;
  }>;
  states?: Array<{
    name: string;
    props: Record<string, any>;
  }>;
}

// Performance comparison utilities
export interface PerformanceComparison {
  legacyRenderTime: number;
  newRenderTime: number;
  improvement: number;
  memoryUsage: {
    legacy: number;
    new: number;
    difference: number;
  };
}

// Test suite for component migration
export class MigrationTestSuite {
  private config: MigrationTestConfig;
  
  constructor(config: MigrationTestConfig) {
    this.config = config;
  }
  
  // Test component rendering consistency
  async testRenderingConsistency() {
    const { legacyComponent: Legacy, newComponent: New, testProps } = this.config;
    
    describe(`${this.config.componentName} Migration - Rendering`, () => {
      test("both components render without errors", () => {
        expect(() => render(<Legacy {...testProps} />)).not.toThrow();
        expect(() => render(<New {...testProps} />)).not.toThrow();
      });
      
      test("components have similar DOM structure", () => {
        const legacyResult = render(<Legacy {...testProps} />);
        const newResult = render(<New {...testProps} />);
        
        // Compare basic structure (simplified)
        const legacyElements = legacyResult.container.querySelectorAll('*');
        const newElements = newResult.container.querySelectorAll('*');
        
        // Should have similar number of elements (within 20% variance)
        const variance = Math.abs(legacyElements.length - newElements.length);
        const allowedVariance = Math.ceil(legacyElements.length * 0.2);
        
        expect(variance).toBeLessThanOrEqual(allowedVariance);
        
        legacyResult.unmount();
        newResult.unmount();
      });
    });
  }
  
  // Test behavioral consistency
  async testBehavioralConsistency() {
    const { legacyComponent: Legacy, newComponent: New, testProps } = this.config;
    
    describe(`${this.config.componentName} Migration - Behavior`, () => {
      test("click events work consistently", async () => {
        const legacyOnClick = jest.fn();
        const newOnClick = jest.fn();
        
        const legacyResult = render(
          <Legacy {...testProps} onClick={legacyOnClick} />
        );
        const newResult = render(
          <New {...testProps} onClick={newOnClick} />
        );
        
        const user = userEvent.setup();
        
        // Find clickable elements
        const legacyClickable = legacyResult.container.querySelector('[role="button"], button, a');
        const newClickable = newResult.container.querySelector('[role="button"], button, a');
        
        if (legacyClickable && newClickable) {
          await user.click(legacyClickable);
          await user.click(newClickable);
          
          expect(legacyOnClick).toHaveBeenCalledTimes(1);
          expect(newOnClick).toHaveBeenCalledTimes(1);
        }
        
        legacyResult.unmount();
        newResult.unmount();
      });
      
      test("keyboard navigation works consistently", async () => {
        const legacyResult = render(<Legacy {...testProps} />);
        const newResult = render(<New {...testProps} />);
        
        const user = userEvent.setup();
        
        // Test tab navigation
        await user.tab();
        const legacyFocused = legacyResult.container.querySelector(':focus');
        
        legacyResult.unmount();
        
        await user.tab();
        const newFocused = newResult.container.querySelector(':focus');
        
        // Both should have focusable elements
        if (legacyFocused) {
          expect(newFocused).toBeTruthy();
        }
        
        newResult.unmount();
      });
    });
  }
  
  // Test accessibility consistency
  async testAccessibilityConsistency() {
    const { legacyComponent: Legacy, newComponent: New, testProps } = this.config;
    
    describe(`${this.config.componentName} Migration - Accessibility`, () => {
      test("both components are accessible", async () => {
        const legacyResult = render(<Legacy {...testProps} />);
        const legacyAxeResults = await axe(legacyResult.container);
        expect(legacyAxeResults).toHaveNoViolations();
        legacyResult.unmount();
        
        const newResult = render(<New {...testProps} />);
        const newAxeResults = await axe(newResult.container);
        expect(newAxeResults).toHaveNoViolations();
        newResult.unmount();
      });
      
      test("ARIA attributes are preserved or improved", () => {
        const legacyResult = render(<Legacy {...testProps} />);
        const newResult = render(<New {...testProps} />);
        
        const legacyAriaElements = legacyResult.container.querySelectorAll('[aria-label], [aria-describedby], [role]');
        const newAriaElements = newResult.container.querySelectorAll('[aria-label], [aria-describedby], [role]');
        
        // New component should have at least as many ARIA attributes
        expect(newAriaElements.length).toBeGreaterThanOrEqual(legacyAriaElements.length);
        
        legacyResult.unmount();
        newResult.unmount();
      });
    });
  }
  
  // Test theme consistency
  async testThemeConsistency() {
    const { newComponent: New, testProps } = this.config;
    
    describe(`${this.config.componentName} Migration - Theme`, () => {
      test("works correctly in both themes", async () => {
        for (const theme of ["light", "dark"] as const) {
          const result = render(
            <ThemeProvider defaultTheme={theme}>
              <New {...testProps} />
            </ThemeProvider>
          );
          
          // Check that component renders
          expect(result.container.firstChild).toBeInTheDocument();
          
          result.unmount();
        }
      });
      
      test("theme transitions don't break component", async () => {
        let currentTheme: "light" | "dark" = "light";
        
        const ThemeWrapper = ({ children }: { children: React.ReactNode }) => (
          <ThemeProvider defaultTheme={currentTheme}>
            {children}
          </ThemeProvider>
        );
        
        const { rerender } = render(
          <ThemeWrapper>
            <New {...testProps} />
          </ThemeWrapper>
        );
        
        // Switch theme
        currentTheme = "dark";
        rerender(
          <ThemeWrapper>
            <New {...testProps} />
          </ThemeWrapper>
        );
        
        // Component should still be rendered
        expect(screen.getByTestId?.(testProps['data-testid']) || document.querySelector('*')).toBeInTheDocument();
      });
    });
  }
  
  // Performance comparison test
  async testPerformanceComparison(): Promise<PerformanceComparison> {
    const { legacyComponent: Legacy, newComponent: New, testProps } = this.config;
    
    const measureRenderTime = async (Component: React.ComponentType<any>) => {
      const times: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        const result = render(<Component {...testProps} />);
        const endTime = performance.now();
        
        times.push(endTime - startTime);
        result.unmount();
      }
      
      return times.reduce((sum, time) => sum + time, 0) / times.length;
    };
    
    const measureMemoryUsage = (Component: React.ComponentType<any>): number => {
      if (typeof window === 'undefined' || !('performance' in window)) {
        return 0;
      }
      
      const before = (performance as any).memory?.usedJSHeapSize || 0;
      const result = render(<Component {...testProps} />);
      const after = (performance as any).memory?.usedJSHeapSize || 0;
      
      result.unmount();
      return after - before;
    };
    
    const legacyRenderTime = await measureRenderTime(Legacy);
    const newRenderTime = await measureRenderTime(New);
    const legacyMemory = measureMemoryUsage(Legacy);
    const newMemory = measureMemoryUsage(New);
    
    return {
      legacyRenderTime,
      newRenderTime,
      improvement: ((legacyRenderTime - newRenderTime) / legacyRenderTime) * 100,
      memoryUsage: {
        legacy: legacyMemory,
        new: newMemory,
        difference: newMemory - legacyMemory,
      },
    };
  }
  
  // Run complete migration test suite
  async runCompleteSuite(): Promise<void> {
    console.log(`🧪 Running migration tests for ${this.config.componentName}...`);
    
    await this.testRenderingConsistency();
    await this.testBehavioralConsistency();
    await this.testAccessibilityConsistency();
    await this.testThemeConsistency();
    
    const performance = await this.testPerformanceComparison();
    
    console.log(`📊 Performance comparison for ${this.config.componentName}:`, {
      renderTimeImprovement: `${performance.improvement.toFixed(2)}%`,
      memoryDifference: `${performance.memoryUsage.difference} bytes`,
    });
  }
}

// Visual regression testing utilities
export class VisualRegressionTester {
  private componentName: string;
  
  constructor(componentName: string) {
    this.componentName = componentName;
  }
  
  async captureSnapshots(
    Component: React.ComponentType<any>,
    options: VisualTestOptions = {}
  ) {
    const {
      themes = ["light", "dark"],
      viewports = [
        { name: "mobile", width: 375, height: 667 },
        { name: "desktop", width: 1024, height: 768 },
      ],
      states = [{ name: "default", props: {} }],
    } = options;
    
    describe(`${this.componentName} Visual Regression`, () => {
      themes.forEach(theme => {
        viewports.forEach(viewport => {
          states.forEach(state => {
            test(`${theme}-${viewport.name}-${state.name}`, () => {
              // Mock viewport
              Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: viewport.width,
              });
              
              Object.defineProperty(window, 'innerHeight', {
                writable: true,
                configurable: true,
                value: viewport.height,
              });
              
              const { container } = render(
                <ThemeProvider defaultTheme={theme}>
                  <Component {...state.props} />
                </ThemeProvider>
              );
              
              // Take snapshot
              expect(container.firstChild).toMatchSnapshot(
                `${this.componentName}-${theme}-${viewport.name}-${state.name}`
              );
            });
          });
        });
      });
    });
  }
}

// Migration status validator
export class MigrationStatusValidator {
  validateMigrationStatus(): {
    completed: string[];
    inProgress: string[];
    pending: string[];
    issues: string[];
  } {
    const result = {
      completed: [] as string[],
      inProgress: [] as string[],
      pending: [] as string[],
      issues: [] as string[],
    };
    
    Object.entries(MIGRATION_STATUS).forEach(([component, status]) => {
      switch (status) {
        case 'COMPLETED':
          result.completed.push(component);
          break;
        case 'IN_PROGRESS':
          result.inProgress.push(component);
          break;
        case 'PENDING':
          result.pending.push(component);
          break;
        default:
          result.issues.push(`Unknown status for ${component}: ${status}`);
      }
    });
    
    return result;
  }
  
  generateMigrationReport() {
    const status = this.validateMigrationStatus();
    const total = Object.keys(MIGRATION_STATUS).length;
    const completionRate = (status.completed.length / total) * 100;
    
    const report = {
      summary: {
        total,
        completed: status.completed.length,
        inProgress: status.inProgress.length,
        pending: status.pending.length,
        completionRate: `${completionRate.toFixed(1)}%`,
      },
      details: status,
      recommendations: [] as string[],
    };
    
    // Generate recommendations
    if (status.inProgress.length > 3) {
      report.recommendations.push("Consider focusing on fewer components at once");
    }
    
    if (completionRate < 50) {
      report.recommendations.push("Prioritize high-impact components first");
    }
    
    if (status.issues.length > 0) {
      report.recommendations.push("Resolve migration status issues");
    }
    
    return report;
  }
}

// Batch testing utilities
export async function runBatchMigrationTests(
  configs: MigrationTestConfig[]
): Promise<void> {
  console.log(`🔥 Running batch migration tests for ${configs.length} components...`);
  
  for (const config of configs) {
    const suite = new MigrationTestSuite(config);
    await suite.runCompleteSuite();
  }
  
  console.log("✅ Batch migration tests completed");
}

// Export all testing utilities
export const MigrationTesting = {
  MigrationTestSuite,
  VisualRegressionTester,
  MigrationStatusValidator,
  runBatchMigrationTests,
};
