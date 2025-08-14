/**
 * TP-028 Option A Data Migration Script
 * Populates normalizedWebsite field for existing competitors
 */

import { PrismaClient } from '@prisma/client';
import { WebsiteNormalizationService } from '../src/lib/competitors/websiteNormalization';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting TP-028 Option A data migration...');
  console.log('📝 Populating normalizedWebsite field for existing competitors');
  
  try {
    // Get all competitors that don't have normalizedWebsite set
    const competitorsToUpdate = await prisma.competitor.findMany({
      where: {
        normalizedWebsite: null
      },
      select: {
        id: true,
        name: true,
        website: true
      }
    });
    
    console.log(`📊 Found ${competitorsToUpdate.length} competitors to update`);
    
    if (competitorsToUpdate.length === 0) {
      console.log('✅ No competitors need updating - migration complete!');
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process competitors in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < competitorsToUpdate.length; i += batchSize) {
      const batch = competitorsToUpdate.slice(i, i + batchSize);
      
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(competitorsToUpdate.length / batchSize)}...`);
      
      const updatePromises = batch.map(async (competitor) => {
        try {
          const normalizedWebsite = WebsiteNormalizationService.normalizeWithFallback(
            competitor.website,
            competitor.name
          );
          
          await prisma.competitor.update({
            where: { id: competitor.id },
            data: { normalizedWebsite }
          });
          
          console.log(`  ✅ Updated ${competitor.name}: ${competitor.website} → ${normalizedWebsite}`);
          return { success: true, competitor };
        } catch (error) {
          console.error(`  ❌ Failed to update ${competitor.name}:`, error);
          return { success: false, competitor, error };
        }
      });
      
      const results = await Promise.all(updatePromises);
      
      results.forEach(result => {
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📈 Migration Summary:');
    console.log(`  ✅ Successfully updated: ${successCount} competitors`);
    console.log(`  ❌ Failed to update: ${errorCount} competitors`);
    console.log(`  📊 Total processed: ${competitorsToUpdate.length} competitors`);
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some competitors failed to update. Check the errors above.');
      process.exit(1);
    } else {
      console.log('\n🎉 TP-028 Option A data migration completed successfully!');
    }
    
  } catch (error) {
    console.error('💥 Migration failed with error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle script interruption gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Migration interrupted by user');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Migration terminated');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the migration
main().catch(async (error) => {
  console.error('💥 Unhandled error in migration:', error);
  await prisma.$disconnect();
  process.exit(1);
});
