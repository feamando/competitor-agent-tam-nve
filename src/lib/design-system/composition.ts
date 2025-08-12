/**
 * Component Composition Utilities
 * Helpers and hooks for composing design system components
 * Part of Phase 2: Core Component Library (Task 4.5)
 */

import * as React from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Enhanced cn utility with design system context
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Design system variant utilities
export type ComponentVariant = "default" | "primary" | "secondary" | "destructive" | "ghost" | "outline";
export type ComponentSize = "sm" | "md" | "lg";
export type ComponentStatus = "default" | "success" | "warning" | "error" | "info";

// Variant class mapping utilities
export const variantClasses = {
  button: {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    primary: "bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  },
  badge: {
    default: "bg-secondary text-secondary-foreground",
    primary: "bg-brand-primary text-brand-primary-foreground",
    secondary: "bg-surface-muted text-surface-muted-foreground",
    destructive: "bg-feedback-error text-feedback-error-foreground",
    success: "bg-feedback-success text-feedback-success-foreground",
    warning: "bg-feedback-warning text-feedback-warning-foreground",
    info: "bg-feedback-info text-feedback-info-foreground",
  },
  alert: {
    default: "border-surface-border text-surface-text-primary",
    success: "border-feedback-success text-feedback-success bg-feedback-success/10",
    warning: "border-feedback-warning text-feedback-warning bg-feedback-warning/10",
    error: "border-feedback-error text-feedback-error bg-feedback-error/10",
    info: "border-feedback-info text-feedback-info bg-feedback-info/10",
  }
};

export const sizeClasses = {
  button: {
    sm: "h-8 px-3 text-sm",
    md: "h-9 px-4 py-2",
    lg: "h-10 px-6",
  },
  input: {
    sm: "h-8 px-3 text-sm",
    md: "h-9 px-3",
    lg: "h-10 px-3 text-lg",
  },
  badge: {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-0.5",
    lg: "text-sm px-3 py-1",
  }
};

// Hook for managing component state
export function useComponentState<T>(initialState: T) {
  const [state, setState] = React.useState<T>(initialState);
  
  const updateState = React.useCallback((updates: Partial<T>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  const resetState = React.useCallback(() => {
    setState(initialState);
  }, [initialState]);
  
  return { state, setState, updateState, resetState };
}

// Hook for managing loading states
export function useLoadingState(initialLoading = false) {
  const [loading, setLoading] = React.useState(initialLoading);
  const [error, setError] = React.useState<string | null>(null);
  
  const withLoading = React.useCallback(async <T>(
    asyncFn: () => Promise<T>
  ): Promise<T | null> => {
    try {
      setLoading(true);
      setError(null);
      const result = await asyncFn();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  
  const clearError = React.useCallback(() => {
    setError(null);
  }, []);
  
  return { loading, error, withLoading, clearError, setLoading };
}

// Hook for managing async operations with retries
export function useAsyncOperation<T>() {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);
  
  const execute = React.useCallback(async (
    operation: () => Promise<T>,
    options?: {
      maxRetries?: number;
      retryDelay?: number;
      onSuccess?: (data: T) => void;
      onError?: (error: string) => void;
    }
  ) => {
    const { maxRetries = 3, retryDelay = 1000, onSuccess, onError } = options || {};
    
    setLoading(true);
    setError(null);
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        setData(result);
        setRetryCount(0);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Operation failed";
        
        if (attempt === maxRetries) {
          setError(errorMessage);
          setRetryCount(attempt + 1);
          onError?.(errorMessage);
          break;
        }
        
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    setLoading(false);
    return null;
  }, []);
  
  const retry = React.useCallback((
    operation: () => Promise<T>,
    options?: Parameters<typeof execute>[1]
  ) => {
    return execute(operation, options);
  }, [execute]);
  
  const reset = React.useCallback(() => {
    setData(null);
    setError(null);
    setRetryCount(0);
    setLoading(false);
  }, []);
  
  return {
    data,
    loading,
    error,
    retryCount,
    execute,
    retry,
    reset,
  };
}

// Hook for managing form validation
export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: Record<keyof T, (value: any) => string | null>
) {
  const [values, setValues] = React.useState<T>(initialValues);
  const [errors, setErrors] = React.useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = React.useState<Partial<Record<keyof T, boolean>>>({});
  
  const setValue = React.useCallback((field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);
  
  const setTouched = React.useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);
  
  const validate = React.useCallback((field?: keyof T) => {
    const fieldsToValidate = field ? [field] : Object.keys(validationRules) as (keyof T)[];
    const newErrors: Partial<Record<keyof T, string>> = {};
    
    fieldsToValidate.forEach(fieldName => {
      const rule = validationRules[fieldName];
      if (rule) {
        const error = rule(values[fieldName]);
        if (error) {
          newErrors[fieldName] = error;
        }
      }
    });
    
    if (field) {
      setErrors(prev => ({ ...prev, ...newErrors }));
    } else {
      setErrors(newErrors);
    }
    
    return Object.keys(newErrors).length === 0;
  }, [values, validationRules]);
  
  const reset = React.useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);
  
  const isValid = Object.keys(errors).length === 0;
  
  return {
    values,
    errors,
    touched,
    isValid,
    setValue,
    setTouched,
    validate,
    reset,
  };
}

// HOC for adding loading state to components
export function withLoadingState<P extends object>(
  Component: React.ComponentType<P>
) {
  return React.forwardRef<any, P & { loading?: boolean }>((props, ref) => {
    const { loading, ...rest } = props;
    
    if (loading) {
      return (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
        </div>
      );
    }
    
    return <Component ref={ref} {...(rest as P)} />;
  });
}

// HOC for adding error boundary to components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>
) {
  return class extends React.Component<P, { hasError: boolean; error: Error | null }> {
    constructor(props: P) {
      super(props);
      this.state = { hasError: false, error: null };
    }
    
    static getDerivedStateFromError(error: Error) {
      return { hasError: true, error };
    }
    
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      console.error("Component error:", error, errorInfo);
    }
    
    retry = () => {
      this.setState({ hasError: false, error: null });
    };
    
    render() {
      if (this.state.hasError && this.state.error) {
        if (fallback) {
          const Fallback = fallback;
          return <Fallback error={this.state.error} retry={this.retry} />;
        }
        
        return (
          <div className="p-4 border border-feedback-error bg-feedback-error/10 rounded-md">
            <h3 className="text-feedback-error font-medium mb-2">Something went wrong</h3>
            <p className="text-sm text-feedback-error/80 mb-3">
              {this.state.error.message}
            </p>
            <button
              onClick={this.retry}
              className="text-sm text-feedback-error hover:text-feedback-error/80 underline"
            >
              Try again
            </button>
          </div>
        );
      }
      
      return <Component {...this.props} />;
    }
  };
}

// Utility for creating compound components
export function createCompoundComponent<T extends Record<string, React.ComponentType<any>>>(
  components: T
): T & { displayName: string } {
  const compound = components as T & { displayName: string };
  compound.displayName = "CompoundComponent";
  return compound;
}

// Export all composition utilities
export const CompositionUtils = {
  cn,
  variantClasses,
  sizeClasses,
  useComponentState,
  useLoadingState,
  useAsyncOperation,
  useFormValidation,
  withLoadingState,
  withErrorBoundary,
  createCompoundComponent,
};
