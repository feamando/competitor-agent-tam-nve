import { useState, useEffect } from 'react';
import { ReportData, ReportSection, ReportVersion } from '@/lib/reports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoadingButton } from '@/components/composed/LoadingButton';

interface ReportGeneratorProps {
  competitorId: string;
  competitorName: string;
}

interface TimeframeOption {
  label: string;
  value: number; // days
}

const timeframeOptions: TimeframeOption[] = [
  { label: 'Last 7 Days', value: 7 },
  { label: 'Last 30 Days', value: 30 },
  { label: 'Last 90 Days', value: 90 },
];

export function ReportGeneratorView({ competitorId, competitorName }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<number>(30);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [changeLog, setChangeLog] = useState<string>('');
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  useEffect(() => {
    if (report?.version?.number) {
      loadVersions();
    }
  }, [report?.version?.number]);

  const loadVersions = async () => {
    setIsLoadingVersions(true);
    try {
      const response = await fetch(`/api/reports/versions?competitorId=${competitorId}`);
      if (!response.ok) {
        throw new Error('Failed to load report versions');
      }
      const data = await response.json();
      setVersions(data);
    } catch (err) {
      console.error('Error loading versions:', err);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const generateReport = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/reports/generate?competitorId=${competitorId}&timeframe=${selectedTimeframe}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changeLog: changeLog.trim() || undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate report');
      }

      const data = await response.json();
      setReport(data);
      setChangeLog('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };

  const loadVersion = async (versionId: string) => {
    try {
      const response = await fetch(`/api/reports/versions/${versionId}`);
      if (!response.ok) {
        throw new Error('Failed to load version');
      }
      const data = await response.json();
      setReport(data);
      setSelectedVersion(versionId);
    } catch (err) {
      console.error('Error loading version:', err);
      setError(err instanceof Error ? err.message : 'Failed to load version');
    }
  };

  const getSectionIcon = (type: ReportSection['type']) => {
    switch (type) {
      case 'summary':
        return '📊';
      case 'changes':
        return '📈';
      case 'trends':
        return '📋';
      case 'recommendations':
        return '💡';
      default:
        return '📄';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Competitor Report</CardTitle>
          <CardDescription>
            Create a comprehensive analysis report for {competitorName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Time Period</Label>
            <Select
              value={selectedTimeframe.toString()}
              onValueChange={(value) => setSelectedTimeframe(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time period" />
              </SelectTrigger>
              <SelectContent>
                {timeframeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Change Log (optional)</Label>
            <Textarea
              value={changeLog}
              onChange={(e) => setChangeLog(e.target.value)}
              placeholder="Describe what's new in this version..."
              rows={3}
            />
          </div>

          <LoadingButton
            onClick={generateReport}
            loading={isGenerating}
            className="w-full"
          >
            Generate Report
          </LoadingButton>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>Error: {error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          {/* Version Selector */}
          {versions.length > 0 && (
            <CardHeader className="bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Label className="text-sm font-medium">Version:</Label>
                  <Select
                    value={selectedVersion || ''}
                    onValueChange={(value) => loadVersion(value)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Current" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Current</SelectItem>
                      {versions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          v{v.versionNumber} - {new Date(v.createdAt).toLocaleDateString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {report.version && (
                  <Badge variant="outline">
                    Version {report.version.number} • {new Date(report.version.createdAt).toLocaleDateString()}
                  </Badge>
                )}
              </div>
              {report.version?.changeLog && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium">Changes: </span>
                  {report.version.changeLog}
                </div>
              )}
            </CardHeader>
          )}

          {/* Report Header */}
          <CardHeader>
            <CardTitle className="text-2xl">{report.title}</CardTitle>
            <CardDescription>{report.description}</CardDescription>
            
            {/* Metadata */}
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-foreground">Analysis Period:</span>{' '}
                <span className="text-muted-foreground">
                  {report.metadata.dateRange.start.toLocaleDateString()} -{' '}
                  {report.metadata.dateRange.end.toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Analyses Performed:</span>{' '}
                <Badge variant="secondary">{report.metadata.analysisCount}</Badge>
              </div>
              <div>
                <span className="font-medium text-foreground">Significant Changes:</span>{' '}
                <Badge variant="secondary">{report.metadata.significantChanges}</Badge>
              </div>
              <div>
                <span className="font-medium text-foreground">Website:</span>{' '}
                <a
                  href={report.metadata.competitor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {report.metadata.competitor.url}
                </a>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Report Sections */}
            <div className="divide-y">
              {report.sections
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                  <div key={section.title} className="p-6">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                      <span className="mr-2">{getSectionIcon(section.type)}</span>
                      {section.title}
                    </h2>
                    <div className="prose max-w-none">
                      {section.content.split('\n').map((paragraph, index) => (
                        <p key={index} className="mb-4 text-muted-foreground">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            {/* Export Actions */}
            <div className="p-6 bg-muted/30 border-t">
              <div className="flex justify-end space-x-4">
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                >
                  🖨️ Print Report
                </Button>
                <Button
                  onClick={() => {/* TODO: Implement PDF export */}}
                >
                  📥 Export as PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 