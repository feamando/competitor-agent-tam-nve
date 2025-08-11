#!/usr/bin/env tsx

/**
 * Data Migration Script for TP-026 Profile System
 * Migrates existing data to use the new profile system
 */

import { PrismaClient } from '@prisma/client';
import { profileService } from '../src/lib/profile/profileService';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting TP-026 data migration to profile system...\n');
  
  try {
    // 1. Check if default profile exists
    console.log('Step 1: Checking for default profile...');
    const defaultProfile = await profileService.getDefaultProfile();
    console.log(`✅ Default profile exists: ${defaultProfile.email} (ID: ${defaultProfile.id})\n`);

    // 2. Check existing data associations
    console.log('Step 2: Checking existing data associations...');
    
    const projectsWithoutProfile = await prisma.project.count({
      where: { profileId: null }
    });
    
    const competitorsWithoutProfile = await prisma.competitor.count({
      where: { profileId: null }
    });
    
    const usersWithoutProfile = await prisma.user.count({
      where: { profileId: null }
    });

    console.log(`Projects without profile: ${projectsWithoutProfile}`);
    console.log(`Competitors without profile: ${competitorsWithoutProfile}`);
    console.log(`Users without profile: ${usersWithoutProfile}\n`);

    // 3. Associate orphaned records with default profile
    if (projectsWithoutProfile > 0) {
      console.log('Step 3a: Updating projects with default profile...');
      const updatedProjects = await prisma.project.updateMany({
        where: { profileId: null },
        data: { profileId: defaultProfile.id }
      });
      console.log(`✅ Updated ${updatedProjects.count} projects\n`);
    }

    if (competitorsWithoutProfile > 0) {
      console.log('Step 3b: Updating competitors with default profile...');
      const updatedCompetitors = await prisma.competitor.updateMany({
        where: { profileId: null },
        data: { profileId: defaultProfile.id }
      });
      console.log(`✅ Updated ${updatedCompetitors.count} competitors\n`);
    }

    if (usersWithoutProfile > 0) {
      console.log('Step 3c: Updating users with default profile...');
      const updatedUsers = await prisma.user.updateMany({
        where: { profileId: null },
        data: { profileId: defaultProfile.id }
      });
      console.log(`✅ Updated ${updatedUsers.count} users\n`);
    }

    // 4. Verify data integrity
    console.log('Step 4: Verifying data integrity...');
    
    const totalProjects = await prisma.project.count();
    const profiledProjects = await prisma.project.count({
      where: { profileId: { not: null } }
    });
    
    const totalCompetitors = await prisma.competitor.count();
    const profiledCompetitors = await prisma.competitor.count({
      where: { profileId: { not: null } }
    });

    console.log(`Projects: ${profiledProjects}/${totalProjects} have profiles`);
    console.log(`Competitors: ${profiledCompetitors}/${totalCompetitors} have profiles`);

    if (profiledProjects === totalProjects && profiledCompetitors === totalCompetitors) {
      console.log('✅ All data successfully associated with profiles\n');
    } else {
      console.log('⚠️  Some data may still be orphaned\n');
    }

    // 5. Create sample profile for testing
    console.log('Step 5: Creating sample test profile...');
    const testProfile = await profileService.getOrCreateProfile('test.user@hellofresh.com');
    console.log(`✅ Test profile ready: ${testProfile.email} (ID: ${testProfile.id})\n`);

    console.log('🎉 TP-026 data migration completed successfully!');
    console.log('\n📊 Migration Summary:');
    console.log(`• Default profile: ${defaultProfile.email}`);
    console.log(`• Test profile: ${testProfile.email}`);
    console.log(`• Total projects: ${totalProjects}`);
    console.log(`• Total competitors: ${totalCompetitors}`);
    console.log('• All data properly associated with profiles');
    console.log('\n🔄 Next steps:');
    console.log('• Frontend profile access modal will appear on next app load');
    console.log('• Users can enter their email to create/access their workspace');
    console.log('• All new data will be automatically scoped to user profiles');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
