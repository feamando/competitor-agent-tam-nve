const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (j + 1 < line.length && line[j + 1] === '"') {
          current += '"';
          j++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });
    data.push(row);
  }
  
  return data;
}

async function restoreCompetitorsFromCSV(options = {}) {
  try {
    const { clearExisting = false, csvFile = 'competitors-backup.csv' } = options;
    
    console.log('🔄 Restoring competitors from CSV backup...');
    
    // Read CSV file
    const csvPath = path.join(__dirname, csvFile);
    if (!fs.existsSync(csvPath)) {
      console.log(`❌ CSV file not found: ${csvPath}`);
      console.log('💡 Run export-competitors-to-csv.js first to create a backup');
      return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const competitorsData = await parseCSV(csvContent);
    
    if (competitorsData.length === 0) {
      console.log('❌ No competitors found in CSV file');
      return;
    }
    
    console.log(`📊 Found ${competitorsData.length} competitors in CSV backup`);
    
    // Clear existing competitors if requested
    if (clearExisting) {
      console.log('🗑️  Clearing existing competitors...');
      const deletedCount = await prisma.competitor.deleteMany();
      console.log(`✅ Deleted ${deletedCount.count} existing competitors`);
    }
    
    // Get existing competitors to avoid duplicates
    const existingCompetitors = await prisma.competitor.findMany({
      select: { name: true, website: true }
    });
    const existingSet = new Set(
      existingCompetitors.map(c => `${c.name}|${c.website}`)
    );
    
    // Restore competitors
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const compData of competitorsData) {
      const competitorKey = `${compData.name}|${compData.website}`;
      
      if (existingSet.has(competitorKey) && !clearExisting) {
        console.log(`⏭️  Skipping existing: ${compData.name}`);
        skippedCount++;
        continue;
      }
      
      try {
        // Parse JSON fields
        let socialMedia = null;
        if (compData.socialMedia && compData.socialMedia !== '') {
          try {
            socialMedia = JSON.parse(compData.socialMedia);
          } catch (e) {
            console.log(`⚠️  Invalid JSON for socialMedia of ${compData.name}`);
          }
        }
        
        await prisma.competitor.create({
          data: {
            name: compData.name,
            website: compData.website,
            industry: compData.industry || null,
            description: compData.description || null,
            employeeCount: compData.employeeCount ? parseInt(compData.employeeCount) : null,
            revenue: compData.revenue ? parseFloat(compData.revenue) : null,
            founded: compData.founded ? parseInt(compData.founded) : null,
            headquarters: compData.headquarters || null,
            socialMedia: socialMedia
          }
        });
        
        console.log(`✅ Added: ${compData.name} - ${compData.website}`);
        addedCount++;
        
      } catch (error) {
        console.error(`❌ Error adding ${compData.name}:`, error.message);
      }
    }
    
    console.log('\n🎉 RESTORATION COMPLETE!');
    console.log(`✅ Added: ${addedCount} competitors`);
    console.log(`⏭️  Skipped: ${skippedCount} competitors (already exist)`);
    console.log(`📊 Total in backup: ${competitorsData.length} competitors`);
    
  } catch (error) {
    console.error('❌ Error restoring competitors:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const clearExisting = args.includes('--clear');
const csvFileArg = args.find(arg => arg.startsWith('--file='));
const csvFile = csvFileArg ? csvFileArg.replace('--file=', '') : 'competitors-backup.csv';

console.log('🚀 COMPETITOR CSV RESTORATION TOOL');
console.log('================================');
if (clearExisting) {
  console.log('⚠️  WARNING: Will clear all existing competitors first!');
}
console.log(`📁 Using CSV file: ${csvFile}`);
console.log('');

// Run the restoration
restoreCompetitorsFromCSV({ clearExisting, csvFile });
