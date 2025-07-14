/**
 * Global Test Setup - Phase 2 Performance Optimization
 * Minimal global setup for fast test execution
 */

module.exports = async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  
  // Fix 1.2: AWS Credential Database Setup
  // Set test database URL (SQLite for fast tests)
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:./test.db';
  }
  
  // Disable console output for performance (except errors)
  if (!process.env.VERBOSE_TESTS) {
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};
  }
  
  // Create test directories if they don't exist
  const fs = require('fs');
  const path = require('path');
  
  const testDirs = [
    'test-reports',
    'test-reports/screenshots',
    'test-reports/artifacts'
  ];
  
  testDirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
  
  // Fix 1.2: Initialize test database
  try {
    const { execSync } = require('child_process');
    
    // Generate Prisma client if not exists
    try {
      execSync('npx prisma generate', { stdio: 'pipe' });
    } catch (e) {
      // Client might already exist
    }
    
    // Create test database schema
    execSync('npx prisma db push --force-reset --accept-data-loss', { 
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
    
    console.error('✅ Test database initialized');
  } catch (error) {
    console.error('⚠️ Test database setup failed:', error.message);
    // Continue with tests even if DB setup fails
  }
  
  console.error('✅ Global test setup complete - Phase 2 optimized');
}; 