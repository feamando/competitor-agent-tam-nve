/**
 * Design System Type Definitions
 * TypeScript interfaces and types for the design system
 * Part of Phase 3: Design System Architecture (Task 5.4)
 */

import * as React from "react";

// Base component variants
export type ComponentVariant = "default" | "primary" | "secondary" | "destructive" | "ghost" | "outline";
export type ComponentSize = "sm" | "md" | "lg";
export type ComponentStatus = "default" | "success" | "warning" | "error" | "info";
export type ComponentState = "idle" | "loading" | "success" | "error";

// Theme system types
export type ThemeMode = "light" | "dark" | "system";

export interface ThemeConfig {
  mode: ThemeMode;
  primaryColor?: string;
  accentColor?: string;
  customTokens?: Record<string, string>;
}

export interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  systemTheme: "light" | "dark";
  resolvedTheme: "light" | "dark";
  toggleTheme: () => void;
  config: ThemeConfig;
  updateConfig: (config: Partial<ThemeConfig>) => void;
}

// Design token types
export interface ColorToken {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export interface SpacingToken {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
  "3xl": string;
  "4xl": string;
}

export interface TypographyToken {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing?: string;
}

export interface ShadowToken {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
  inner: string;
}

export interface RadiusToken {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface DesignTokens {
  colors: {
    gray: ColorToken;
    blue: ColorToken;
    green: ColorToken;
    red: ColorToken;
    yellow: ColorToken;
    purple: ColorToken;
    pink: ColorToken;
    indigo: ColorToken;
    teal: ColorToken;
    orange: ColorToken;
    highlight: ColorToken;
  };
  spacing: SpacingToken;
  typography: {
    sans: TypographyToken;
    mono: TypographyToken;
    heading: TypographyToken;
    body: TypographyToken;
    caption: TypographyToken;
  };
  shadows: ShadowToken;
  radius: RadiusToken;
}

// Component prop interfaces
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
  id?: string;
  "data-testid"?: string;
}

export interface VariantComponentProps extends BaseComponentProps {
  variant?: ComponentVariant;
  size?: ComponentSize;
}

export interface StatusComponentProps extends BaseComponentProps {
  status?: ComponentStatus;
}

export interface InteractiveComponentProps extends BaseComponentProps {
  disabled?: boolean;
  loading?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  onFocus?: (event: React.FocusEvent) => void;
  onBlur?: (event: React.FocusEvent) => void;
}

export interface FormComponentProps extends InteractiveComponentProps {
  name?: string;
  value?: any;
  onChange?: (value: any) => void;
  onValidate?: (value: any) => string | null;
  error?: string;
  required?: boolean;
  placeholder?: string;
}

// Composition types
export interface CompoundComponentProps {
  as?: React.ElementType;
  asChild?: boolean;
}

export interface ForwardRefComponentProps<T = HTMLElement> extends BaseComponentProps {
  ref?: React.Ref<T>;
}

// Layout component types
export interface ContainerProps extends BaseComponentProps {
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  centered?: boolean;
  padding?: keyof SpacingToken;
}

export interface GridProps extends BaseComponentProps {
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: keyof SpacingToken;
  rows?: number;
}

export interface StackProps extends BaseComponentProps {
  direction?: "horizontal" | "vertical";
  spacing?: keyof SpacingToken;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  wrap?: boolean;
}

export interface FlexProps extends BaseComponentProps {
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  wrap?: "nowrap" | "wrap" | "wrap-reverse";
  justify?: "start" | "end" | "center" | "between" | "around" | "evenly";
  align?: "start" | "end" | "center" | "baseline" | "stretch";
  gap?: keyof SpacingToken;
}

// Modal and dialog types
export interface ModalProps extends BaseComponentProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscapeKey?: boolean;
}

export interface DialogProps extends ModalProps {
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

// Form field types
export interface FieldProps extends FormComponentProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  layout?: "vertical" | "horizontal";
}

// Loading and state types
export interface LoadingProps extends BaseComponentProps {
  loading?: boolean;
  loadingText?: string;
  size?: ComponentSize;
  color?: string;
}

export interface SkeletonProps extends BaseComponentProps {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  count?: number;
  animate?: boolean;
}

// Table types
export interface TableColumn<T = any> {
  key: string;
  header: string;
  accessor?: keyof T | ((item: T) => any);
  sortable?: boolean;
  width?: string | number;
  render?: (value: any, item: T, index: number) => React.ReactNode;
}

export interface TableProps<T = any> extends BaseComponentProps {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T, index: number) => void;
  selectable?: boolean;
  selectedRows?: number[];
  onSelectionChange?: (selectedRows: number[]) => void;
}

// Toast and notification types
export interface ToastProps {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success" | "warning";
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Testing utilities types
export interface ComponentTestProps {
  testId?: string;
  debug?: boolean;
  mockData?: any;
}

export interface RenderResult {
  container: HTMLElement;
  getByTestId: (testId: string) => HTMLElement;
  queryByTestId: (testId: string) => HTMLElement | null;
  rerender: (ui: React.ReactElement) => void;
  unmount: () => void;
}

// Animation and transition types
export interface AnimationProps {
  animate?: boolean;
  duration?: number;
  delay?: number;
  easing?: "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear";
}

export interface TransitionProps extends AnimationProps {
  enter?: string;
  enterFrom?: string;
  enterTo?: string;
  leave?: string;
  leaveFrom?: string;
  leaveTo?: string;
}

// Accessibility types
export interface AccessibilityProps {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  "aria-hidden"?: boolean;
  "aria-live"?: "off" | "polite" | "assertive";
  role?: string;
}

// Component composition utility types
export type ComponentWithVariants<T, V extends Record<string, any>> = T & {
  variants: V;
};

export type ComponentWithSubComponents<T, S extends Record<string, React.ComponentType<any>>> = T & S;

// Event handler types
export interface EventHandlers {
  onClick?: (event: React.MouseEvent) => void;
  onDoubleClick?: (event: React.MouseEvent) => void;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  onKeyUp?: (event: React.KeyboardEvent) => void;
  onFocus?: (event: React.FocusEvent) => void;
  onBlur?: (event: React.FocusEvent) => void;
}

// Utility types for component composition
export type PropsWithAs<P, T extends React.ElementType> = P & {
  as?: T;
} & Omit<React.ComponentPropsWithoutRef<T>, keyof P>;

export type PropsWithChildren<P = {}> = P & {
  children?: React.ReactNode;
};

export type PropsWithClassName<P = {}> = P & {
  className?: string;
};

// Export all types for easy importing
export type DesignSystemTypes = {
  ComponentVariant: ComponentVariant;
  ComponentSize: ComponentSize;
  ComponentStatus: ComponentStatus;
  ComponentState: ComponentState;
  ThemeMode: ThemeMode;
  ThemeConfig: ThemeConfig;
  ThemeContextValue: ThemeContextValue;
  DesignTokens: DesignTokens;
  BaseComponentProps: BaseComponentProps;
  VariantComponentProps: VariantComponentProps;
  InteractiveComponentProps: InteractiveComponentProps;
  FormComponentProps: FormComponentProps;
  CompoundComponentProps: CompoundComponentProps;
  ForwardRefComponentProps: ForwardRefComponentProps<any>;
  ContainerProps: ContainerProps;
  GridProps: GridProps;
  StackProps: StackProps;
  FlexProps: FlexProps;
  ModalProps: ModalProps;
  DialogProps: DialogProps;
  FieldProps: FieldProps;
  LoadingProps: LoadingProps;
  TableProps: TableProps<any>;
  ToastProps: ToastProps;
  ComponentTestProps: ComponentTestProps;
  AnimationProps: AnimationProps;
  TransitionProps: TransitionProps;
  AccessibilityProps: AccessibilityProps;
  EventHandlers: EventHandlers;
};
