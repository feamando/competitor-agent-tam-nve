# Design System Architecture Guide

## Overview

This design system provides a comprehensive, scalable architecture for building consistent UI components with full theme support, accessibility features, and testing utilities.

## Architecture Components

### 1. Theme System (`theme.ts`)

The theme system provides light/dark mode switching with persistent storage and system preference detection.

#### Basic Usage

```tsx
import { ThemeProvider, useTheme } from "@/lib/design-system/theme";

// Wrap your app with ThemeProvider
function App() {
  return (
    <ThemeProvider defaultTheme="system" enableSystem>
      <YourApp />
    </ThemeProvider>
  );
}

// Use theme in components
function YourComponent() {
  const { theme, setTheme, toggleTheme, resolvedTheme } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      Current theme: {resolvedTheme}
    </button>
  );
}
```

#### Advanced Theme Configuration

```tsx
// Custom theme configuration
const customConfig = {
  primaryColor: "hsl(210, 100%, 50%)",
  accentColor: "hsl(160, 100%, 40%)",
  customTokens: {
    "custom-gradient": "linear-gradient(45deg, #ff0000, #00ff00)",
  },
};

<ThemeProvider defaultConfig={customConfig}>
  <App />
</ThemeProvider>
```

### 2. Variant System (`variants.ts`)

The variant system provides flexible, type-safe component styling with theme awareness.

#### Creating Component Variants

```tsx
import { createVariant, createThemeVariant } from "@/lib/design-system/variants";

// Basic variant
const buttonVariants = createVariant(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
    },
  },
  { variant: "default", size: "default" }
);

// Theme-aware variant
const cardVariants = createThemeVariant(
  "rounded-lg border p-6",
  {
    variant: {
      default: "bg-white border-gray-200",
      elevated: "bg-white border-gray-200 shadow-lg",
    },
  },
  {
    variant: {
      default: "bg-gray-900 border-gray-800",
      elevated: "bg-gray-900 border-gray-800 shadow-xl",
    },
  },
  { variant: "default" }
);
```

#### Using Variants in Components

```tsx
import { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./variants";

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  onClick?: () => void;
}

function Button({ variant, size, className, children, ...props }: ButtonProps) {
  return (
    <button 
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}
```

### 3. Component Organization

#### UI Components (`/components/ui/`)
- Primitive components based on shadcn/ui
- Highly reusable, minimal business logic
- Consistent API and styling

#### Composed Components (`/components/composed/`)
- Complex components built from UI primitives
- Domain-specific functionality
- Enhanced with business logic

#### Example Structure
```
src/components/
├── ui/
│   ├── button.tsx          # Basic button primitive
│   ├── input.tsx           # Form input primitive
│   ├── card.tsx            # Container primitive
│   └── index.ts            # Clean exports
├── composed/
│   ├── search-form.tsx     # Complex form component
│   ├── data-table.tsx      # Feature-rich table
│   ├── status-badge.tsx    # Business-specific badge
│   └── index.ts            # Clean exports
└── design-system/
    ├── theme.ts            # Theme system
    ├── variants.ts         # Styling utilities
    ├── testing.ts          # Testing utilities
    └── README.md          # Documentation
```

## Theming Best Practices

### 1. Use Design Tokens

Always use design tokens instead of hardcoded values:

```tsx
// ❌ Bad
const Button = () => (
  <button className="bg-blue-500 text-white hover:bg-blue-600">
    Click me
  </button>
);

// ✅ Good
const Button = () => (
  <button className="bg-primary text-primary-foreground hover:bg-primary/90">
    Click me
  </button>
);
```

### 2. Theme-Aware Components

Create components that adapt to theme changes:

```tsx
import { useTheme } from "@/lib/design-system/theme";

function AdaptiveComponent() {
  const { resolvedTheme } = useTheme();
  
  return (
    <div className={cn(
      "p-4 rounded-lg",
      resolvedTheme === "dark" 
        ? "bg-gray-900 text-white" 
        : "bg-white text-gray-900"
    )}>
      Theme-aware content
    </div>
  );
}
```

### 3. Semantic Color Usage

Use semantic color tokens for consistent meaning:

```tsx
// Status indicators
const StatusBadge = ({ status }: { status: "success" | "error" | "warning" }) => (
  <span className={cn(
    "px-2 py-1 rounded text-sm",
    {
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200": status === "success",
      "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200": status === "error",
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200": status === "warning",
    }
  )}>
    {status}
  </span>
);
```

### 4. Accessible Color Contrasts

Ensure proper color contrast for accessibility:

```css
/* Design tokens should include accessible color pairings */
:root {
  --primary: hsl(221, 83%, 53%);
  --primary-foreground: hsl(0, 0%, 98%);
  
  /* Ensure 4.5:1 contrast ratio minimum */
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(0, 0%, 98%);
}
```

## Testing Guidelines

### 1. Theme Testing

Test components in both light and dark themes:

```tsx
import { TestingUtils } from "@/lib/design-system/testing";

describe("Button Component", () => {
  test("renders correctly in both themes", async () => {
    await TestingUtils.theme.testInBothThemes(
      <Button>Test Button</Button>,
      (theme) => {
        expect(document.documentElement).toHaveClass(theme);
        expect(screen.getByRole("button")).toBeInTheDocument();
      }
    );
  });
  
  test("theme switching works", async () => {
    await TestingUtils.theme.testThemeSwitch(
      <ThemeToggle />,
      "theme-toggle"
    );
  });
});
```

### 2. Accessibility Testing

```tsx
test("component is accessible", () => {
  render(<Button>Accessible Button</Button>);
  
  const button = screen.getByRole("button");
  
  // Test ARIA attributes
  TestingUtils.a11y.testAriaAttributes(button, {
    "aria-label": "Accessible Button",
  });
  
  // Test keyboard navigation
  TestingUtils.a11y.testKeyboardNavigation("button-container");
});
```

### 3. Visual Regression Testing

```tsx
test("component matches snapshot", () => {
  TestingUtils.visual.takeSnapshot(<Button variant="primary">Button</Button>);
  TestingUtils.visual.takeSnapshot(<Button variant="primary">Button</Button>, "dark");
});
```

## Performance Guidelines

### 1. Lazy Loading

```tsx
import { lazy, Suspense } from "react";

const HeavyComponent = lazy(() => import("./HeavyComponent"));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}
```

### 2. Memoization

```tsx
import { memo, useMemo } from "react";

const ExpensiveComponent = memo(({ data, filter }) => {
  const filteredData = useMemo(
    () => data.filter(item => item.category === filter),
    [data, filter]
  );
  
  return <div>{/* Render filtered data */}</div>;
});
```

### 3. Bundle Optimization

```tsx
// Import only what you need
import { Button } from "@/components/ui"; // ✅ Tree-shakeable
import * as UI from "@/components/ui"; // ❌ Imports everything
```

## Migration Guide

### From Custom Components to Design System

1. **Identify Patterns**: Audit existing components for common patterns
2. **Create Variants**: Convert styling variations to variant-based system
3. **Update Imports**: Use new component exports
4. **Test Thoroughly**: Ensure visual consistency and functionality

```tsx
// Before
import { CustomButton } from "./legacy/CustomButton";

// After
import { Button } from "@/components/ui";

// Usage remains similar
<Button variant="primary" size="lg">Click me</Button>
```

## Common Patterns

### 1. Compound Components

```tsx
const Card = {
  Root: CardRoot,
  Header: CardHeader,
  Content: CardContent,
  Footer: CardFooter,
};

// Usage
<Card.Root>
  <Card.Header>Title</Card.Header>
  <Card.Content>Content</Card.Content>
  <Card.Footer>Actions</Card.Footer>
</Card.Root>
```

### 2. Polymorphic Components

```tsx
interface PolymorphicProps<T extends React.ElementType> {
  as?: T;
  children: React.ReactNode;
}

function PolymorphicComponent<T extends React.ElementType = "div">({
  as,
  children,
  ...props
}: PolymorphicProps<T> & Omit<React.ComponentPropsWithoutRef<T>, keyof PolymorphicProps<T>>) {
  const Component = as || "div";
  return <Component {...props}>{children}</Component>;
}
```

### 3. Forward Ref Components

```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
```

## Troubleshooting

### Theme Not Applying
- Check if `ThemeProvider` wraps your app
- Verify design tokens are properly imported
- Ensure CSS custom properties are defined

### Components Not Styling Correctly
- Verify variant props are correctly typed
- Check for CSS specificity issues
- Ensure Tailwind classes are not purged

### Performance Issues
- Check for unnecessary re-renders with React DevTools
- Verify component memoization
- Monitor bundle size with webpack-bundle-analyzer

## Contributing

When adding new components:

1. Follow established patterns and conventions
2. Include comprehensive TypeScript types
3. Add thorough tests including theme and accessibility testing
4. Document component APIs and usage examples
5. Consider responsive design and performance implications

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Class Variance Authority](https://cva.style)
- [Radix UI Primitives](https://radix-ui.com)
- [Testing Library](https://testing-library.com)
