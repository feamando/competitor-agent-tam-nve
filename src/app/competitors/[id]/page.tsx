import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { SnapshotSection } from '@/components/competitors/SnapshotSection';
import DeleteCompetitorButton from '@/components/competitors/DeleteCompetitorButton';
import { 
  logger, 
  generateCorrelationId, 
  trackDatabaseOperation,
  trackCorrelation 
} from '@/lib/logger';

interface CompetitorPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CompetitorPage({ params }: CompetitorPageProps) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const context = {
    page: `/competitors/${id}`,
    correlationId,
    competitorId: id
  };

  try {
    trackCorrelation(correlationId, 'competitor_page_load_started', context);
    logger.info('Loading competitor page', context);

    trackDatabaseOperation('findUnique', 'competitor', {
      ...context,
      query: 'fetch competitor with snapshots for page view'
    });

    const competitor = await prisma.competitor.findUnique({
      where: {
        id: id,
      },
      include: {
        snapshots: {
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
          take: 20 // Limit to recent snapshots for performance
        },
        reports: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5 // Show recent reports
        }
      },
    });

    if (!competitor) {
      trackCorrelation(correlationId, 'competitor_not_found', context);
      logger.warn('Competitor not found for page view', context);
      return notFound();
    }

    trackCorrelation(correlationId, 'competitor_page_loaded', {
      ...context,
      competitorName: competitor.name,
      snapshotsCount: competitor.snapshots.length,
      reportsCount: competitor.reports.length
    });

    trackDatabaseOperation('findUnique', 'competitor', {
      ...context,
      success: true,
      recordData: {
        name: competitor.name,
        snapshotsCount: competitor.snapshots.length,
        reportsCount: competitor.reports.length
      }
    });

    logger.info('Competitor page loaded successfully', {
      ...context,
      competitorName: competitor.name,
      snapshotsCount: competitor.snapshots.length,
      reportsCount: competitor.reports.length
    });

    return (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between md:space-x-4 xl:border-b xl:pb-6">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{competitor.name}</h1>
            <p className="mt-2 text-sm text-gray-700">
              <a
                href={competitor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-500"
              >
                {competitor.website}
              </a>
            </p>
            {competitor.description && (
              <p className="mt-1 text-sm text-gray-500">{competitor.description}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
              {competitor.industry && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {competitor.industry}
                </span>
              )}
              {competitor.employeeCount && (
                <span>{competitor.employeeCount.toLocaleString()} employees</span>
              )}
              {competitor.revenue && (
                <span>${(competitor.revenue / 1000000).toFixed(1)}M revenue</span>
              )}
              {competitor.founded && (
                <span>Founded {competitor.founded}</span>
              )}
              {competitor.headquarters && (
                <span>{competitor.headquarters}</span>
              )}
            </div>
            <div className="mt-2 text-sm text-gray-500">
              <span>{competitor.snapshots.length} snapshots</span>
              <span className="mx-2">•</span>
              <span>{competitor.reports.length} reports</span>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mt-6 md:mt-0 md:ml-4 flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <DeleteCompetitorButton
              competitorId={competitor.id}
              competitorName={competitor.name}
              className="sm:w-auto"
            />
          </div>
        </div>

        <div className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Snapshots Section */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Snapshots</h2>
              <SnapshotSection
                competitorId={competitor.id}
                snapshots={competitor.snapshots}
                correlationId={correlationId}
              />
            </div>

            {/* Reports Section */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Reports</h2>
              {competitor.reports.length > 0 ? (
                <div className="space-y-3">
                  {competitor.reports.map((report) => (
                    <div key={report.id} className="border rounded-lg p-4">
                      <h3 className="font-medium text-gray-900">{report.name}</h3>
                      <p className="text-sm text-gray-500">
                        Created {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No reports generated yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );

  } catch (error) {
    trackCorrelation(correlationId, 'competitor_page_error', {
      ...context,
      errorMessage: (error as Error).message
    });

    logger.error('Failed to load competitor page', error as Error, context);

    // Return a user-friendly error page
    return (
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Error Loading Competitor</h1>
          <p className="mt-2 text-gray-600">
            There was an error loading the competitor details. Please try again later.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Error ID: {correlationId}
          </p>
        </div>
      </div>
    );
  }
} 