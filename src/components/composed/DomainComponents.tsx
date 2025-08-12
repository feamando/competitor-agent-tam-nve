/**
 * Domain-Specific Composite Components
 * Business logic components for competitor research domain
 * Part of Phase 2: Core Component Library (Task 4.4)
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { LoadingButton } from "./LoadingButton";
import { StatusBadge } from "./Feedback";
import { Layout } from "./Layout";
import { cn } from "@/lib/utils";
import { 
  CalendarIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  TrashIcon
} from "@heroicons/react/24/outline";

// Project Status Card
interface ProjectStatusCardProps {
  project: {
    id: string;
    name: string;
    status: "active" | "paused" | "completed" | "error";
    progress?: number;
    lastUpdated: Date;
    competitorCount?: number;
    reportsGenerated?: number;
  };
  onView?: (projectId: string) => void;
  onEdit?: (projectId: string) => void;
  onDelete?: (projectId: string) => void;
  className?: string;
}

export function ProjectStatusCard({
  project,
  onView,
  onEdit,
  onDelete,
  className,
}: ProjectStatusCardProps) {
  const statusConfig = {
    active: { variant: "success" as const, icon: CheckCircleIcon },
    paused: { variant: "warning" as const, icon: ClockIcon },
    completed: { variant: "info" as const, icon: CheckCircleIcon },
    error: { variant: "error" as const, icon: ExclamationTriangleIcon },
  };

  const config = statusConfig[project.status];
  const StatusIcon = config.icon;

  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            <div className="flex items-center gap-2">
              <StatusBadge status={config.variant} dot>
                {project.status}
              </StatusBadge>
              {project.progress !== undefined && (
                <span className="text-sm text-surface-text-secondary">
                  {Math.round(project.progress)}% complete
                </span>
              )}
            </div>
          </div>
          <StatusIcon className="h-5 w-5 text-surface-text-secondary" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {project.progress !== undefined && (
          <Progress value={project.progress} className="h-2" />
        )}
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          {project.competitorCount !== undefined && (
            <div>
              <span className="text-surface-text-secondary">Competitors</span>
              <p className="font-medium">{project.competitorCount}</p>
            </div>
          )}
          {project.reportsGenerated !== undefined && (
            <div>
              <span className="text-surface-text-secondary">Reports</span>
              <p className="font-medium">{project.reportsGenerated}</p>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-sm text-surface-text-secondary">
          <CalendarIcon className="h-4 w-4" />
          Updated {project.lastUpdated.toLocaleDateString()}
        </div>
        
        <Separator />
        
        <div className="flex items-center gap-2">
          {onView && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(project.id)}
              className="flex-1"
            >
              <EyeIcon className="h-4 w-4 mr-2" />
              View
            </Button>
          )}
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(project.id)}
              className="flex-1"
            >
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(project.id)}
              className="text-feedback-error hover:text-feedback-error"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Competitor Snapshot Card
interface CompetitorSnapshotCardProps {
  competitor: {
    id: string;
    name: string;
    website: string;
    logo?: string;
    lastSnapshot: Date;
    snapshotCount: number;
    status: "healthy" | "stale" | "error";
    changesSinceLastWeek?: number;
  };
  onViewSnapshots?: (competitorId: string) => void;
  onTakeSnapshot?: (competitorId: string) => void;
  isSnapshotLoading?: boolean;
  className?: string;
}

export function CompetitorSnapshotCard({
  competitor,
  onViewSnapshots,
  onTakeSnapshot,
  isSnapshotLoading = false,
  className,
}: CompetitorSnapshotCardProps) {
  const statusConfig = {
    healthy: { variant: "success" as const, label: "Up to date" },
    stale: { variant: "warning" as const, label: "Needs update" },
    error: { variant: "error" as const, label: "Error" },
  };

  const config = statusConfig[competitor.status];

  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={competitor.logo} alt={competitor.name} />
            <AvatarFallback>
              {competitor.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{competitor.name}</CardTitle>
            <CardDescription className="truncate">
              {competitor.website}
            </CardDescription>
          </div>
          <StatusBadge status={config.variant} size="sm">
            {config.label}
          </StatusBadge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-surface-text-secondary">Snapshots</span>
            <p className="font-medium">{competitor.snapshotCount}</p>
          </div>
          <div>
            <span className="text-surface-text-secondary">Last Updated</span>
            <p className="font-medium">
              {competitor.lastSnapshot.toLocaleDateString()}
            </p>
          </div>
        </div>
        
        {competitor.changesSinceLastWeek !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <ArrowTrendingUpIcon className="h-4 w-4 text-brand-primary" />
            <span>
              {competitor.changesSinceLastWeek} changes this week
            </span>
          </div>
        )}
        
        <Separator />
        
        <div className="flex items-center gap-2">
          {onViewSnapshots && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewSnapshots(competitor.id)}
              className="flex-1"
            >
              View History
            </Button>
          )}
          {onTakeSnapshot && (
            <LoadingButton
              variant="default"
              size="sm"
              loading={isSnapshotLoading}
              onClick={() => onTakeSnapshot(competitor.id)}
              className="flex-1"
            >
              Take Snapshot
            </LoadingButton>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Report Generation Status
interface ReportStatusCardProps {
  report: {
    id: string;
    title: string;
    type: "initial" | "scheduled" | "comparative";
    status: "pending" | "generating" | "completed" | "error";
    progress?: number;
    createdAt: Date;
    completedAt?: Date;
    errorMessage?: string;
  };
  onView?: (reportId: string) => void;
  onRetry?: (reportId: string) => void;
  onDownload?: (reportId: string) => void;
  className?: string;
}

export function ReportStatusCard({
  report,
  onView,
  onRetry,
  onDownload,
  className,
}: ReportStatusCardProps) {
  const statusConfig = {
    pending: { variant: "default" as const, label: "Queued" },
    generating: { variant: "info" as const, label: "Generating" },
    completed: { variant: "success" as const, label: "Ready" },
    error: { variant: "error" as const, label: "Failed" },
  };

  const typeLabels = {
    initial: "Initial Report",
    scheduled: "Scheduled Report", 
    comparative: "Comparative Analysis",
  };

  const config = statusConfig[report.status];

  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{report.title}</CardTitle>
            <CardDescription>{typeLabels[report.type]}</CardDescription>
          </div>
          <StatusBadge status={config.variant} dot>
            {config.label}
          </StatusBadge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {report.status === "generating" && report.progress !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{Math.round(report.progress)}%</span>
            </div>
            <Progress value={report.progress} className="h-2" />
          </div>
        )}
        
        {report.errorMessage && (
          <div className="p-3 bg-feedback-error/10 border border-feedback-error/20 rounded-md">
            <p className="text-sm text-feedback-error">{report.errorMessage}</p>
          </div>
        )}
        
        <div className="flex items-center gap-2 text-sm text-surface-text-secondary">
          <CalendarIcon className="h-4 w-4" />
          Created {report.createdAt.toLocaleDateString()}
          {report.completedAt && (
            <span>• Completed {report.completedAt.toLocaleDateString()}</span>
          )}
        </div>
        
        <Separator />
        
        <div className="flex items-center gap-2">
          {report.status === "completed" && onView && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onView(report.id)}
              className="flex-1"
            >
              View Report
            </Button>
          )}
          {report.status === "completed" && onDownload && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownload(report.id)}
            >
              Download
            </Button>
          )}
          {report.status === "error" && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(report.id)}
              className="flex-1"
            >
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Monitoring Dashboard Widget
interface MonitoringWidgetProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: "increase" | "decrease";
    period: string;
  };
  status?: "healthy" | "warning" | "error";
  icon?: React.ReactNode;
  className?: string;
}

export function MonitoringWidget({
  title,
  value,
  change,
  status = "healthy",
  icon,
  className,
}: MonitoringWidgetProps) {
  const statusConfig = {
    healthy: "border-feedback-success bg-feedback-success/5",
    warning: "border-feedback-warning bg-feedback-warning/5",
    error: "border-feedback-error bg-feedback-error/5",
  };

  return (
    <Card className={cn(statusConfig[status], className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-surface-text-secondary">
              {title}
            </p>
            <p className="text-2xl font-bold">{value}</p>
            {change && (
              <p className={cn(
                "text-xs",
                change.type === "increase" 
                  ? "text-feedback-success" 
                  : "text-feedback-error"
              )}>
                {change.type === "increase" ? "↗" : "↘"} {Math.abs(change.value)}% 
                from {change.period}
              </p>
            )}
          </div>
          {icon && (
            <div className="text-surface-text-secondary">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Export all domain components
export const DomainComponents = {
  ProjectStatus: ProjectStatusCard,
  CompetitorSnapshot: CompetitorSnapshotCard,
  ReportStatus: ReportStatusCard,
  MonitoringWidget,
};
