/**
 * Form Field Component
 * Complete form field with label, input, validation, and help text
 * Part of Phase 2: Core Component Library (Task 3.3)
 */

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Base form field props
interface FormFieldBaseProps {
  label: string;
  name: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
  helpText?: string;
  showOptional?: boolean;
}

// Input field props
interface InputFieldProps extends FormFieldBaseProps {
  type?: "text" | "email" | "password" | "url" | "tel" | "number";
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  autoComplete?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
}

// Textarea field props
interface TextareaFieldProps extends FormFieldBaseProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  rows?: number;
  maxLength?: number;
  minLength?: number;
  resize?: boolean;
}

// Select field props
interface SelectFieldProps extends FormFieldBaseProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
}

// Form field wrapper component
function FormFieldWrapper({
  label,
  name,
  id,
  required = false,
  disabled = false,
  className,
  error,
  helpText,
  showOptional = true,
  children,
}: FormFieldBaseProps & { children: React.ReactNode }) {
  const fieldId = id || name;
  const hasError = Boolean(error);

  return (
    <div className={cn("space-y-2", className)}>
      <Label 
        htmlFor={fieldId} 
        className={cn(
          "text-sm font-medium",
          hasError && "text-feedback-error",
          disabled && "text-surface-text-disabled"
        )}
      >
        {label}
        {required && <span className="text-feedback-error ml-1">*</span>}
        {!required && showOptional && (
          <span className="text-surface-text-secondary ml-1 font-normal">(optional)</span>
        )}
      </Label>
      
      {children}
      
      {error && (
        <p 
          className="text-sm text-feedback-error" 
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p className="text-sm text-surface-text-secondary">
          {helpText}
        </p>
      )}
    </div>
  );
}

// Input field component
export function InputField({
  type = "text",
  placeholder,
  value,
  defaultValue,
  onChange,
  onBlur,
  autoComplete,
  maxLength,
  minLength,
  pattern,
  ...fieldProps
}: InputFieldProps) {
  const fieldId = fieldProps.id || fieldProps.name;
  const hasError = Boolean(fieldProps.error);

  return (
    <FormFieldWrapper {...fieldProps}>
      <Input
        id={fieldId}
        name={fieldProps.name}
        type={type}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        disabled={fieldProps.disabled}
        required={fieldProps.required}
        autoComplete={autoComplete}
        maxLength={maxLength}
        minLength={minLength}
        pattern={pattern}
        className={cn(
          hasError && "border-feedback-error focus:ring-feedback-error"
        )}
        aria-invalid={hasError}
        aria-describedby={
          fieldProps.error 
            ? `${fieldId}-error` 
            : fieldProps.helpText 
            ? `${fieldId}-help` 
            : undefined
        }
      />
    </FormFieldWrapper>
  );
}

// Textarea field component
export function TextareaField({
  placeholder,
  value,
  defaultValue,
  onChange,
  onBlur,
  rows = 3,
  maxLength,
  minLength,
  resize = true,
  ...fieldProps
}: TextareaFieldProps) {
  const fieldId = fieldProps.id || fieldProps.name;
  const hasError = Boolean(fieldProps.error);

  return (
    <FormFieldWrapper {...fieldProps}>
      <Textarea
        id={fieldId}
        name={fieldProps.name}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        disabled={fieldProps.disabled}
        required={fieldProps.required}
        rows={rows}
        maxLength={maxLength}
        minLength={minLength}
        className={cn(
          hasError && "border-feedback-error focus:ring-feedback-error",
          !resize && "resize-none"
        )}
        aria-invalid={hasError}
        aria-describedby={
          fieldProps.error 
            ? `${fieldId}-error` 
            : fieldProps.helpText 
            ? `${fieldId}-help` 
            : undefined
        }
      />
    </FormFieldWrapper>
  );
}

// Select field component
export function SelectField({
  placeholder = "Select an option...",
  value,
  defaultValue,
  onChange,
  options,
  ...fieldProps
}: SelectFieldProps) {
  const fieldId = fieldProps.id || fieldProps.name;
  const hasError = Boolean(fieldProps.error);

  return (
    <FormFieldWrapper {...fieldProps}>
      <Select
        value={value}
        defaultValue={defaultValue}
        onValueChange={onChange}
        disabled={fieldProps.disabled}
        required={fieldProps.required}
      >
        <SelectTrigger
          id={fieldId}
          className={cn(
            hasError && "border-feedback-error focus:ring-feedback-error"
          )}
          aria-invalid={hasError}
          aria-describedby={
            fieldProps.error 
              ? `${fieldId}-error` 
              : fieldProps.helpText 
              ? `${fieldId}-help` 
              : undefined
          }
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormFieldWrapper>
  );
}

// Convenience exports for common form patterns
export const FormField = {
  Input: InputField,
  Textarea: TextareaField,
  Select: SelectField,
};

// Export types for external use
export type {
  FormFieldBaseProps,
  InputFieldProps,
  TextareaFieldProps,
  SelectFieldProps,
};
