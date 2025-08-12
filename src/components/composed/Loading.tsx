/**
 * Loading Components
 * Enhanced loading states, skeletons, and progress indicators
 * Part of Phase 2: Core Component Library (Task 4.3)
 */

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Loading Spinner Component
interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  };

  return (
    <Loader2 
      className={cn("animate-spin", sizeClasses[size], className)} 
    />
  );
}

// Page Loading Component
interface PageLoadingProps {
  message?: string;
  className?: string;
}

export function PageLoading({ 
  message = "Loading...", 
  className 
}: PageLoadingProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      <LoadingSpinner size="lg" className="mb-4" />
      <p className="text-surface-text-secondary">{message}</p>
    </div>
  );
}

// Card Skeleton for loading cards
interface CardSkeletonProps {
  showAvatar?: boolean;
  lines?: number;
  className?: string;
}

export function CardSkeleton({ 
  showAvatar = false, 
  lines = 3, 
  className 
}: CardSkeletonProps) {
  return (
    <div className={cn("p-6 space-y-3", className)}>
      {showAvatar && (
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        {Array.from({ length: lines - 1 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "h-4",
              i === lines - 2 ? "w-3/4" : "w-full"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// Table Skeleton for loading tables
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

export function TableSkeleton({ 
  rows = 5, 
  columns = 4, 
  showHeader = true, 
  className 
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {showHeader && (
        <div className="flex space-x-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`header-${i}`} className="h-4 flex-1" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              className={cn(
                "h-4 flex-1",
                colIndex === 0 && "w-16 flex-none" // First column typically narrower
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// List Skeleton for loading lists
interface ListSkeletonProps {
  items?: number;
  showAvatar?: boolean;
  showActions?: boolean;
  className?: string;
}

export function ListSkeleton({ 
  items = 5, 
  showAvatar = false, 
  showActions = false, 
  className 
}: ListSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-3">
          {showAvatar && (
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
          )}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {showActions && (
            <div className="flex space-x-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Progress with Label
interface LabeledProgressProps {
  value: number;
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LabeledProgress({
  value,
  label,
  showPercentage = true,
  size = "md",
  className,
}: LabeledProgressProps) {
  const sizeClasses = {
    sm: "h-2",
    md: "h-3", 
    lg: "h-4"
  };

  return (
    <div className={cn("space-y-2", className)}>
      {(label || showPercentage) && (
        <div className="flex justify-between text-sm">
          {label && (
            <span className="text-surface-text-primary">{label}</span>
          )}
          {showPercentage && (
            <span className="text-surface-text-secondary">
              {Math.round(value)}%
            </span>
          )}
        </div>
      )}
      <Progress value={value} className={sizeClasses[size]} />
    </div>
  );
}

// Loading State Wrapper
interface LoadingStateProps {
  loading: boolean;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function LoadingState({
  loading,
  skeleton,
  children,
  className,
}: LoadingStateProps) {
  if (loading) {
    return (
      <div className={className}>
        {skeleton || <PageLoading />}
      </div>
    );
  }

  return <>{children}</>;
}

// Loading Overlay
interface LoadingOverlayProps {
  loading: boolean;
  message?: string;
  children: React.ReactNode;
  className?: string;
}

export function LoadingOverlay({
  loading,
  message = "Loading...",
  children,
  className,
}: LoadingOverlayProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {loading && (
        <div className="absolute inset-0 bg-surface-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center space-y-3">
            <LoadingSpinner size="lg" />
            <p className="text-surface-text-secondary">{message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-step Progress
interface MultiStepProgressProps {
  steps: Array<{
    label: string;
    status: "pending" | "current" | "completed" | "error";
  }>;
  className?: string;
}

export function MultiStepProgress({ steps, className }: MultiStepProgressProps) {
  const completedSteps = steps.filter(step => step.status === "completed").length;
  const progress = (completedSteps / steps.length) * 100;

  return (
    <div className={cn("space-y-4", className)}>
      <LabeledProgress
        value={progress}
        label="Progress"
        showPercentage={true}
      />
      <div className="space-y-2">
        {steps.map((step, index) => {
          const statusConfig = {
            pending: {
              icon: "○",
              textClass: "text-surface-text-disabled",
              iconClass: "text-surface-text-disabled"
            },
            current: {
              icon: "●",
              textClass: "text-surface-text-primary font-medium",
              iconClass: "text-brand-primary"
            },
            completed: {
              icon: "✓",
              textClass: "text-surface-text-secondary",
              iconClass: "text-feedback-success"
            },
            error: {
              icon: "✗",
              textClass: "text-feedback-error",
              iconClass: "text-feedback-error"
            }
          };

          const config = statusConfig[step.status];

          return (
            <div key={index} className="flex items-center space-x-3">
              <span className={cn("text-sm font-mono", config.iconClass)}>
                {config.icon}
              </span>
              <span className={cn("text-sm", config.textClass)}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Export all loading components
export const Loading = {
  Spinner: LoadingSpinner,
  Page: PageLoading,
  Card: CardSkeleton,
  Table: TableSkeleton,
  List: ListSkeleton,
  Progress: LabeledProgress,
  State: LoadingState,
  Overlay: LoadingOverlay,
  MultiStep: MultiStepProgress,
};
