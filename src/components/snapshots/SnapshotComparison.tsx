'use client'

import { useState } from 'react';
import { ContentDiff } from '@/lib/diff';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { LoadingButton } from '@/components/composed/LoadingButton';

interface SnapshotComparisonProps {
  oldSnapshotId: string;
  newSnapshotId: string;
}

interface ComparisonResult {
  diff: ContentDiff;
  significantChanges: string[];
  formattedDiff: string;
  metadata: {
    oldSnapshot: {
      timestamp: string;
      title: string;
    };
    newSnapshot: {
      timestamp: string;
      title: string;
    };
  };
}

export function SnapshotComparison({ oldSnapshotId, newSnapshotId }: SnapshotComparisonProps) {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compareSnapshots = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/snapshots/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          oldSnapshotId,
          newSnapshotId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to compare snapshots');
      }

      const data = await response.json();
      setComparison(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Compare Snapshots</h2>
        <LoadingButton
          onClick={compareSnapshots}
          loading={isLoading}
        >
          Compare
        </LoadingButton>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {comparison && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Significant Changes</CardTitle>
            </CardHeader>
            <CardContent>
              {comparison.significantChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">No significant changes detected</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {comparison.significantChanges.map((change, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content Changes</CardTitle>
              <div className="flex justify-between text-sm">
                <Badge variant="outline">
                  From: {new Date(comparison.metadata.oldSnapshot.timestamp).toLocaleString()}
                </Badge>
                <Badge variant="outline">
                  To: {new Date(comparison.metadata.newSnapshot.timestamp).toLocaleString()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-sm font-mono bg-muted p-4 rounded-md overflow-auto max-h-96 whitespace-pre-wrap">
                {comparison.formattedDiff || 'No content changes'}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="bg-green-50">
                  <CardContent className="p-4">
                    <dt className="text-sm font-medium text-green-800">Added Lines</dt>
                    <dd className="mt-1 text-2xl font-semibold text-green-600">
                      {comparison.diff.stats.addedLines}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="bg-red-50">
                  <CardContent className="p-4">
                    <dt className="text-sm font-medium text-red-800">Removed Lines</dt>
                    <dd className="mt-1 text-2xl font-semibold text-red-600">
                      {comparison.diff.stats.removedLines}
                    </dd>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50">
                  <CardContent className="p-4">
                    <dt className="text-sm font-medium text-blue-800">Change Percentage</dt>
                    <dd className="mt-1 text-2xl font-semibold text-blue-600">
                      {comparison.diff.stats.changePercentage.toFixed(1)}%
                    </dd>
                  </CardContent>
                </Card>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
} 