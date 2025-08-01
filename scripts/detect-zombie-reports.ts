#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function detectZombieReports() {
  console.log('🔍 Detecting zombie reports...');
  
  try {
    const zombieReports = await prisma.report.findMany({
      where: {
        status: 'COMPLETED',
        versions: { none: {} }
      },
      include: { 
        project: true,
        versions: true
      }
    });

    console.log(`\n📊 Found ${zombieReports.length} zombie reports:`);
    
    if (zombieReports.length === 0) {
      console.log('✅ No zombie reports detected!');
    } else {
      console.log('\n🧟 Zombie Reports Details:');
      console.log('=' .repeat(60));
      
      zombieReports.forEach((report, index) => {
        console.log(`\n${index + 1}. Report ID: ${report.id}`);
        console.log(`   Name: ${report.name}`);
        console.log(`   Status: ${report.status}`);
        console.log(`   Created: ${report.createdAt}`);
        console.log(`   Project: ${report.project?.name || 'Unknown'}`);
        console.log(`   ReportVersions: ${report.versions.length}`);
      });
      
      console.log('\n⚠️  These reports are unviewable despite showing as COMPLETED');
    }
    
    return zombieReports;
  } catch (error) {
    console.error('❌ Error detecting zombie reports:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  detectZombieReports().catch(console.error);
}

export { detectZombieReports }; 