# Design System Naming Conventions

## Overview

This document defines the naming conventions and file organization standards for the design system components. Following these conventions ensures consistency, maintainability, and discoverability across the codebase.

## Component Naming Standards

### 1. File Naming

#### UI Components
- **Format**: `kebab-case.tsx`
- **Location**: `src/components/ui/`
- **Examples**: 
  - `button.tsx`
  - `input.tsx`
  - `alert-dialog.tsx`
  - `dropdown-menu.tsx`

#### Composed Components
- **Format**: `PascalCase.tsx`
- **Location**: `src/components/composed/`
- **Examples**:
  - `SearchForm.tsx`
  - `DataTable.tsx`
  - `StatusBadge.tsx`
  - `LoadingButton.tsx`

#### Domain Components
- **Format**: `PascalCase.tsx`
- **Location**: `src/components/[domain]/`
- **Examples**:
  - `src/components/projects/ProjectForm.tsx`
  - `src/components/reports/ReportViewer.tsx`
  - `src/components/competitors/CompetitorForm.tsx`

### 2. Component Export Names

#### UI Components (PascalCase)
```tsx
// button.tsx
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(...);
export type ButtonProps = ...;

// alert-dialog.tsx  
export const AlertDialog = ...;
export const AlertDialogTrigger = ...;
export const AlertDialogContent = ...;
```

#### Composed Components (PascalCase)
```tsx
// LoadingButton.tsx
export const LoadingButton = ...;
export type LoadingButtonProps = ...;

// DataTable.tsx
export const DataTable = ...;
export type DataTableProps<T> = ...;
```

### 3. Type Naming

#### Component Props
- **Format**: `ComponentNameProps`
- **Examples**:
  - `ButtonProps`
  - `AlertDialogProps`
  - `LoadingButtonProps`
  - `DataTableProps<T>`

#### Variant Types
- **Format**: `ComponentNameVariant`
- **Examples**:
  - `ButtonVariant`
  - `BadgeVariant`
  - `AlertVariant`

#### Event Handler Types
- **Format**: `ComponentNameEventHandler`
- **Examples**:
  - `ButtonClickHandler`
  - `FormSubmitHandler`
  - `TableRowSelectHandler`

## Directory Structure

```
src/components/
├── ui/                          # Primitive UI components
│   ├── button.tsx              # Basic button component
│   ├── input.tsx               # Form input component
│   ├── alert-dialog.tsx        # Modal dialog component
│   ├── dropdown-menu.tsx       # Dropdown menu component
│   └── index.ts                # Clean exports
├── composed/                    # Complex composed components
│   ├── LoadingButton.tsx       # Button with loading state
│   ├── ConfirmButton.tsx       # Button with confirmation
│   ├── FormField.tsx           # Complete form field
│   ├── DataTable.tsx           # Feature-rich table
│   └── index.ts                # Clean exports
├── design-system/               # Design system utilities
│   ├── ComponentTest.tsx       # Component testing utilities
│   └── README.md               # Design system documentation
└── [domain]/                   # Domain-specific components
    ├── ProjectForm.tsx         # Project creation form
    ├── ReportViewer.tsx        # Report display component
    └── CompetitorForm.tsx      # Competitor management form
```

## CSS Class Naming

### 1. Component Classes

Follow the existing Tailwind CSS utility-first approach combined with CSS custom properties:

```tsx
// Use semantic design tokens
className="bg-primary text-primary-foreground hover:bg-primary/90"

// For component-specific styles
className="data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
```

### 2. Custom CSS Classes (if needed)

- **Format**: `component-name__element--modifier`
- **Examples**:
  - `.button__spinner`
  - `.form-field__error-message`
  - `.data-table__header--sortable`

## Data Attributes

### 1. Component State
- **Format**: `data-[state]`
- **Examples**:
  - `data-state="open"`
  - `data-state="closed"`
  - `data-state="loading"`

### 2. Component Variants
- **Format**: `data-[variant]`
- **Examples**:
  - `data-variant="primary"`
  - `data-variant="destructive"`
  - `data-size="lg"`

### 3. Testing Attributes
- **Format**: `data-testid="component-element"`
- **Examples**:
  - `data-testid="button-primary"`
  - `data-testid="form-submit"`
  - `data-testid="table-row"`

## Event Handler Naming

### 1. Standard Event Handlers
- **Format**: `onEventName`
- **Examples**:
  - `onClick`
  - `onSubmit`
  - `onChange`
  - `onFocus`

### 2. Custom Event Handlers
- **Format**: `onComponentEvent`
- **Examples**:
  - `onValueChange`
  - `onSelectionChange`
  - `onOpenChange`
  - `onValidationError`

## Hook Naming

### 1. Component Hooks
- **Format**: `useComponentName`
- **Examples**:
  - `useTheme`
  - `useForm`
  - `useTable`
  - `useDialog`

### 2. Utility Hooks
- **Format**: `useUtilityName`
- **Examples**:
  - `useLocalStorage`
  - `useDebounce`
  - `useMediaQuery`
  - `useAsyncOperation`

## Utility Function Naming

### 1. General Utilities
- **Format**: `camelCase`
- **Examples**:
  - `cn()` - class name utility
  - `formatDate()`
  - `validateEmail()`
  - `generateId()`

### 2. Component Utilities
- **Format**: `componentUtilityName`
- **Examples**:
  - `buttonVariants`
  - `createFormField`
  - `withLoadingState`
  - `forwardRef`

## Export Patterns

### 1. Named Exports (Preferred)
```tsx
// component.tsx
export const Component = ...;
export type ComponentProps = ...;
export const ComponentVariant = ...;

// index.ts
export { Component, type ComponentProps, ComponentVariant } from "./component";
```

### 2. Barrel Exports
```tsx
// index.ts - Clean re-exports
export * from "./button";
export * from "./input";
export * from "./alert-dialog";

// Grouped exports for convenience
export const FormComponents = {
  Button,
  Input,
  Label,
  Textarea,
};
```

### 3. Default Exports (Avoid)
```tsx
// ❌ Avoid default exports for components
export default Button;

// ✅ Use named exports instead
export const Button = ...;
```

## Documentation Standards

### 1. Component Documentation
```tsx
/**
 * Button Component
 * A flexible button component with multiple variants and sizes
 * 
 * @example
 * <Button variant="primary" size="lg" onClick={handleClick}>
 *   Click me
 * </Button>
 */
export const Button = ...;
```

### 2. Props Documentation
```tsx
export interface ButtonProps {
  /** Button visual variant */
  variant?: "default" | "primary" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon";
  
  /** Whether the button is disabled */
  disabled?: boolean;
  
  /** Click event handler */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}
```

## Migration Guidelines

### 1. From Legacy Components

When migrating existing components:

1. **Identify the component type** (UI, Composed, or Domain)
2. **Apply appropriate naming convention**
3. **Update file location**
4. **Standardize exports**
5. **Update imports throughout codebase**

### 2. Naming Migration Script

```bash
# Example migration commands
mv src/components/CustomButton.tsx src/components/composed/LoadingButton.tsx
mv src/components/ui/custom-alert.tsx src/components/ui/alert.tsx
```

## Best Practices

### 1. Consistency
- Always use the same naming pattern within a category
- Be consistent with abbreviations (e.g., always use `Btn` or always use `Button`)
- Follow existing patterns in the codebase

### 2. Clarity
- Use descriptive names that indicate purpose
- Avoid overly generic names like `Component` or `Utils`
- Include context when necessary (`FormButton` vs just `Button`)

### 3. Discoverability
- Group related components in the same directory
- Use clear, searchable names
- Maintain comprehensive index files

### 4. Future-Proofing
- Consider how names will scale with the system
- Avoid names that might become misleading
- Plan for component evolution and refactoring

## Common Mistakes to Avoid

### 1. Inconsistent Naming
```tsx
// ❌ Mixed naming conventions
export const submit_button = ...;
export const CancelButton = ...;
export const deleteBtn = ...;

// ✅ Consistent naming
export const SubmitButton = ...;
export const CancelButton = ...;
export const DeleteButton = ...;
```

### 2. Unclear Component Purpose
```tsx
// ❌ Unclear purpose
export const Component1 = ...;
export const Wrapper = ...;
export const Thing = ...;

// ✅ Clear purpose
export const LoadingSpinner = ...;
export const ErrorBoundary = ...;
export const StatusIndicator = ...;
```

### 3. File and Export Mismatch
```tsx
// ❌ Mismatched file and export names
// file: custom-button.tsx
export const SpecialButton = ...;

// ✅ Matched file and export names  
// file: special-button.tsx
export const SpecialButton = ...;
```

This naming convention guide ensures that all team members follow consistent patterns, making the codebase more maintainable and discoverable.
