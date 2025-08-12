// Quick test script for TP-027 implementation
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000/api';

async function testCompetitorSelection() {
  console.log('🧪 Testing TP-027 Competitor Selection Implementation\n');

  // Test 1: Create project with specific competitors
  console.log('Test 1: Create project with specific competitors...');
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TP-027 Test Project',
        description: 'Testing selective competitor assignment',
        competitors: ['Microsoft', 'Google'] // User-specified competitors
      })
    });

    if (response.ok) {
      const project = await response.json();
      console.log('✅ Project created with user-specified competitors');
      console.log(`   Project ID: ${project.id}`);
      console.log(`   Competitors: ${project.competitors?.length || 0} assigned`);
      console.log(`   Selection method: ${project.parameters?.competitorSelectionMethod || 'unknown'}`);
    } else {
      const error = await response.json();
      console.log('❌ Failed to create project with specific competitors');
      console.log(`   Error: ${error.error}`);
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }

  console.log('');

  // Test 2: Create project with competitor IDs
  console.log('Test 2: Create project with competitor IDs...');
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TP-027 Test Project with IDs',
        description: 'Testing competitor ID assignment',
        competitorIds: ['some-id-1', 'some-id-2'] // Pre-resolved IDs
      })
    });

    if (response.ok) {
      const project = await response.json();
      console.log('✅ Project created with competitor IDs');
      console.log(`   Project ID: ${project.id}`);
      console.log(`   Competitors: ${project.competitors?.length || 0} assigned`);
    } else {
      const error = await response.json();
      console.log('⚠️  Failed to create project with IDs (expected if IDs don\'t exist)');
      console.log(`   Error: ${error.error}`);
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }

  console.log('');

  // Test 3: Create project without competitors (fallback test)
  console.log('Test 3: Create project without competitors (fallback)...');
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TP-027 Fallback Test Project',
        description: 'Testing auto-assignment fallback'
        // No competitors specified - should fallback to all
      })
    });

    if (response.ok) {
      const project = await response.json();
      console.log('✅ Project created with fallback auto-assignment');
      console.log(`   Project ID: ${project.id}`);
      console.log(`   Competitors: ${project.competitors?.length || 0} assigned`);
      console.log(`   Selection method: ${project.parameters?.competitorSelectionMethod || 'unknown'}`);
    } else {
      const error = await response.json();
      console.log('❌ Failed to create fallback project');
      console.log(`   Error: ${error.error}`);
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }

  console.log('\n🏁 TP-027 Test Complete');
}

// Run tests if server is available
testCompetitorSelection().catch(console.error);
