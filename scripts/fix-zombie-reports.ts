#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface EmergencyReportContent {
  title: string;
  summary: string;
  analysis: {
    competitive_landscape: string;
    key_findings: string[];
    recommendations: string[];
  };
  metadata: {
    generation_type: string;
    timestamp: string;
    status: string;
  };
}

async function createEmergencyContent(reportId: string, reportName: string): Promise<EmergencyReportContent> {
  return {
    title: reportName,
    summary: "This is an emergency fallback report generated to restore access to previously inaccessible content. The original report generation encountered technical issues, and this content serves as a placeholder while the full analysis is recovered.",
    analysis: {
      competitive_landscape: "Emergency report - detailed competitive analysis is being recovered. Please check back for the complete analysis or contact support for assistance.",
      key_findings: [
        "This report was generated as an emergency fallback",
        "Original content may be recoverable through system restoration",
        "Contact technical support for full report recovery"
      ],
      recommendations: [
        "Review system logs for original report generation errors",
        "Implement monitoring to prevent similar issues",
        "Consider regenerating the full report if source data is available"
      ]
    },
    metadata: {
      generation_type: "emergency_fallback_recovery",
      timestamp: new Date().toISOString(),
      status: "emergency_content"
    }
  };
}

async function fixSpecificZombieReport(reportId: string) {
  console.log(`🔧 Fixing zombie report: ${reportId}`);
  
  try {
    // Get the report details
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { project: true, versions: true }
    });

    if (!report) {
      console.log(`❌ Report ${reportId} not found`);
      return;
    }

    if (report.versions.length > 0) {
      console.log(`✅ Report ${reportId} already has ReportVersions - not a zombie`);
      return;
    }

    console.log(`📝 Creating emergency ReportVersion for: ${report.name}`);
    
    // Create emergency content
    const emergencyContent = await createEmergencyContent(reportId, report.name || 'Emergency Report');
    
    // Create ReportVersion in a transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      const reportVersion = await tx.reportVersion.create({
        data: {
          reportId: reportId,
          version: 1,
          content: emergencyContent as any,
        },
      });
      
      console.log(`✅ Created ReportVersion for report ${reportId}`);
      return reportVersion;
    });

    console.log(`🎉 Successfully fixed zombie report ${reportId}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Error fixing zombie report ${reportId}:`, error);
    throw error;
  }
}

async function fixAllZombieReports() {
  console.log('🔧 Fixing all zombie reports...');
  
  try {
    // Find all zombie reports
    const zombieReports = await prisma.report.findMany({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      },
      include: { project: true }
    });

    console.log(`Found ${zombieReports.length} zombie reports to fix`);
    
    for (const report of zombieReports) {
      await fixSpecificZombieReport(report.id);
    }
    
    console.log(`🎉 Successfully fixed ${zombieReports.length} zombie reports`);
    
  } catch (error) {
    console.error('❌ Error fixing zombie reports:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 1 && args[0]) {
    // Fix specific report
    await fixSpecificZombieReport(args[0]);
  } else {
    // Fix all zombie reports
    await fixAllZombieReports();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { fixSpecificZombieReport, fixAllZombieReports }; 