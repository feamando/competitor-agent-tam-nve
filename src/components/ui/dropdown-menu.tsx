/**
 * Dropdown Menu Component - Placeholder for theme toggle
 * This would normally be installed via shadcn/ui
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DropdownMenuProps {
  children: React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  
  return (
    <div className="relative inline-block">
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child, { open, setOpen } as any)
          : child
      )}
    </div>
  );
}

export interface DropdownMenuTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
}

export function DropdownMenuTrigger({ 
  children, 
  asChild, 
  open, 
  setOpen 
}: DropdownMenuTriggerProps) {
  const handleClick = () => setOpen?.(!open);
  
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: handleClick,
    });
  }
  
  return (
    <button onClick={handleClick}>
      {children}
    </button>
  );
}

export interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  open?: boolean;
  setOpen?: (open: boolean) => void;
}

export function DropdownMenuContent({
  children,
  align = "center",
  className,
  open,
  setOpen,
}: DropdownMenuContentProps) {
  if (!open) return null;
  
  const alignClasses = {
    start: "left-0",
    end: "right-0",
    center: "left-1/2 -translate-x-1/2",
  };
  
  return (
    <div
      className={cn(
        "absolute top-full mt-1 z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        alignClasses[align],
        className
      )}
    >
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child, { setOpen } as any)
          : child
      )}
    </div>
  );
}

export interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  setOpen?: (open: boolean) => void;
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
  setOpen,
}: DropdownMenuItemProps) {
  const handleClick = () => {
    onClick?.();
    setOpen?.(false);
  };
  
  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
