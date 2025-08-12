/**
 * Theme System Implementation
 * Theme provider, context, and utilities for managing light/dark themes
 * Part of Phase 3: Design System Architecture (Tasks 6.1, 6.2)
 */

"use client";

import * as React from "react";
import { type ThemeMode, type ThemeConfig, type ThemeContextValue } from "@/types/design-system";

// Theme storage keys
const THEME_STORAGE_KEY = "competitor-research-agent-theme";
const THEME_CONFIG_STORAGE_KEY = "competitor-research-agent-theme-config";

// Default theme configuration
const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: "system",
  primaryColor: undefined,
  accentColor: undefined,
  customTokens: {},
};

// Theme context
const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

// System theme detection hook
function useSystemTheme(): "light" | "dark" {
  const [systemTheme, setSystemTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    // Check initial system preference
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");

    // Listen for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return systemTheme;
}

// Theme storage hooks
function useThemeStorage() {
  const getStoredTheme = React.useCallback((): ThemeMode => {
    if (typeof window === "undefined") return "system";
    
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && ["light", "dark", "system"].includes(stored)) {
        return stored as ThemeMode;
      }
    } catch (error) {
      console.warn("Failed to read theme from localStorage:", error);
    }
    
    return "system";
  }, []);

  const setStoredTheme = React.useCallback((theme: ThemeMode) => {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.warn("Failed to save theme to localStorage:", error);
    }
  }, []);

  const getStoredConfig = React.useCallback((): ThemeConfig => {
    if (typeof window === "undefined") return DEFAULT_THEME_CONFIG;
    
    try {
      const stored = localStorage.getItem(THEME_CONFIG_STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        return { ...DEFAULT_THEME_CONFIG, ...config };
      }
    } catch (error) {
      console.warn("Failed to read theme config from localStorage:", error);
    }
    
    return DEFAULT_THEME_CONFIG;
  }, []);

  const setStoredConfig = React.useCallback((config: ThemeConfig) => {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.setItem(THEME_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.warn("Failed to save theme config to localStorage:", error);
    }
  }, []);

  return {
    getStoredTheme,
    setStoredTheme,
    getStoredConfig,
    setStoredConfig,
  };
}

// Theme application utilities
function applyThemeToDOM(resolvedTheme: "light" | "dark", config: ThemeConfig) {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  
  // Apply theme class
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  
  // Apply custom tokens if provided
  if (config.customTokens) {
    Object.entries(config.customTokens).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }
  
  // Apply primary color override
  if (config.primaryColor) {
    root.style.setProperty("--brand-primary", config.primaryColor);
  }
  
  // Apply accent color override
  if (config.accentColor) {
    root.style.setProperty("--brand-accent", config.accentColor);
  }
  
  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    const backgroundColor = resolvedTheme === "dark" 
      ? "hsl(var(--surface-background-dark))" 
      : "hsl(var(--surface-background))";
    metaThemeColor.setAttribute("content", backgroundColor);
  }
}

// Theme provider component
export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  defaultConfig?: Partial<ThemeConfig>;
  storageKey?: string;
  enableSystem?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  defaultConfig = {},
  enableSystem = true,
}: ThemeProviderProps) {
  const systemTheme = useSystemTheme();
  const { getStoredTheme, setStoredTheme, getStoredConfig, setStoredConfig } = useThemeStorage();
  
  // Initialize theme state
  const [theme, setThemeState] = React.useState<ThemeMode>(() => {
    return getStoredTheme() || defaultTheme;
  });
  
  // Initialize config state
  const [config, setConfigState] = React.useState<ThemeConfig>(() => {
    const storedConfig = getStoredConfig();
    return { ...storedConfig, ...defaultConfig };
  });
  
  // Calculate resolved theme
  const resolvedTheme: "light" | "dark" = React.useMemo(() => {
    if (theme === "system") {
      return enableSystem ? systemTheme : "light";
    }
    return theme;
  }, [theme, systemTheme, enableSystem]);
  
  // Apply theme changes to DOM
  React.useEffect(() => {
    applyThemeToDOM(resolvedTheme, config);
  }, [resolvedTheme, config]);
  
  // Theme management functions
  const setTheme = React.useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
  }, [setStoredTheme]);
  
  const toggleTheme = React.useCallback(() => {
    if (theme === "system") {
      setTheme(systemTheme === "dark" ? "light" : "dark");
    } else {
      setTheme(theme === "light" ? "dark" : "light");
    }
  }, [theme, systemTheme, setTheme]);
  
  const updateConfig = React.useCallback((newConfig: Partial<ThemeConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfigState(updatedConfig);
    setStoredConfig(updatedConfig);
  }, [config, setStoredConfig]);
  
  // Context value
  const contextValue: ThemeContextValue = React.useMemo(() => ({
    theme,
    setTheme,
    systemTheme,
    resolvedTheme,
    toggleTheme,
    config,
    updateConfig,
  }), [theme, setTheme, systemTheme, resolvedTheme, toggleTheme, config, updateConfig]);
  
  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// Theme hook
export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  
  return context;
}

// Theme utilities
export const themeUtils = {
  /**
   * Get CSS custom property value for the current theme
   */
  getCSSVariable: (property: string): string => {
    if (typeof window === "undefined") return "";
    
    return getComputedStyle(document.documentElement)
      .getPropertyValue(`--${property.replace(/^--/, "")}`)
      .trim();
  },
  
  /**
   * Set CSS custom property dynamically
   */
  setCSSVariable: (property: string, value: string): void => {
    if (typeof window === "undefined") return;
    
    document.documentElement.style.setProperty(
      `--${property.replace(/^--/, "")}`, 
      value
    );
  },
  
  /**
   * Check if the current theme is dark
   */
  isDark: (): boolean => {
    if (typeof window === "undefined") return false;
    
    return document.documentElement.classList.contains("dark");
  },
  
  /**
   * Check if the current theme is light
   */
  isLight: (): boolean => {
    if (typeof window === "undefined") return true;
    
    return document.documentElement.classList.contains("light");
  },
  
  /**
   * Get theme-aware color value
   */
  getThemeColor: (colorToken: string): string => {
    const isDark = themeUtils.isDark();
    const suffix = isDark ? "-dark" : "";
    return themeUtils.getCSSVariable(`${colorToken}${suffix}`);
  },
  
  /**
   * Create theme-aware CSS classes
   */
  createThemeClasses: (baseClass: string, variants: Record<string, string>) => {
    return Object.entries(variants).reduce((acc, [key, value]) => {
      acc[key] = `${baseClass} ${value}`;
      return acc;
    }, {} as Record<string, string>);
  },
  
  /**
   * Apply temporary theme for testing
   */
  applyTemporaryTheme: (theme: "light" | "dark", duration = 1000): void => {
    if (typeof window === "undefined") return;
    
    const root = document.documentElement;
    const originalClass = root.classList.contains("dark") ? "dark" : "light";
    
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    
    setTimeout(() => {
      root.classList.remove("light", "dark");
      root.classList.add(originalClass);
    }, duration);
  },
};

// Theme-aware component helpers
export function withTheme<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P & { theme?: ThemeContextValue }> {
  return React.forwardRef<any, P & { theme?: ThemeContextValue }>((props, ref) => {
    const theme = useTheme();
    return <Component ref={ref} {...props} theme={theme} />;
  });
}

// Theme transition component
export interface ThemeTransitionProps {
  children: React.ReactNode;
  duration?: number;
  easing?: string;
}

export function ThemeTransition({ 
  children, 
  duration = 200, 
  easing = "ease-in-out" 
}: ThemeTransitionProps) {
  const { resolvedTheme } = useTheme();
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const previousTheme = React.useRef(resolvedTheme);
  
  React.useEffect(() => {
    if (previousTheme.current !== resolvedTheme) {
      setIsTransitioning(true);
      
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        previousTheme.current = resolvedTheme;
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [resolvedTheme, duration]);
  
  return (
    <div
      style={{
        transition: isTransitioning 
          ? `background-color ${duration}ms ${easing}, color ${duration}ms ${easing}` 
          : undefined,
      }}
    >
      {children}
    </div>
  );
}

// Export all theme utilities
export const Theme = {
  Provider: ThemeProvider,
  useTheme,
  utils: themeUtils,
  withTheme,
  Transition: ThemeTransition,
};
