/**
 * Layout Components
 * Consistent page layout utilities and containers
 * Part of Phase 2: Core Component Library (Task 3.4)
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// Container component for consistent page width and padding
interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl" | "full";
  centered?: boolean;
}

export function Container({ 
  className, 
  size = "lg", 
  centered = true, 
  children, 
  ...props 
}: ContainerProps) {
  return (
    <div
      className={cn(
        "w-full px-4 sm:px-6 lg:px-8",
        {
          "max-w-sm": size === "sm",
          "max-w-2xl": size === "md", 
          "max-w-4xl": size === "lg",
          "max-w-6xl": size === "xl",
          "max-w-full": size === "full",
        },
        centered && "mx-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Page header component
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ 
  title, 
  description, 
  action, 
  className 
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4 pb-6", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-surface-text-primary">
            {title}
          </h1>
          {description && (
            <p className="text-surface-text-secondary">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex items-center space-x-2">
            {action}
          </div>
        )}
      </div>
      <Separator />
    </div>
  );
}

// Section component for content grouping
interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
  spacing?: "sm" | "md" | "lg";
}

export function Section({ 
  title, 
  description, 
  headerAction,
  spacing = "md",
  className, 
  children, 
  ...props 
}: SectionProps) {
  const spacingClasses = {
    sm: "space-y-4",
    md: "space-y-6", 
    lg: "space-y-8"
  };

  return (
    <section className={cn(spacingClasses[spacing], className)} {...props}>
      {(title || description || headerAction) && (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {title && (
              <h2 className="text-xl font-semibold text-surface-text-primary">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-surface-text-secondary">
                {description}
              </p>
            )}
          </div>
          {headerAction && (
            <div className="flex items-center space-x-2">
              {headerAction}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

// Grid layout component
interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: "sm" | "md" | "lg";
  responsive?: boolean;
}

export function Grid({ 
  cols = 1, 
  gap = "md", 
  responsive = true, 
  className, 
  children, 
  ...props 
}: GridProps) {
  const gapClasses = {
    sm: "gap-4",
    md: "gap-6",
    lg: "gap-8"
  };

  const colClasses = responsive ? {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    6: "grid-cols-1 md:grid-cols-3 lg:grid-cols-6",
    12: "grid-cols-1 md:grid-cols-6 lg:grid-cols-12"
  } : {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    6: "grid-cols-6",
    12: "grid-cols-12"
  };

  return (
    <div
      className={cn(
        "grid",
        gapClasses[gap],
        colClasses[cols],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Stack layout component for vertical spacing
interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "stretch";
}

export function Stack({ 
  spacing = "md", 
  align = "stretch", 
  className, 
  children, 
  ...props 
}: StackProps) {
  const spacingClasses = {
    sm: "space-y-2",
    md: "space-y-4",
    lg: "space-y-6",
    xl: "space-y-8"
  };

  const alignClasses = {
    start: "items-start",
    center: "items-center", 
    end: "items-end",
    stretch: "items-stretch"
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        spacingClasses[spacing],
        alignClasses[align],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Enhanced card component with consistent styling
interface StatusCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  status?: "default" | "success" | "warning" | "error" | "info";
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export function StatusCard({ 
  title, 
  description, 
  status = "default", 
  action, 
  className, 
  children, 
  ...props 
}: StatusCardProps) {
  const statusClasses = {
    default: "border-surface-border",
    success: "border-feedback-success bg-feedback-success/5",
    warning: "border-feedback-warning bg-feedback-warning/5", 
    error: "border-feedback-error bg-feedback-error/5",
    info: "border-feedback-info bg-feedback-info/5"
  };

  const statusDotClasses = {
    default: "bg-surface-text-secondary",
    success: "bg-feedback-success",
    warning: "bg-feedback-warning",
    error: "bg-feedback-error", 
    info: "bg-feedback-info"
  };

  return (
    <Card className={cn(statusClasses[status], className)} {...props}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={cn("w-2 h-2 rounded-full", statusDotClasses[status])} />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {action}
        </div>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      {children && (
        <CardContent className="pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// Responsive flex component
interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "col";
  wrap?: boolean;
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  gap?: "sm" | "md" | "lg";
}

export function Flex({ 
  direction = "row", 
  wrap = false,
  justify = "start",
  align = "start",
  gap = "md",
  className, 
  children, 
  ...props 
}: FlexProps) {
  const directionClasses = {
    row: "flex-row",
    col: "flex-col"
  };

  const justifyClasses = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    between: "justify-between",
    around: "justify-around",
    evenly: "justify-evenly"
  };

  const alignClasses = {
    start: "items-start",
    center: "items-center",
    end: "items-end", 
    stretch: "items-stretch",
    baseline: "items-baseline"
  };

  const gapClasses = {
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6"
  };

  return (
    <div
      className={cn(
        "flex",
        directionClasses[direction],
        wrap && "flex-wrap",
        justifyClasses[justify],
        alignClasses[align],
        gapClasses[gap],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Export all components
export const Layout = {
  Container,
  PageHeader,
  Section,
  Grid,
  Stack,
  StatusCard,
  Flex,
};
