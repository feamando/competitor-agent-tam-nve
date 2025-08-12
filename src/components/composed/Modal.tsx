/**
 * Modal Components
 * Enhanced dialog and modal patterns for complex interactions
 * Part of Phase 2: Core Component Library (Task 4.1)
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingButton } from "./LoadingButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X, AlertTriangle } from "lucide-react";

// Enhanced Dialog Modal
interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
  className,
  showCloseButton = true,
}: ModalProps) {
  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw] max-h-[95vh]"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(sizeClasses[size], className)}
        showCloseButton={showCloseButton}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="py-4">
          {children}
        </div>
        {footer && (
          <DialogFooter>
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Confirmation Dialog
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [confirming, setConfirming] = React.useState(false);

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Confirmation failed:", error);
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {variant === "destructive" && (
            <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={handleCancel}
            disabled={confirming || loading}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <LoadingButton
              variant={variant === "destructive" ? "destructive" : "default"}
              loading={confirming || loading}
              onClick={handleConfirm}
            >
              {confirmText}
            </LoadingButton>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Form Modal
interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  loading?: boolean;
  submitText?: string;
  cancelText?: string;
  onSubmit: () => void | Promise<void>;
  onCancel?: () => void;
  submitDisabled?: boolean;
}

export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  loading = false,
  submitText = "Save",
  cancelText = "Cancel",
  onSubmit,
  onCancel,
  submitDisabled = false,
}: FormModalProps) {
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await onSubmit();
      onOpenChange(false);
    } catch (error) {
      console.error("Form submission failed:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const isLoading = loading || submitting;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size={size}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <LoadingButton
            type="submit"
            form="modal-form"
            loading={isLoading}
            disabled={submitDisabled}
          >
            {submitText}
          </LoadingButton>
        </div>
      }
    >
      <form id="modal-form" onSubmit={handleSubmit}>
        {children}
      </form>
    </Modal>
  );
}

// Settings Modal with multiple sections
interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: Array<{
    id: string;
    title: string;
    content: React.ReactNode;
  }>;
  defaultSection?: string;
}

export function SettingsModal({
  open,
  onOpenChange,
  sections,
  defaultSection,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = React.useState(
    defaultSection || sections[0]?.id
  );

  const currentSection = sections.find(s => s.id === activeSection);

  if (!currentSection) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      size="lg"
      className="flex flex-col"
    >
      <div className="flex flex-1 gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                  activeSection === section.id
                    ? "bg-brand-primary text-brand-primary-foreground"
                    : "text-surface-text-secondary hover:text-surface-text-primary hover:bg-surface-hover"
                )}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{currentSection.title}</h3>
            {currentSection.content}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Drawer Modal (slide in from side)
interface DrawerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function DrawerModal({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  size = "md",
  children,
  footer,
}: DrawerModalProps) {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg"
  };

  const slideClasses = {
    left: "inset-y-0 left-0 slide-in-from-left",
    right: "inset-y-0 right-0 slide-in-from-right"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "fixed h-full p-0 m-0 rounded-none border-0 shadow-lg",
          sizeClasses[size],
          slideClasses[side]
        )}
        showCloseButton={false}
      >
        <div className="flex flex-col h-full">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{title}</DialogTitle>
                {description && (
                  <DialogDescription className="mt-1">
                    {description}
                  </DialogDescription>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto px-6 py-4">
            {children}
          </div>
          
          {footer && (
            <div className="px-6 py-4 border-t">
              {footer}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Export all modal components
export const ModalComponents = {
  Modal,
  ConfirmDialog,
  FormModal,
  SettingsModal,
  DrawerModal,
};
