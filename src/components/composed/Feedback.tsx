/**
 * Feedback Components
 * Enhanced alert, badge, and notification components
 * Part of Phase 2: Core Component Library (Task 3.6)
 */

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  XCircleIcon, 
  InformationCircleIcon 
} from "@heroicons/react/24/outline";

// Enhanced Alert Component
interface FeedbackAlertProps extends React.ComponentProps<typeof Alert> {
  variant?: "default" | "success" | "warning" | "error" | "info";
  title?: string;
  description?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function FeedbackAlert({
  variant = "default",
  title,
  description,
  dismissible = false,
  onDismiss,
  className,
  children,
  ...props
}: FeedbackAlertProps) {
  const [dismissed, setDismissed] = React.useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  const variantConfig = {
    default: {
      icon: InformationCircleIcon,
      classes: "border-surface-border bg-surface-card text-surface-card-foreground"
    },
    success: {
      icon: CheckCircleIcon,
      classes: "border-feedback-success bg-feedback-success/10 text-feedback-success"
    },
    warning: {
      icon: ExclamationTriangleIcon,
      classes: "border-feedback-warning bg-feedback-warning/10 text-feedback-warning"
    },
    error: {
      icon: XCircleIcon,
      classes: "border-feedback-error bg-feedback-error/10 text-feedback-error"
    },
    info: {
      icon: InformationCircleIcon,
      classes: "border-feedback-info bg-feedback-info/10 text-feedback-info"
    }
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Alert className={cn(config.classes, className)} {...props}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {title && <AlertTitle>{title}</AlertTitle>}
          {description && <AlertDescription>{description}</AlertDescription>}
          {children}
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 hover:bg-black/5 rounded-md transition-colors"
            aria-label="Dismiss alert"
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </Alert>
  );
}

// Enhanced Badge Component
interface StatusBadgeProps extends React.ComponentProps<typeof Badge> {
  status?: "default" | "success" | "warning" | "error" | "info" | "active" | "inactive";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
}

export function StatusBadge({
  status = "default",
  size = "md",
  dot = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const statusConfig = {
    default: {
      classes: "bg-surface-muted text-surface-muted-foreground hover:bg-surface-muted/80",
      dotClass: "bg-surface-text-secondary"
    },
    success: {
      classes: "bg-feedback-success text-feedback-success-foreground hover:bg-feedback-success/90",
      dotClass: "bg-feedback-success"
    },
    warning: {
      classes: "bg-feedback-warning text-feedback-warning-foreground hover:bg-feedback-warning/90",
      dotClass: "bg-feedback-warning"
    },
    error: {
      classes: "bg-feedback-error text-feedback-error-foreground hover:bg-feedback-error/90",
      dotClass: "bg-feedback-error"
    },
    info: {
      classes: "bg-feedback-info text-feedback-info-foreground hover:bg-feedback-info/90",
      dotClass: "bg-feedback-info"
    },
    active: {
      classes: "bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90",
      dotClass: "bg-brand-primary"
    },
    inactive: {
      classes: "bg-surface-muted text-surface-text-disabled hover:bg-surface-muted/80",
      dotClass: "bg-surface-text-disabled"
    }
  };

  const sizeConfig = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-0.5", 
    lg: "text-sm px-3 py-1"
  };

  const config = statusConfig[status];

  return (
    <Badge
      className={cn(
        config.classes,
        sizeConfig[size],
        dot && "flex items-center gap-1.5",
        className
      )}
      {...props}
    >
      {dot && (
        <div className={cn("w-2 h-2 rounded-full", config.dotClass)} />
      )}
      {children}
    </Badge>
  );
}

// Toast utility functions (using Sonner)
import { toast } from "sonner";

export const Toast = {
  success: (message: string, options?: Parameters<typeof toast.success>[1]) => {
    return toast.success(message, {
      ...options,
      className: cn("border-feedback-success bg-feedback-success/10", options?.className)
    });
  },
  
  error: (message: string, options?: Parameters<typeof toast.error>[1]) => {
    return toast.error(message, {
      ...options,
      className: cn("border-feedback-error bg-feedback-error/10", options?.className)
    });
  },
  
  warning: (message: string, options?: Parameters<typeof toast>[1]) => {
    return toast(message, {
      ...options,
      className: cn("border-feedback-warning bg-feedback-warning/10", options?.className)
    });
  },
  
  info: (message: string, options?: Parameters<typeof toast>[1]) => {
    return toast(message, {
      ...options,
      className: cn("border-feedback-info bg-feedback-info/10", options?.className)
    });
  },
  
  loading: (message: string, options?: Parameters<typeof toast.loading>[1]) => {
    return toast.loading(message, options);
  },
  
  promise: toast.promise,
  dismiss: toast.dismiss,
  custom: toast.custom
};

// Error boundary alert for error states
interface ErrorAlertProps {
  error: Error | string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorAlert({ 
  error, 
  onRetry, 
  onDismiss, 
  className 
}: ErrorAlertProps) {
  const errorMessage = typeof error === "string" ? error : error.message;
  
  return (
    <FeedbackAlert
      variant="error"
      title="Something went wrong"
      description={errorMessage}
      dismissible={!!onDismiss}
      onDismiss={onDismiss}
      className={className}
    >
      {onRetry && (
        <div className="mt-3">
          <button
            onClick={onRetry}
            className="text-sm font-medium text-feedback-error hover:text-feedback-error/80 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}
    </FeedbackAlert>
  );
}

// Success confirmation alert
interface SuccessAlertProps {
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function SuccessAlert({ 
  title = "Success", 
  message, 
  onDismiss, 
  className 
}: SuccessAlertProps) {
  return (
    <FeedbackAlert
      variant="success"
      title={title}
      description={message}
      dismissible={!!onDismiss}
      onDismiss={onDismiss}
      className={className}
    />
  );
}

// Export all feedback components
export const Feedback = {
  Alert: FeedbackAlert,
  Badge: StatusBadge,
  Toast,
  ErrorAlert,
  SuccessAlert,
};
