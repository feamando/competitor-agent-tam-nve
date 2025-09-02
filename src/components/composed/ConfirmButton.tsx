/**
 * Confirm Button Component
 * Button with built-in confirmation dialog for destructive actions
 * Part of Phase 2: Core Component Library (Task 3.2)
 */

import * as React from "react";
import { LoadingButton } from "./LoadingButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface ConfirmButtonProps 
  extends Omit<React.ComponentProps<typeof LoadingButton>, "onClick">,
    VariantProps<typeof buttonVariants> {
  onConfirm: () => void | Promise<void>;
  confirmTitle?: string;
  confirmDescription?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
}

export function ConfirmButton({
  children,
  onConfirm,
  confirmTitle = "Are you sure?",
  confirmDescription = "This action cannot be undone.",
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  loading = false,
  variant = destructive ? "destructive" : "default",
  disabled,
  ...props
}: ConfirmButtonProps) {
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const handleClick = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    try {
      setIsConfirming(true);
      await onConfirm();
      setShowConfirm(false);
    } catch (error) {
      console.error("Confirmation action failed:", error);
      // Keep dialog open on error
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <LoadingButton
        variant={variant}
        loading={loading}
        disabled={disabled}
        onClick={handleClick}
        {...props}
      >
        {children}
      </LoadingButton>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            {destructive && (
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 mb-4">
                <ExclamationTriangleIcon
                  className="h-6 w-6 text-red-600"
                  aria-hidden="true"
                />
              </div>
            )}
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isConfirming}
            >
              {cancelText}
            </Button>
            <LoadingButton
              variant={destructive ? "destructive" : "default"}
              onClick={handleConfirm}
              loading={isConfirming}
            >
              {confirmText}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Convenience component for delete actions
export function DeleteButton({
  itemName,
  onConfirm,
  ...props
}: Omit<ConfirmButtonProps, "confirmTitle" | "confirmDescription" | "destructive"> & {
  itemName?: string;
}) {
  return (
    <ConfirmButton
      confirmTitle="Delete Item"
      confirmDescription={
        itemName
          ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
          : "Are you sure you want to delete this item? This action cannot be undone."
      }
      confirmText="Delete"
      destructive
      onConfirm={onConfirm}
      {...props}
    >
      Delete
    </ConfirmButton>
  );
}
