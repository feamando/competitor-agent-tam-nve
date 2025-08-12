/**
 * Loading Button Component
 * Enhanced shadcn/ui Button with loading state support
 * Part of Phase 2: Core Component Library (Task 3.2)
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Re-export button variants for type safety
import { buttonVariants } from "@/components/ui/button";

interface LoadingButtonProps 
  extends React.ComponentProps<typeof Button>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export function LoadingButton({
  children,
  loading = false,
  loadingText,
  disabled,
  className,
  icon,
  iconPosition = "left",
  ...props
}: LoadingButtonProps) {
  const isDisabled = disabled || loading;
  
  return (
    <Button
      className={cn(className)}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon && iconPosition === "left" && (
            <span className="mr-2">{icon}</span>
          )}
          {children}
          {icon && iconPosition === "right" && (
            <span className="ml-2">{icon}</span>
          )}
        </>
      )}
    </Button>
  );
}

// Convenience exports for common button types
export function PrimaryLoadingButton(props: LoadingButtonProps) {
  return <LoadingButton variant="default" {...props} />;
}

export function SecondaryLoadingButton(props: LoadingButtonProps) {
  return <LoadingButton variant="secondary" {...props} />;
}

export function DestructiveLoadingButton(props: LoadingButtonProps) {
  return <LoadingButton variant="destructive" {...props} />;
}

export function OutlineLoadingButton(props: LoadingButtonProps) {
  return <LoadingButton variant="outline" {...props} />;
}

export function GhostLoadingButton(props: LoadingButtonProps) {
  return <LoadingButton variant="ghost" {...props} />;
}
