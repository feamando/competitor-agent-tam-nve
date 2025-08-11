const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');

const prisma = new PrismaClient();

async function syncCompetitors(direction = 'db-to-csv') {
  try {
    console.log(`🔄 Syncing competitors: ${direction}`);
    
    if (direction === 'db-to-csv') {
      // Export current database to CSV
      console.log('📤 Exporting database to CSV...');
      execSync('node export-competitors-to-csv.js', { stdio: 'inherit' });
      
    } else if (direction === 'csv-to-db') {
      // Import CSV to database (without clearing)
      console.log('📥 Importing CSV to database...');
      execSync('node restore-competitors-from-csv.js', { stdio: 'inherit' });
      
    } else if (direction === 'csv-to-db-replace') {
      // Replace database with CSV data
      console.log('🔄 Replacing database with CSV data...');
      execSync('node restore-competitors-from-csv.js --clear', { stdio: 'inherit' });
      
    } else {
      console.log('❌ Invalid direction. Use: db-to-csv, csv-to-db, or csv-to-db-replace');
      return;
    }
    
    console.log('✅ Sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const direction = process.argv[2] || 'db-to-csv';

console.log('🔄 COMPETITOR SYNC TOOL');
console.log('=====================');
console.log('Available commands:');
console.log('  db-to-csv        - Export database to CSV (default)');
console.log('  csv-to-db        - Import CSV to database (add new)');
console.log('  csv-to-db-replace - Replace database with CSV data');
console.log('');

syncCompetitors(direction);
