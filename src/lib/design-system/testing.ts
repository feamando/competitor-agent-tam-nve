/**
 * Component Testing Utilities
 * Testing helpers and utilities for design system components
 * Part of Phase 3: Design System Architecture (Task 5.5)
 */

import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "./theme";
import { type ThemeMode, type RenderResult, type ComponentTestProps } from "@/types/design-system";

// Test wrapper with theme provider
export interface TestWrapperProps {
  children: React.ReactNode;
  theme?: ThemeMode;
  enableSystem?: boolean;
}

export function TestWrapper({ 
  children, 
  theme = "light", 
  enableSystem = false 
}: TestWrapperProps) {
  return (
    <ThemeProvider defaultTheme={theme} enableSystem={enableSystem}>
      {children}
    </ThemeProvider>
  );
}

// Enhanced render function with theme support
export interface RenderWithThemeOptions {
  theme?: ThemeMode;
  enableSystem?: boolean;
  wrapper?: React.ComponentType<{ children: React.ReactNode }>;
}

export function renderWithTheme(
  ui: React.ReactElement,
  options: RenderWithThemeOptions = {}
): RenderResult {
  const { theme = "light", enableSystem = false, wrapper } = options;
  
  const Wrapper = wrapper || TestWrapper;
  
  const result = render(ui, {
    wrapper: ({ children }) => (
      <Wrapper>
        <TestWrapper theme={theme} enableSystem={enableSystem}>
          {children}
        </TestWrapper>
      </Wrapper>
    ),
  });
  
  return {
    ...result,
    getByTestId: (testId: string) => screen.getByTestId(testId),
    queryByTestId: (testId: string) => screen.queryByTestId(testId),
  };
}

// Theme testing utilities
export const themeTestUtils = {
  /**
   * Test component in both light and dark themes
   */
  testInBothThemes: async (
    component: React.ReactElement,
    testFn: (theme: "light" | "dark") => void | Promise<void>
  ) => {
    for (const theme of ["light", "dark"] as const) {
      const { unmount } = renderWithTheme(component, { theme });
      
      // Wait for theme to apply
      await waitFor(() => {
        expect(document.documentElement).toHaveClass(theme);
      });
      
      await testFn(theme);
      
      unmount();
    }
  },
  
  /**
   * Test theme switching functionality
   */
  testThemeSwitch: async (
    component: React.ReactElement,
    triggerSelector: string
  ) => {
    const user = userEvent.setup();
    renderWithTheme(component, { theme: "light" });
    
    // Should start with light theme
    expect(document.documentElement).toHaveClass("light");
    
    // Click theme toggle
    const trigger = screen.getByTestId(triggerSelector) || screen.getByRole("button");
    await user.click(trigger);
    
    // Should switch to dark theme
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    
    // Click again
    await user.click(trigger);
    
    // Should switch back to light theme
    await waitFor(() => {
      expect(document.documentElement).toHaveClass("light");
    });
  },
  
  /**
   * Get computed theme colors
   */
  getThemeColors: (): Record<string, string> => {
    const computedStyle = getComputedStyle(document.documentElement);
    
    return {
      background: computedStyle.getPropertyValue("--background"),
      foreground: computedStyle.getPropertyValue("--foreground"),
      primary: computedStyle.getPropertyValue("--primary"),
      secondary: computedStyle.getPropertyValue("--secondary"),
      muted: computedStyle.getPropertyValue("--muted"),
      accent: computedStyle.getPropertyValue("--accent"),
      destructive: computedStyle.getPropertyValue("--destructive"),
      border: computedStyle.getPropertyValue("--border"),
    };
  },
  
  /**
   * Verify theme consistency
   */
  verifyThemeConsistency: () => {
    const colors = themeTestUtils.getThemeColors();
    
    // Check that all theme colors are defined
    Object.entries(colors).forEach(([key, value]) => {
      expect(value).toBeTruthy();
      expect(value).not.toBe("");
    });
    
    // Check that theme class is applied
    expect(document.documentElement).toHaveClass(/^(light|dark)$/);
  },
};

// Component interaction utilities
export const interactionUtils = {
  /**
   * Test button interactions
   */
  testButton: async (buttonTestId: string) => {
    const user = userEvent.setup();
    const button = screen.getByTestId(buttonTestId);
    
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    
    await user.click(button);
    
    return button;
  },
  
  /**
   * Test form field interactions
   */
  testFormField: async (fieldTestId: string, value: string) => {
    const user = userEvent.setup();
    const field = screen.getByTestId(fieldTestId);
    
    expect(field).toBeInTheDocument();
    
    await user.clear(field);
    await user.type(field, value);
    
    expect(field).toHaveValue(value);
    
    return field;
  },
  
  /**
   * Test select interactions
   */
  testSelect: async (selectTestId: string, optionText: string) => {
    const user = userEvent.setup();
    const select = screen.getByTestId(selectTestId);
    
    expect(select).toBeInTheDocument();
    
    await user.click(select);
    
    const option = await screen.findByText(optionText);
    await user.click(option);
    
    return select;
  },
  
  /**
   * Test modal interactions
   */
  testModal: async (triggerTestId: string, modalTestId: string) => {
    const user = userEvent.setup();
    
    // Modal should not be visible initially
    expect(screen.queryByTestId(modalTestId)).not.toBeInTheDocument();
    
    // Click trigger to open modal
    const trigger = screen.getByTestId(triggerTestId);
    await user.click(trigger);
    
    // Modal should now be visible
    const modal = await screen.findByTestId(modalTestId);
    expect(modal).toBeInTheDocument();
    
    return modal;
  },
};

// Accessibility testing utilities
export const a11yUtils = {
  /**
   * Test keyboard navigation
   */
  testKeyboardNavigation: async (containerTestId: string) => {
    const user = userEvent.setup();
    const container = screen.getByTestId(containerTestId);
    
    // Test Tab navigation
    await user.tab();
    expect(document.activeElement).toBeInTheDocument();
    
    // Test arrow key navigation (if applicable)
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{ArrowRight}");
    
    return container;
  },
  
  /**
   * Test ARIA attributes
   */
  testAriaAttributes: (element: HTMLElement, expectedAttributes: Record<string, string>) => {
    Object.entries(expectedAttributes).forEach(([attr, value]) => {
      expect(element).toHaveAttribute(attr, value);
    });
  },
  
  /**
   * Test focus management
   */
  testFocusManagement: async (elements: HTMLElement[]) => {
    const user = userEvent.setup();
    
    for (const element of elements) {
      element.focus();
      expect(document.activeElement).toBe(element);
      
      // Test that focus is visible
      expect(element).toHaveClass(/focus-visible|focus:|focus\[/);
    }
  },
};

// Performance testing utilities
export const performanceUtils = {
  /**
   * Measure component render time
   */
  measureRenderTime: (component: React.ReactElement, iterations = 100): number => {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const { unmount } = render(component);
      const end = performance.now();
      
      times.push(end - start);
      unmount();
    }
    
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  },
  
  /**
   * Test component memory usage
   */
  testMemoryUsage: (component: React.ReactElement, expectedMaxMB = 10): void => {
    const { unmount } = render(component);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const memoryUsage = process.memoryUsage();
    const usedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    expect(usedMB).toBeLessThan(expectedMaxMB);
    
    unmount();
  },
};

// Visual regression testing utilities
export const visualUtils = {
  /**
   * Take component snapshot
   */
  takeSnapshot: (component: React.ReactElement, theme: ThemeMode = "light") => {
    const { container } = renderWithTheme(component, { theme });
    expect(container.firstChild).toMatchSnapshot();
  },
  
  /**
   * Test responsive behavior
   */
  testResponsive: (component: React.ReactElement, breakpoints: number[]) => {
    breakpoints.forEach(width => {
      // Mock window resize
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: width,
      });
      
      window.dispatchEvent(new Event("resize"));
      
      const { container } = render(component);
      expect(container.firstChild).toMatchSnapshot(`width-${width}`);
    });
  },
};

// Mock utilities
export const mockUtils = {
  /**
   * Mock theme context
   */
  mockThemeContext: (overrides: Partial<any> = {}) => {
    const defaultContext = {
      theme: "light" as ThemeMode,
      setTheme: jest.fn(),
      systemTheme: "light" as "light" | "dark",
      resolvedTheme: "light" as "light" | "dark",
      toggleTheme: jest.fn(),
      config: { mode: "light" as ThemeMode },
      updateConfig: jest.fn(),
    };
    
    return { ...defaultContext, ...overrides };
  },
  
  /**
   * Mock intersection observer
   */
  mockIntersectionObserver: () => {
    const mockIntersectionObserver = jest.fn();
    mockIntersectionObserver.mockReturnValue({
      observe: () => null,
      unobserve: () => null,
      disconnect: () => null,
    });
    
    window.IntersectionObserver = mockIntersectionObserver;
  },
  
  /**
   * Mock resize observer
   */
  mockResizeObserver: () => {
    const mockResizeObserver = jest.fn();
    mockResizeObserver.mockReturnValue({
      observe: () => null,
      unobserve: () => null,
      disconnect: () => null,
    });
    
    window.ResizeObserver = mockResizeObserver;
  },
};

// Export all testing utilities
export const TestingUtils = {
  render: renderWithTheme,
  TestWrapper,
  theme: themeTestUtils,
  interaction: interactionUtils,
  a11y: a11yUtils,
  performance: performanceUtils,
  visual: visualUtils,
  mock: mockUtils,
};
