# shadcn/ui Component Customization Guidelines

This document outlines the guidelines for customizing and using shadcn/ui components within our design system.

## Overview

Our design system integrates shadcn/ui components with our comprehensive design token architecture. This ensures consistency while maintaining the flexibility and accessibility that shadcn/ui provides.

## Component Architecture

### 1. Component Layers

```
src/components/
├── ui/                 # shadcn/ui components (DO NOT modify directly)
├── design-system/      # Design system utilities and test components
├── composed/           # Business logic components (Future Phase 2)
└── [domain]/          # Domain-specific components (existing)
```

### 2. Integration Pattern

Our components follow this hierarchy:
- **Base**: shadcn/ui primitives in `/ui/`
- **Tokens**: Design tokens from `/src/styles/tokens/`
- **Tailwind**: Extended configuration with token mappings
- **Components**: Domain-specific implementations

## Customization Guidelines

### ✅ Recommended Customizations

#### 1. Extend Component Variants
```tsx
// Create extended variants by composing with existing ones
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const brandButtonVariants = cva(
  // Base styles from button component
  "", 
  {
    variants: {
      brand: {
        primary: "bg-brand-primary hover:bg-brand-primary/90 text-brand-primary-foreground",
        secondary: "bg-brand-secondary hover:bg-brand-secondary/80 text-brand-secondary-foreground",
        accent: "bg-brand-accent hover:bg-brand-accent/90 text-brand-accent-foreground",
      }
    }
  }
);

export function BrandButton({ className, brand, ...props }) {
  return (
    <Button 
      className={cn(brandButtonVariants({ brand }), className)} 
      {...props} 
    />
  );
}
```

#### 2. Use Design Tokens in Custom Styles
```tsx
// Use our design tokens for consistent styling
<Button className="bg-feedback-success hover:bg-feedback-success/90 text-feedback-success-foreground">
  Success Action
</Button>

// Or use component tokens for complex customizations
<Button className="h-[var(--button-height-lg)] px-[var(--button-padding-x-lg)]">
  Custom Sized Button
</Button>
```

#### 3. Compose Components for Domain Logic
```tsx
// Create domain-specific components that wrap shadcn/ui
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProjectCard({ project, onEdit, onDelete }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### ❌ Avoid These Practices

#### 1. DO NOT Modify shadcn/ui Components Directly
```tsx
// ❌ BAD: Don't edit files in src/components/ui/
// src/components/ui/button.tsx - DON'T MODIFY THIS FILE

// ✅ GOOD: Create wrapper components instead
// src/components/common/CustomButton.tsx
```

#### 2. DO NOT Use Hardcoded Values
```tsx
// ❌ BAD: Hardcoded colors and spacing
<Button className="bg-[#067A46] text-white px-[12px] py-[8px]">
  Bad Button
</Button>

// ✅ GOOD: Use design tokens
<Button className="bg-brand-primary text-brand-primary-foreground">
  Good Button
</Button>
```

#### 3. DO NOT Override Core Theme Variables
```css
/* ❌ BAD: Don't override in component files */
.my-component {
  --primary: #ff0000; /* Don't do this */
}

/* ✅ GOOD: Use local variables or extend tokens */
.my-component {
  --local-accent: var(--brand-accent);
  background: var(--local-accent);
}
```

## Component Usage Patterns

### 1. Standard Usage
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function MyForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Form Title</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Enter your name" />
        <Button type="submit">Submit</Button>
      </CardContent>
    </Card>
  );
}
```

### 2. Custom Styling with Tokens
```tsx
import { Button } from "@/components/ui/button";

function CustomStyledButton() {
  return (
    <Button 
      className="
        bg-gradient-to-r from-brand-primary to-brand-accent
        hover:from-brand-primary/90 hover:to-brand-accent/90
        text-white font-semibold
        px-[var(--spacing-6)] py-[var(--spacing-3)]
        rounded-[var(--radius-lg)]
        shadow-[var(--shadow-lg)]
      "
    >
      Gradient Button
    </Button>
  );
}
```

### 3. Conditional Styling
```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function StatusButton({ status, children, ...props }) {
  return (
    <Button
      className={cn(
        // Base styles
        "font-medium",
        // Conditional styles using our tokens
        status === 'success' && "bg-feedback-success hover:bg-feedback-success/90",
        status === 'error' && "bg-feedback-error hover:bg-feedback-error/90",
        status === 'warning' && "bg-feedback-warning hover:bg-feedback-warning/90",
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
```

## Theme Integration

### Automatic Theme Support
All shadcn/ui components automatically use our design tokens through the theme configuration in `globals.css`:

```css
/* These mappings are already configured */
:root {
  --background: var(--surface-background);
  --foreground: var(--surface-foreground);
  --primary: var(--brand-primary);
  --card: var(--surface-card);
  /* ... other mappings */
}
```

### Dark Mode Support
Components automatically adapt to dark mode through our design token system:

```tsx
// No special handling needed - tokens handle dark mode automatically
<Button variant="default">
  This button works in both light and dark mode
</Button>
```

## Testing Components

### 1. Use the ComponentTest Component
```tsx
import { ComponentTest } from "@/components/design-system/ComponentTest";

// In your development/testing environment
<ComponentTest />
```

### 2. Test All Variants
When creating custom components, ensure you test:
- All size variants (sm, default, lg)
- All style variants (default, secondary, outline, ghost, destructive)
- Light and dark modes
- Interactive states (hover, focus, active, disabled)

### 3. Accessibility Testing
```tsx
// Ensure proper ARIA attributes
<Button 
  aria-label="Delete project"
  aria-describedby="delete-description"
>
  Delete
</Button>
<p id="delete-description" className="sr-only">
  This will permanently delete the project and cannot be undone
</p>
```

## Migration Strategy

### Phase 1 (Current): Foundation
- ✅ Design tokens implemented
- ✅ shadcn/ui base components installed
- ✅ Theme integration complete

### Phase 2 (Next): Component Migration
- Replace existing custom buttons with shadcn Button
- Update form components to use shadcn Input, Label, etc.
- Migrate card layouts to shadcn Card components

### Phase 3 (Future): Advanced Components
- Install and configure data tables
- Add navigation components (tabs, breadcrumbs)
- Implement feedback components (toast, alert)

## Common Patterns

### 1. Loading States
```tsx
import { Button } from "@/components/ui/button";

function LoadingButton({ loading, children, ...props }) {
  return (
    <Button disabled={loading} {...props}>
      {loading && <Spinner className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}
```

### 2. Icon Buttons
```tsx
import { Button } from "@/components/ui/button";
import { Trash2Icon } from "lucide-react";

function DeleteButton(props) {
  return (
    <Button variant="destructive" size="sm" {...props}>
      <Trash2Icon className="h-4 w-4" />
      Delete
    </Button>
  );
}
```

### 3. Form Field Groups
```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function FormField({ label, error, ...inputProps }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input 
        className={error ? "border-feedback-error" : ""} 
        {...inputProps} 
      />
      {error && (
        <p className="text-feedback-error text-sm">{error}</p>
      )}
    </div>
  );
}
```

## Support and Troubleshooting

### Common Issues

1. **Styles not applying**: Ensure you're importing the component correctly and that globals.css is loaded.

2. **Theme not working**: Check that design tokens are properly imported in globals.css.

3. **TypeScript errors**: Ensure you have the latest @types and that component props match the expected interface.

### Getting Help

1. Check the [shadcn/ui documentation](https://ui.shadcn.com)
2. Review our design token documentation in `/src/styles/tokens/README.md`
3. Use the ComponentTest component to debug styling issues
4. Check the browser dev tools for CSS custom property values

## Best Practices Summary

1. **Always use design tokens** instead of hardcoded values
2. **Compose components** rather than modifying shadcn/ui directly
3. **Test in both light and dark modes**
4. **Follow accessibility guidelines**
5. **Use the `cn()` utility** for conditional styling
6. **Keep components simple and focused**
7. **Document custom component variants**
8. **Test interactive states thoroughly**
