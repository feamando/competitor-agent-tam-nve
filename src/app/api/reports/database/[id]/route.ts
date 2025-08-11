import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentProfileId } from '@/lib/profile/profileUtils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const reportId = (await context.params).id;

    // Get current profile ID for access control
    const currentProfileId = await getCurrentProfileId();

    // Get report with profile access control - only allow download if user owns the project
    const report = await prisma.report.findFirst({
      where: { 
        id: reportId,
        project: {
          profileId: currentProfileId
        }
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
        competitor: true,
        project: {
          include: {
            profile: true // Include profile for verification
          }
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    const latestVersion = report.versions[0];
    if (!latestVersion) {
      return NextResponse.json(
        { error: 'No report content found' },
        { status: 404 }
      );
    }

    // Convert report data to markdown
    const markdown = convertReportToMarkdown(report, latestVersion.content);

    // Create filename
    const projectName = report.project?.name || 'unknown-project';
    const timestamp = report.createdAt.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filename = `${projectName}_${timestamp}.md`;

    // Return as downloadable file
    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Database report download error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function convertReportToMarkdown(report: any, content: any): string {
  const data = content as any;
  
  let markdown = `# ${data.title || report.title || report.name}\n\n`;
  
  if (data.description) {
    markdown += `${data.description}\n\n`;
  }

  // Add metadata
  markdown += `## Report Details\n\n`;
  markdown += `- **Project**: ${report.project?.name || 'Unknown'}\n`;
  
  // Handle both individual competitor reports and comparative reports
  if (report.competitor) {
    markdown += `- **Competitor**: ${report.competitor.name}\n`;
    markdown += `- **Website**: ${data.metadata?.competitor?.url || report.competitor.website}\n`;
  } else {
    // This is likely a comparative report
    markdown += `- **Report Type**: Comparative Analysis\n`;
    if (data.metadata?.competitor?.url) {
      markdown += `- **Website**: ${data.metadata.competitor.url}\n`;
    }
  }
  if (data.metadata?.dateRange) {
    markdown += `- **Analysis Period**: ${new Date(data.metadata.dateRange.start).toLocaleDateString()} - ${new Date(data.metadata.dateRange.end).toLocaleDateString()}\n`;
  }
  if (data.metadata?.analysisCount) {
    markdown += `- **Data Points Analyzed**: ${data.metadata.analysisCount}\n`;
  }
  if (data.metadata?.significantChanges) {
    markdown += `- **Significant Changes**: ${data.metadata.significantChanges}\n`;
  }
  markdown += `- **Generated**: ${report.createdAt.toLocaleString()}\n`;
  markdown += `- **Status**: ${report.status}\n\n`;

  // Add sections
  if (data.sections && Array.isArray(data.sections)) {
    const sortedSections = data.sections.sort((a: any, b: any) => a.order - b.order);
    for (const section of sortedSections) {
      markdown += `## ${section.title}\n\n`;
      markdown += `${section.content}\n\n`;
    }
  }

  // Add footer
  markdown += `---\n\n`;
  markdown += `*This report was generated automatically by the Competitor Research Agent.*\n`;
  markdown += `*Report ID: ${report.id}*\n`;

  return markdown;
} 