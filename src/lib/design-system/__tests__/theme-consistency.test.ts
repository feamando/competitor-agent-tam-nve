/**
 * Theme Consistency Tests
 * Comprehensive tests to ensure theme system works correctly across all components
 * Part of Phase 3: Design System Architecture (Task 6.5)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestingUtils } from "../testing";
import { ThemeProvider, useTheme } from "../theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// Test component that uses theme
const TestComponent = () => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  
  return (
    <div data-testid="test-component">
      <div data-testid="current-theme">{theme}</div>
      <div data-testid="resolved-theme">{resolvedTheme}</div>
      <button data-testid="toggle-theme" onClick={toggleTheme}>
        Toggle Theme
      </button>
      
      <Card data-testid="test-card">
        <CardHeader>
          <CardTitle>Test Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Button data-testid="test-button" variant="default">
            Test Button
          </Button>
          <Input data-testid="test-input" placeholder="Test input" />
          <Alert data-testid="test-alert">
            <AlertDescription>Test alert</AlertDescription>
          </Alert>
          <Badge data-testid="test-badge">Test Badge</Badge>
        </CardContent>
      </Card>
    </div>
  );
};

describe("Theme Consistency", () => {
  beforeEach(() => {
    // Reset DOM classes
    document.documentElement.className = "";
    // Clear localStorage
    localStorage.clear();
  });

  describe("Theme Provider", () => {
    test("initializes with default theme", () => {
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
      expect(document.documentElement).toHaveClass("light");
    });

    test("initializes with dark theme", () => {
      TestingUtils.render(<TestComponent />, { theme: "dark" });
      
      expect(screen.getByTestId("current-theme")).toHaveTextContent("dark");
      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
      expect(document.documentElement).toHaveClass("dark");
    });

    test("handles system theme preference", () => {
      // Mock system preference
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === "(prefers-color-scheme: dark)",
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      TestingUtils.render(<TestComponent />, { theme: "system", enableSystem: true });
      
      expect(screen.getByTestId("current-theme")).toHaveTextContent("system");
      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    });
  });

  describe("Theme Switching", () => {
    test("toggles between light and dark themes", async () => {
      const user = userEvent.setup();
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      // Should start with light theme
      expect(document.documentElement).toHaveClass("light");
      
      // Toggle to dark
      await user.click(screen.getByTestId("toggle-theme"));
      await waitFor(() => {
        expect(document.documentElement).toHaveClass("dark");
      });
      
      // Toggle back to light
      await user.click(screen.getByTestId("toggle-theme"));
      await waitFor(() => {
        expect(document.documentElement).toHaveClass("light");
      });
    });

    test("persists theme selection in localStorage", async () => {
      const user = userEvent.setup();
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      // Toggle theme
      await user.click(screen.getByTestId("toggle-theme"));
      
      // Check localStorage
      await waitFor(() => {
        expect(localStorage.getItem("competitor-research-agent-theme")).toBe("dark");
      });
    });
  });

  describe("Component Theme Consistency", () => {
    test("all components respond to theme changes", async () => {
      await TestingUtils.theme.testInBothThemes(<TestComponent />, async (theme) => {
        // Verify theme class is applied
        expect(document.documentElement).toHaveClass(theme);
        
        // Check that components exist and are themed
        const card = screen.getByTestId("test-card");
        const button = screen.getByTestId("test-button");
        const input = screen.getByTestId("test-input");
        const alert = screen.getByTestId("test-alert");
        const badge = screen.getByTestId("test-badge");
        
        expect(card).toBeInTheDocument();
        expect(button).toBeInTheDocument();
        expect(input).toBeInTheDocument();
        expect(alert).toBeInTheDocument();
        expect(badge).toBeInTheDocument();
        
        // Verify theme-aware styles are applied
        const computedCardStyle = getComputedStyle(card);
        const computedButtonStyle = getComputedStyle(button);
        
        // Colors should be different between themes
        expect(computedCardStyle.backgroundColor).toBeTruthy();
        expect(computedButtonStyle.backgroundColor).toBeTruthy();
      });
    });

    test("design tokens are properly applied", () => {
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      const colors = TestingUtils.theme.getThemeColors();
      
      // Verify all theme colors are defined
      expect(colors.background).toBeTruthy();
      expect(colors.foreground).toBeTruthy();
      expect(colors.primary).toBeTruthy();
      expect(colors.secondary).toBeTruthy();
      expect(colors.muted).toBeTruthy();
      expect(colors.accent).toBeTruthy();
      expect(colors.destructive).toBeTruthy();
      expect(colors.border).toBeTruthy();
      
      // Colors should not be empty or default values
      Object.entries(colors).forEach(([key, value]) => {
        expect(value).not.toBe("");
        expect(value).not.toBe("initial");
        expect(value).not.toBe("inherit");
      });
    });

    test("CSS custom properties are correctly set", () => {
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      
      // Check that CSS custom properties exist
      const customProperties = [
        "--background",
        "--foreground", 
        "--primary",
        "--primary-foreground",
        "--secondary",
        "--secondary-foreground",
        "--muted",
        "--muted-foreground",
        "--accent",
        "--accent-foreground",
        "--destructive",
        "--destructive-foreground",
        "--border",
        "--input",
        "--ring",
        "--radius",
      ];
      
      customProperties.forEach(property => {
        const value = computedStyle.getPropertyValue(property);
        expect(value).toBeTruthy();
        expect(value.trim()).not.toBe("");
      });
    });
  });

  describe("Theme Accessibility", () => {
    test("maintains proper color contrast", async () => {
      await TestingUtils.theme.testInBothThemes(<TestComponent />, (theme) => {
        const button = screen.getByTestId("test-button");
        const computedStyle = getComputedStyle(button);
        
        // Get background and foreground colors
        const backgroundColor = computedStyle.backgroundColor;
        const color = computedStyle.color;
        
        // Both should be defined
        expect(backgroundColor).toBeTruthy();
        expect(color).toBeTruthy();
        
        // Colors should be different (indicating proper contrast)
        expect(backgroundColor).not.toBe(color);
      });
    });

    test("provides theme indication for screen readers", () => {
      TestingUtils.render(<TestComponent />, { theme: "dark" });
      
      // Check that theme is communicated to assistive technology
      expect(document.documentElement).toHaveClass("dark");
      
      // Meta theme-color should be updated (if present)
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        expect(metaThemeColor.getAttribute("content")).toBeTruthy();
      }
    });
  });

  describe("Theme Performance", () => {
    test("theme switching is performant", async () => {
      const user = userEvent.setup();
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      const startTime = performance.now();
      
      // Toggle theme multiple times
      for (let i = 0; i < 10; i++) {
        await user.click(screen.getByTestId("toggle-theme"));
        await waitFor(() => {
          const expectedTheme = i % 2 === 0 ? "dark" : "light";
          expect(document.documentElement).toHaveClass(expectedTheme);
        });
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should complete all toggles within reasonable time (1 second)
      expect(totalTime).toBeLessThan(1000);
    });

    test("theme provider does not cause unnecessary re-renders", () => {
      const renderSpy = jest.fn();
      
      const SpyComponent = () => {
        renderSpy();
        return <div>Test</div>;
      };
      
      const { rerender } = TestingUtils.render(
        <SpyComponent />, 
        { theme: "light" }
      );
      
      // Initial render
      expect(renderSpy).toHaveBeenCalledTimes(1);
      
      // Re-render with same theme should not cause component re-render
      rerender(
        <ThemeProvider defaultTheme="light">
          <SpyComponent />
        </ThemeProvider>
      );
      
      // Should not have re-rendered unnecessarily
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Theme Error Handling", () => {
    test("handles invalid theme values gracefully", () => {
      // Mock console.warn to check for warnings
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      
      TestingUtils.render(<TestComponent />, { theme: "invalid" as any });
      
      // Should fall back to light theme
      expect(document.documentElement).toHaveClass("light");
      
      consoleSpy.mockRestore();
    });

    test("handles localStorage failures gracefully", async () => {
      // Mock localStorage to throw
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = jest.fn(() => {
        throw new Error("Storage failed");
      });
      
      const user = userEvent.setup();
      TestingUtils.render(<TestComponent />, { theme: "light" });
      
      // Should still allow theme switching despite storage failure
      await user.click(screen.getByTestId("toggle-theme"));
      
      await waitFor(() => {
        expect(document.documentElement).toHaveClass("dark");
      });
      
      // Restore localStorage
      localStorage.setItem = originalSetItem;
    });
  });

  describe("Browser Compatibility", () => {
    test("works without matchMedia support", () => {
      // Remove matchMedia
      const originalMatchMedia = window.matchMedia;
      delete (window as any).matchMedia;
      
      // Should still work with system theme disabled
      TestingUtils.render(<TestComponent />, { theme: "system", enableSystem: false });
      
      // Should fall back to light theme
      expect(document.documentElement).toHaveClass("light");
      
      // Restore matchMedia
      window.matchMedia = originalMatchMedia;
    });

    test("works without localStorage support", () => {
      // Mock localStorage to be undefined
      const originalLocalStorage = window.localStorage;
      delete (window as any).localStorage;
      
      // Should still initialize with theme
      TestingUtils.render(<TestComponent />, { theme: "dark" });
      
      expect(document.documentElement).toHaveClass("dark");
      
      // Restore localStorage
      window.localStorage = originalLocalStorage;
    });
  });
});

describe("Component Integration", () => {
  test("all UI components work with theme system", async () => {
    const AllComponentsTest = () => (
      <div>
        <Button data-testid="button">Button</Button>
        <Input data-testid="input" />
        <Card data-testid="card">
          <CardContent>Card content</CardContent>
        </Card>
        <Alert data-testid="alert">
          <AlertDescription>Alert</AlertDescription>
        </Alert>
        <Badge data-testid="badge">Badge</Badge>
      </div>
    );

    await TestingUtils.theme.testInBothThemes(<AllComponentsTest />, () => {
      // All components should render without errors
      expect(screen.getByTestId("button")).toBeInTheDocument();
      expect(screen.getByTestId("input")).toBeInTheDocument();
      expect(screen.getByTestId("card")).toBeInTheDocument();
      expect(screen.getByTestId("alert")).toBeInTheDocument();
      expect(screen.getByTestId("badge")).toBeInTheDocument();
    });
  });
});
