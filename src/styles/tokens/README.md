# Design Tokens Documentation

A comprehensive design token system for the Competitor Research Agent application, built to work seamlessly with shadcn/ui components and Tailwind CSS.

## Overview

Design tokens provide a single source of truth for design decisions in our application. They are organized into three layers:

1. **Base Tokens** - Primitive values (colors, typography, spacing)
2. **Semantic Tokens** - Contextual mappings (brand colors, feedback states)
3. **Component Tokens** - Component-specific values (button styles, form inputs)

## Token Architecture

```
src/styles/tokens/
├── base/               # Primitive values
│   ├── colors.css      # Core color palette
│   ├── typography.css  # Font families, sizes, weights
│   ├── spacing.css     # Margin, padding scales
│   └── shadows.css     # Box shadow definitions
├── semantic/           # Contextual mappings
│   ├── brand.css       # Brand-specific colors
│   ├── feedback.css    # Success, error, warning colors
│   └── surface.css     # Background, border colors
├── component/          # Component-specific
│   ├── button.css      # Button tokens
│   └── form.css        # Form component tokens
└── index.css           # Master import file
```

## Usage Examples

### Using Base Tokens

```css
/* Colors */
.my-element {
  background-color: var(--color-green-600);
  color: var(--color-white);
}

/* Typography */
.my-text {
  font-family: var(--font-sans);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-normal);
}

/* Spacing */
.my-container {
  padding: var(--spacing-4);
  margin-bottom: var(--spacing-8);
  border-radius: var(--radius-md);
}

/* Shadows */
.my-card {
  box-shadow: var(--shadow-lg);
}
```

### Using Semantic Tokens

```css
/* Brand colors */
.brand-button {
  background-color: var(--brand-primary);
  color: var(--brand-primary-foreground);
}

.brand-button:hover {
  background-color: var(--brand-primary-hover);
}

/* Feedback colors */
.success-message {
  background-color: var(--feedback-success-background);
  color: var(--feedback-success);
  border: 1px solid var(--feedback-success-border);
}

.error-message {
  background-color: var(--feedback-error-background);
  color: var(--feedback-error);
  border: 1px solid var(--feedback-error-border);
}

/* Surface colors */
.card {
  background-color: var(--surface-card);
  color: var(--surface-card-foreground);
  border: 1px solid var(--surface-border);
}
```

### Using Component Tokens

```css
/* Button component */
.custom-button {
  background-color: var(--button-primary-bg);
  color: var(--button-primary-fg);
  height: var(--button-height-md);
  padding: 0 var(--button-padding-x-md);
  font-size: var(--button-font-size-md);
  font-weight: var(--button-font-weight);
  border-radius: var(--button-radius);
  box-shadow: var(--button-primary-shadow);
  transition: var(--button-transition);
}

.custom-button:hover {
  background-color: var(--button-primary-bg-hover);
  box-shadow: var(--button-primary-shadow-hover);
}

/* Form input */
.custom-input {
  background-color: var(--form-input-bg);
  color: var(--form-input-fg);
  border: var(--form-input-border-width) solid var(--form-input-border);
  height: var(--form-input-height-md);
  padding: 0 var(--form-input-padding-x-md);
  font-size: var(--form-input-font-size-md);
  border-radius: var(--form-input-radius);
  transition: var(--form-transition);
}

.custom-input:focus {
  border-color: var(--form-input-border-focus);
  box-shadow: var(--form-focus-ring);
}
```

### Tailwind CSS Integration

With our Tailwind configuration, you can use design tokens through Tailwind classes:

```tsx
// Brand colors
<button className="bg-brand-primary text-white hover:bg-brand-primary/90">
  Primary Button
</button>

// Feedback colors
<div className="bg-feedback-success/10 text-feedback-success border border-feedback-success/20">
  Success message
</div>

// Surface colors
<div className="bg-surface-card text-surface-card-foreground border border-surface-border">
  Card content
</div>
```

## Color System

### Brand Colors
- `--brand-primary`: Main brand color (#067A46 - Green)
- `--brand-secondary`: Secondary brand color (#B5E7BA - Light Green)
- `--brand-accent`: Accent color (#BBF06A - Bright Green)

### Feedback Colors
- `--feedback-success`: Success states (Green)
- `--feedback-error`: Error states (Red)
- `--feedback-warning`: Warning states (Yellow)
- `--feedback-info`: Informational states (Blue)

### Surface Colors
- `--surface-background`: App background
- `--surface-card`: Card/container backgrounds
- `--surface-muted`: Muted/disabled backgrounds
- `--surface-accent`: Accent backgrounds

## Typography Scale

### Font Families
- `--font-sans`: Source Sans Pro (primary)
- `--font-serif`: System serif fallback
- `--font-mono`: System monospace

### Font Sizes
- `--font-size-xs`: 12px
- `--font-size-sm`: 14px
- `--font-size-base`: 16px
- `--font-size-lg`: 18px
- `--font-size-xl`: 20px
- `--font-size-2xl`: 24px

### Font Weights
- `--font-weight-normal`: 400
- `--font-weight-medium`: 500
- `--font-weight-semibold`: 600
- `--font-weight-bold`: 700

## Spacing Scale

Based on a 4px base unit:

- `--spacing-1`: 4px
- `--spacing-2`: 8px
- `--spacing-3`: 12px
- `--spacing-4`: 16px
- `--spacing-6`: 24px
- `--spacing-8`: 32px
- `--spacing-12`: 48px
- `--spacing-16`: 64px

## Border Radius

- `--radius-sm`: 2px
- `--radius-base`: 4px
- `--radius-md`: 6px (default)
- `--radius-lg`: 8px
- `--radius-xl`: 12px

## Shadows

- `--shadow-sm`: Subtle shadow
- `--shadow-base`: Default shadow
- `--shadow-md`: Medium shadow
- `--shadow-lg`: Large shadow
- `--shadow-xl`: Extra large shadow

## Dark Mode Support

All semantic tokens automatically adapt to dark mode using CSS media queries:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --surface-background: #0a0a0a;
    --surface-foreground: #ededed;
    /* ... other dark mode overrides */
  }
}
```

## Best Practices

### DO ✅
- Use semantic tokens instead of base tokens in components
- Use component tokens for component-specific styling
- Follow the token naming convention consistently
- Test your components in both light and dark modes

### DON'T ❌
- Hardcode color values or other design properties
- Mix token layers inappropriately (e.g., using base tokens in business logic)
- Override token values without updating the source
- Use magic numbers for spacing or sizing

## Migration Guide

### From Hardcoded Values
```css
/* Before */
.button {
  background-color: #067A46;
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
}

/* After */
.button {
  background-color: var(--button-primary-bg);
  color: var(--button-primary-fg);
  padding: var(--spacing-2) var(--spacing-4);
  border-radius: var(--button-radius);
}
```

### From Legacy CSS Variables
```css
/* Before */
.element {
  background: var(--background);
  color: var(--foreground);
  border-color: var(--primary);
}

/* After */
.element {
  background: var(--surface-background);
  color: var(--surface-foreground);
  border-color: var(--brand-primary);
}
```

## Extending the System

To add new tokens:

1. **Base tokens**: Add to appropriate base file (colors.css, typography.css, etc.)
2. **Semantic tokens**: Map base tokens to semantic meanings
3. **Component tokens**: Create component-specific files in `/component/` directory
4. **Update imports**: Add new files to `index.css`
5. **Update Tailwind**: Add new tokens to `tailwind.config.ts` if needed

## shadcn/ui Compatibility

This token system is fully compatible with shadcn/ui components. The following mappings are automatically applied:

- `--background` → `--surface-background`
- `--foreground` → `--surface-foreground`
- `--primary` → `--brand-primary`
- `--card` → `--surface-card`
- `--border` → `--surface-border`
- `--input` → `--surface-input`
- `--ring` → `--brand-primary`

This ensures seamless integration with shadcn/ui components while maintaining our design token architecture.
