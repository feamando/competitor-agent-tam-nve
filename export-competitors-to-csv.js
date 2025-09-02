const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportCompetitorsToCSV() {
  try {
    console.log('🔄 Exporting competitors to CSV backup...');
    
    // Get all competitors from database
    const competitors = await prisma.competitor.findMany({
      orderBy: { createdAt: 'asc' }
    });
    
    if (competitors.length === 0) {
      console.log('❌ No competitors found in database');
      return;
    }
    
    // Create CSV header
    const csvHeader = 'id,name,website,industry,description,employeeCount,revenue,founded,headquarters,socialMedia,createdAt,updatedAt\n';
    
    // Convert competitors to CSV rows
    const csvRows = competitors.map(comp => {
      const escapeCsvField = (field) => {
        if (!field) return '';
        const str = String(field);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      return [
        comp.id,
        escapeCsvField(comp.name),
        escapeCsvField(comp.website),
        escapeCsvField(comp.industry),
        escapeCsvField(comp.description),
        comp.employeeCount || '',
        comp.revenue || '',
        comp.founded || '',
        escapeCsvField(comp.headquarters),
        escapeCsvField(comp.socialMedia ? JSON.stringify(comp.socialMedia) : ''),
        comp.createdAt.toISOString(),
        comp.updatedAt.toISOString()
      ].join(',');
    }).join('\n');
    
    // Write to CSV file
    const csvContent = csvHeader + csvRows;
    const backupDir = path.join(__dirname, 'backups');
    
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(backupDir, `competitors-backup-${timestamp}.csv`);
    
    fs.writeFileSync(csvPath, csvContent, 'utf8');
    
    // Also create/update the latest backup
    const latestCsvPath = path.join(__dirname, 'competitors-backup.csv');
    fs.writeFileSync(latestCsvPath, csvContent, 'utf8');
    
    console.log(`✅ Successfully exported ${competitors.length} competitors to CSV`);
    console.log(`📁 Timestamped backup: ${csvPath}`);
    console.log(`📁 Latest backup: ${latestCsvPath}`);
    
    // Display summary
    console.log('\n📊 EXPORTED COMPETITORS:');
    competitors.forEach((comp, index) => {
      console.log(`  ${index + 1}. ${comp.name} - ${comp.website} (${comp.industry})`);
    });
    
  } catch (error) {
    console.error('❌ Error exporting competitors:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the export
exportCompetitorsToCSV();
