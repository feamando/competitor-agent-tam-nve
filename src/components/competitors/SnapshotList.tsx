'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Snapshot {
  id: string;
  url: string;
  title: string;
  timestamp: string;
  statusCode: number;
}

interface SnapshotListProps {
  competitorId: string;
  snapshots: Snapshot[];
}

export function SnapshotList({ competitorId, snapshots }: SnapshotListProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takeSnapshot = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/competitors/${competitorId}/snapshot`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to take snapshot');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">Website Snapshots</h2>
        <button
          onClick={takeSnapshot}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
        >
          {isLoading ? 'Taking Snapshot...' : 'Take Snapshot'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul role="list" className="divide-y divide-gray-200">
          {snapshots.length === 0 ? (
            <li className="px-6 py-4 text-sm text-gray-500">
              No snapshots taken yet
            </li>
          ) : (
            snapshots.map((snapshot) => (
              <li key={snapshot.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {snapshot.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      Status: {snapshot.statusCode} • Taken:{' '}
                      {new Date(snapshot.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/snapshots/${snapshot.id}`)}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
} 