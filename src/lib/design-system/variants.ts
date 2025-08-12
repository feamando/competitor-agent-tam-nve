/**
 * Component Variant System
 * Advanced styling utilities and variant management
 * Part of Phase 3: Design System Architecture (Task 6.4)
 */

import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";
import { type ComponentVariant, type ComponentSize, type ComponentStatus } from "@/types/design-system";

// Enhanced cn utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Base variant configurations
export const baseVariants = {
  // Button variants
  button: cva(
    [
      "inline-flex items-center justify-center gap-2 whitespace-nowrap",
      "rounded-md text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    ],
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
          destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
          outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
          secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
          ghost: "hover:bg-accent hover:text-accent-foreground",
          link: "text-primary underline-offset-4 hover:underline",
        },
        size: {
          default: "h-9 px-4 py-2",
          sm: "h-8 rounded-md px-3 text-xs",
          lg: "h-10 rounded-md px-8",
          icon: "h-9 w-9",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    }
  ),

  // Badge variants
  badge: cva(
    "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
      variants: {
        variant: {
          default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
          secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
          destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
          outline: "text-foreground",
          success: "border-transparent bg-green-500 text-white shadow hover:bg-green-500/80",
          warning: "border-transparent bg-yellow-500 text-white shadow hover:bg-yellow-500/80",
          info: "border-transparent bg-blue-500 text-white shadow hover:bg-blue-500/80",
        },
        size: {
          default: "px-2.5 py-0.5 text-xs",
          sm: "px-2 py-0 text-xs",
          lg: "px-3 py-1 text-sm",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    }
  ),

  // Alert variants
  alert: cva(
    "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
    {
      variants: {
        variant: {
          default: "bg-background text-foreground",
          destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
          success: "border-green-500/50 text-green-700 dark:border-green-500 dark:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400",
          warning: "border-yellow-500/50 text-yellow-700 dark:border-yellow-500 dark:text-yellow-400 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400",
          info: "border-blue-500/50 text-blue-700 dark:border-blue-500 dark:text-blue-400 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400",
        },
      },
      defaultVariants: {
        variant: "default",
      },
    }
  ),

  // Input variants
  input: cva(
    [
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
      "text-base shadow-sm transition-colors",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
      "placeholder:text-muted-foreground",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "md:text-sm",
    ],
    {
      variants: {
        variant: {
          default: "border-input",
          error: "border-destructive focus-visible:ring-destructive",
          success: "border-green-500 focus-visible:ring-green-500",
          warning: "border-yellow-500 focus-visible:ring-yellow-500",
        },
        size: {
          default: "h-9 px-3 py-1",
          sm: "h-8 px-2 py-1 text-xs",
          lg: "h-10 px-4 py-2",
        },
      },
      defaultVariants: {
        variant: "default",
        size: "default",
      },
    }
  ),

  // Card variants
  card: cva(
    "rounded-xl border bg-card text-card-foreground shadow",
    {
      variants: {
        variant: {
          default: "border-border",
          elevated: "shadow-lg",
          flat: "shadow-none",
          outlined: "border-2",
        },
        padding: {
          none: "p-0",
          sm: "p-4",
          default: "p-6",
          lg: "p-8",
        },
      },
      defaultVariants: {
        variant: "default",
        padding: "default",
      },
    }
  ),
};

// Theme-aware variant system
export class VariantManager {
  private variants: Map<string, any> = new Map();
  private themeOverrides: Map<string, Record<string, any>> = new Map();

  constructor() {
    // Register base variants
    Object.entries(baseVariants).forEach(([key, variant]) => {
      this.variants.set(key, variant);
    });
  }

  /**
   * Register a new variant
   */
  register<T>(name: string, variant: T): void {
    this.variants.set(name, variant);
  }

  /**
   * Get a variant by name
   */
  get<T>(name: string): T | undefined {
    return this.variants.get(name);
  }

  /**
   * Add theme-specific overrides
   */
  addThemeOverride(componentName: string, theme: "light" | "dark", overrides: Record<string, any>): void {
    const key = `${componentName}-${theme}`;
    this.themeOverrides.set(key, overrides);
  }

  /**
   * Apply theme-aware variant
   */
  applyVariant(componentName: string, props: any, theme: "light" | "dark"): string {
    const baseVariant = this.variants.get(componentName);
    if (!baseVariant) return "";

    const themeOverrides = this.themeOverrides.get(`${componentName}-${theme}`);
    
    if (themeOverrides) {
      // Apply theme-specific overrides
      const mergedProps = { ...props };
      Object.entries(themeOverrides).forEach(([key, value]) => {
        if (props[key] && typeof value === "object") {
          mergedProps[key] = { ...props[key], ...value };
        }
      });
      
      return baseVariant(mergedProps);
    }

    return baseVariant(props);
  }
}

// Global variant manager instance
export const variantManager = new VariantManager();

// Variant creation utilities
export function createVariant<T>(
  base: string | string[],
  variants: Record<string, Record<string, string | string[]>>,
  defaultVariants?: Record<string, string>
) {
  return cva(base, {
    variants,
    defaultVariants,
  });
}

// Theme-responsive variant utility
export function createThemeVariant<T extends Record<string, any>>(
  baseClasses: string | string[],
  lightVariants: T,
  darkVariants: T,
  defaultVariants?: Partial<T>
) {
  const combinedVariants = Object.keys(lightVariants).reduce((acc, key) => {
    acc[key] = {
      ...lightVariants[key],
      ...Object.entries(darkVariants[key] || {}).reduce((darkAcc, [variant, classes]) => {
        darkAcc[variant] = `${lightVariants[key][variant]} dark:${classes}`;
        return darkAcc;
      }, {} as Record<string, string>),
    };
    return acc;
  }, {} as Record<string, any>);

  return cva(baseClasses, {
    variants: combinedVariants,
    defaultVariants,
  });
}

// Compound variant utilities
export function createCompoundVariant<T>(
  variants: Record<string, any>,
  compoundVariants: Array<{
    conditions: Partial<T>;
    class: string | string[];
  }>
) {
  return (props: T): string => {
    let baseClasses = "";
    
    // Apply base variants
    Object.entries(variants).forEach(([key, variantMap]) => {
      const value = props[key as keyof T];
      if (value && variantMap[value]) {
        baseClasses = cn(baseClasses, variantMap[value]);
      }
    });

    // Apply compound variants
    compoundVariants.forEach(({ conditions, class: compoundClass }) => {
      const matches = Object.entries(conditions).every(([key, value]) => {
        return props[key as keyof T] === value;
      });
      
      if (matches) {
        baseClasses = cn(baseClasses, compoundClass);
      }
    });

    return baseClasses;
  };
}

// Animation variant utilities
export const animationVariants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },
  
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  
  bounce: {
    initial: { opacity: 0, scale: 0.3 },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        damping: 25,
        stiffness: 500,
      },
    },
    exit: { opacity: 0, scale: 0.3 },
  },
};

// Responsive variant utilities
export function createResponsiveVariant(
  breakpoints: Record<string, string>,
  variants: Record<string, string>
) {
  return Object.entries(variants).reduce((acc, [key, value]) => {
    acc[key] = Object.entries(breakpoints).reduce((responsiveAcc, [breakpoint, prefix]) => {
      return `${responsiveAcc} ${prefix}:${value}`;
    }, value);
    return acc;
  }, {} as Record<string, string>);
}

// State variant utilities
export const stateVariants = {
  loading: "opacity-50 cursor-wait",
  disabled: "opacity-50 cursor-not-allowed pointer-events-none",
  error: "border-destructive text-destructive",
  success: "border-green-500 text-green-700",
  warning: "border-yellow-500 text-yellow-700",
  info: "border-blue-500 text-blue-700",
};

// Component composition utilities
export function createComponentWithVariants<
  P extends object,
  V extends Record<string, any>
>(
  Component: React.ComponentType<P>,
  variantConfig: V,
  defaultProps?: Partial<P>
) {
  const ComponentWithVariants = React.forwardRef<any, P & VariantProps<V>>(
    ({ className, ...props }, ref) => {
      const variantClasses = variantConfig(props);
      const mergedProps = { ...defaultProps, ...props };
      
      return (
        <Component
          ref={ref}
          {...mergedProps}
          className={cn(variantClasses, className)}
        />
      );
    }
  );
  
  ComponentWithVariants.displayName = `${Component.displayName || Component.name}WithVariants`;
  
  return ComponentWithVariants;
}

// Export all variant utilities
export const VariantUtils = {
  cn,
  cva,
  createVariant,
  createThemeVariant,
  createCompoundVariant,
  createResponsiveVariant,
  createComponentWithVariants,
  variantManager,
  baseVariants,
  animationVariants,
  stateVariants,
};
