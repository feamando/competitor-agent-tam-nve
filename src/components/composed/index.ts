/**
 * Composed Components Index
 * Central export file for all composed components and utilities
 * Part of Phase 2: Core Component Library (Task 4.5)
 */

// Core composition utilities
export * from "./LoadingButton";
export * from "./ConfirmButton";
export * from "./FormField";
export * from "./Layout";
export * from "./Modal";
export * from "./Feedback";
export * from "./Loading";
export * from "./DomainComponents";

// Re-export shadcn/ui components for convenience
export { Button } from "@/components/ui/button";
export { Input } from "@/components/ui/input";
export { Label } from "@/components/ui/label";
export { Textarea } from "@/components/ui/textarea";
export { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
export { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
export { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
export { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
export { 
  Alert, 
  AlertDescription, 
  AlertTitle 
} from "@/components/ui/alert";
export { Badge } from "@/components/ui/badge";
export { 
  Avatar, 
  AvatarFallback, 
  AvatarImage 
} from "@/components/ui/avatar";
export { 
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from "@/components/ui/table";
export { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
export { Skeleton } from "@/components/ui/skeleton";
export { Progress } from "@/components/ui/progress";
export { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
export { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb";
export { Separator } from "@/components/ui/separator";
export { Toaster } from "@/components/ui/sonner";

// Component composition patterns and utilities
export const Components = {
  // Buttons
  Button: {
    Loading: LoadingButton,
    Confirm: ConfirmButton,
  },
  
  // Forms
  Form: {
    Field: FormField,
    Input: InputField,
    Textarea: TextareaField,
    Select: SelectField,
  },
  
  // Layout
  Layout: {
    Container: Layout.Container,
    PageHeader: Layout.PageHeader,
    Section: Layout.Section,
    Grid: Layout.Grid,
    Stack: Layout.Stack,
    StatusCard: Layout.StatusCard,
    Flex: Layout.Flex,
  },
  
  // Modals
  Modal: {
    Basic: Modal,
    Confirm: ConfirmDialog,
    Form: FormModal,
    Settings: SettingsModal,
    Drawer: DrawerModal,
  },
  
  // Feedback
  Feedback: {
    Alert: FeedbackAlert,
    Badge: StatusBadge,
    Toast: Toast,
    Error: ErrorAlert,
    Success: SuccessAlert,
  },
  
  // Loading
  Loading: {
    Spinner: LoadingSpinner,
    Page: PageLoading,
    Card: CardSkeleton,
    Table: TableSkeleton,
    List: ListSkeleton,
    Progress: LabeledProgress,
    State: LoadingState,
    Overlay: LoadingOverlay,
    MultiStep: MultiStepProgress,
  },
  
  // Domain-specific
  Domain: {
    ProjectStatus: ProjectStatusCard,
    CompetitorSnapshot: CompetitorSnapshotCard,
    ReportStatus: ReportStatusCard,
    MonitoringWidget: MonitoringWidget,
  },
};

// Import statements for the composed components used above
import { LoadingButton } from "./LoadingButton";
import { ConfirmButton } from "./ConfirmButton";
import { FormField, InputField, TextareaField, SelectField } from "./FormField";
import { Layout } from "./Layout";
import { Modal, ConfirmDialog, FormModal, SettingsModal, DrawerModal } from "./Modal";
import { 
  FeedbackAlert, 
  StatusBadge, 
  Toast, 
  ErrorAlert, 
  SuccessAlert 
} from "./Feedback";
import { 
  LoadingSpinner,
  PageLoading,
  CardSkeleton,
  TableSkeleton,
  ListSkeleton,
  LabeledProgress,
  LoadingState,
  LoadingOverlay,
  MultiStepProgress
} from "./Loading";
import { 
  ProjectStatusCard,
  CompetitorSnapshotCard,
  ReportStatusCard,
  MonitoringWidget
} from "./DomainComponents";
