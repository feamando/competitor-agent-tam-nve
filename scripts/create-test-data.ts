#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestData() {
  console.log('🔧 Creating test data for zombie report fix verification...');
  
  try {
    // 1. Create a test project
    const testProject = await prisma.project.create({
      data: {
        id: 'test-project-123',
        name: 'Test Project for Zombie Fix',
        description: 'Test project to verify zombie report fix implementation',
                  competitors: {
            create: [
              {
                id: 'competitor-1',
                name: 'Test Competitor 1',
                website: 'https://example1.com',
                industry: 'Technology'
              },
              {
                id: 'competitor-2', 
                name: 'Test Competitor 2',
                website: 'https://example2.com',
                industry: 'Technology'
              }
            ]
          }
      }
    });

    console.log('✅ Created test project:', testProject.id);

    // 2. Create a normal report with ReportVersion (should work)
    const normalReportId = 'normal-report-123';
    await prisma.$transaction(async (tx) => {
      await tx.report.create({
        data: {
          id: normalReportId,
          name: 'Normal Test Report',
          description: 'Normal report with ReportVersion',
          projectId: testProject.id,
          competitorId: 'competitor-1',
          status: 'COMPLETED'
        }
      });

      await tx.reportVersion.create({
        data: {
          reportId: normalReportId,
          version: 1,
          content: {
            title: 'Normal Test Report',
            summary: 'This is a normal report with proper ReportVersion',
            analysis: {
              competitive_landscape: 'Test analysis content',
              key_findings: ['Finding 1', 'Finding 2'],
              recommendations: ['Recommendation 1', 'Recommendation 2']
            }
          }
        }
      });
    });

    console.log('✅ Created normal report with ReportVersion:', normalReportId);

    // 3. Create an OLD-STYLE zombie report (without ReportVersion) to simulate the bug
    const zombieReportId = 'zombie-report-123';
    await prisma.report.create({
      data: {
        id: zombieReportId,
        name: 'Zombie Test Report (OLD BUG)',
        description: 'Report created without ReportVersion to simulate the old bug',
        projectId: testProject.id,
        competitorId: 'competitor-2',
        status: 'COMPLETED'
      }
    });
    
    console.log('✅ Created zombie report (no ReportVersion):', zombieReportId);

    console.log('\n📊 Test data summary:');
    console.log('- 1 Test Project with 2 competitors');
    console.log('- 1 Normal report (with ReportVersion)');
    console.log('- 1 Zombie report (without ReportVersion)');
    
    return {
      projectId: testProject.id,
      normalReportId,
      zombieReportId
    };

  } catch (error) {
    console.error('❌ Error creating test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  createTestData().catch(console.error);
}

export { createTestData }; 