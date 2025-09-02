/**
 * Theme Toggle Component
 * Interactive button for switching between light/dark themes
 * Part of Phase 3: Design System Architecture (Task 6.1)
 */

"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { useTheme } from "@/lib/design-system/theme";
import { cn } from "@/lib/utils";

export interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "outline";
  showLabel?: boolean;
  align?: "start" | "end" | "center";
}

export function ThemeToggle({
  className,
  size = "md",
  variant = "ghost",
  showLabel = false,
  align = "end",
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  const currentTheme = themeOptions.find(option => option.value === theme);
  const CurrentIcon = currentTheme?.icon || Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("w-auto", className)}
          aria-label="Toggle theme"
        >
          <CurrentIcon className="h-4 w-4" />
          {showLabel && (
            <span className="ml-2">{currentTheme?.label}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {themeOptions.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "cursor-pointer",
              theme === value && "bg-accent"
            )}
          >
            <Icon className="h-4 w-4 mr-2" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Simple toggle button (no dropdown)
export interface SimpleThemeToggleProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "outline";
}

export function SimpleThemeToggle({
  className,
  size = "md",
  variant = "ghost",
}: SimpleThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggleTheme}
      className={cn("w-auto", className)}
      aria-label={`Switch to ${resolvedTheme === "light" ? "dark" : "light"} theme`}
    >
      {resolvedTheme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  );
}

// Theme status indicator
export interface ThemeStatusProps {
  className?: string;
  showIcon?: boolean;
  showText?: boolean;
}

export function ThemeStatus({
  className,
  showIcon = true,
  showText = true,
}: ThemeStatusProps) {
  const { theme, resolvedTheme, systemTheme } = useTheme();

  const getThemeInfo = () => {
    if (theme === "system") {
      return {
        icon: Monitor,
        text: `System (${systemTheme})`,
        color: "text-muted-foreground",
      };
    }
    
    if (theme === "light") {
      return {
        icon: Sun,
        text: "Light",
        color: "text-yellow-600 dark:text-yellow-400",
      };
    }
    
    return {
      icon: Moon,
      text: "Dark",
      color: "text-blue-600 dark:text-blue-400",
    };
  };

  const { icon: Icon, text, color } = getThemeInfo();

  return (
    <div className={cn("flex items-center gap-2", color, className)}>
      {showIcon && <Icon className="h-4 w-4" />}
      {showText && <span className="text-sm">{text}</span>}
    </div>
  );
}
