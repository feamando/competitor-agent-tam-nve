'use client'

interface Snapshot {
  id: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

interface SnapshotSectionProps {
  competitorId: string;
  snapshots: Snapshot[];
  correlationId: string;
}

export function SnapshotSection({ competitorId, snapshots, correlationId }: SnapshotSectionProps) {
  const handleTakeSnapshot = () => {
    // TODO: Implement snapshot creation
    alert('Snapshot functionality will be implemented soon');
  };

  const handleViewSnapshot = (snapshotId: string) => {
    // TODO: Implement snapshot detail view
    alert('Snapshot details view will be implemented soon');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">Data Snapshots</h3>
        <button
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          onClick={handleTakeSnapshot}
        >
          Take Snapshot
        </button>
      </div>

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
                    <p className="text-sm font-medium text-gray-900">
                      Snapshot {snapshot.id.slice(-8)}
                    </p>
                    <p className="text-sm text-gray-500">
                      Taken: {new Date(snapshot.createdAt).toLocaleString()}
                    </p>
                    {snapshot.metadata && typeof snapshot.metadata === 'object' && (
                      <p className="text-xs text-gray-400 mt-1">
                        Data captured: {Object.keys(snapshot.metadata as Record<string, any>).length} fields
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <button
                      className="font-medium text-blue-600 hover:text-blue-500"
                      onClick={() => handleViewSnapshot(snapshot.id)}
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