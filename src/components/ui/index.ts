/**
 * UI Components Index
 * Central export file for all shadcn/ui components
 * Part of Phase 3: Design System Architecture (Task 5.3)
 */

// Form Components
export { Button, type ButtonProps } from "./button";
export { Input, type InputProps } from "./input";
export { Label, type LabelProps } from "./label";
export { Textarea, type TextareaProps } from "./textarea";
export { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectProps
} from "./select";

// Layout Components
export { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle,
  type CardProps
} from "./card";
export { Separator, type SeparatorProps } from "./separator";
export { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger,
  type TabsProps
} from "./tabs";

// Navigation Components
export { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  type BreadcrumbProps
} from "./breadcrumb";

// Dialog Components
export { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type DialogProps
} from "./dialog";
export { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  type AlertDialogProps
} from "./alert-dialog";

// Feedback Components
export { 
  Alert, 
  AlertDescription, 
  AlertTitle,
  type AlertProps
} from "./alert";
export { Badge, type BadgeProps } from "./badge";
export { Toaster } from "./sonner";

// Data Display Components
export { 
  Avatar, 
  AvatarFallback, 
  AvatarImage,
  type AvatarProps
} from "./avatar";
export { 
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableProps
} from "./table";
export { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type TooltipProps
} from "./tooltip";

// Loading Components
export { Skeleton, type SkeletonProps } from "./skeleton";
export { Progress, type ProgressProps } from "./progress";

// Component Collections
export const FormComponents = {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};

export const LayoutComponents = {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
};

export const NavigationComponents = {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};

export const DialogComponents = {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};

export const FeedbackComponents = {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Toaster,
};

export const DataComponents = {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
};

export const LoadingComponents = {
  Skeleton,
  Progress,
};

// All UI components
export const UIComponents = {
  ...FormComponents,
  ...LayoutComponents,
  ...NavigationComponents,
  ...DialogComponents,
  ...FeedbackComponents,
  ...DataComponents,
  ...LoadingComponents,
};
