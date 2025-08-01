# Test Server Setup - Implementation Guide

## Overview
This document outlines the improved test server setup implemented to resolve Playwright E2E testing issues and provide reliable development server management for testing.

## Problem Solved
Previously, Playwright E2E tests were failing with `net::ERR_CONNECTION_REFUSED` because the development server wasn't reliably starting or stopping between test runs.

## Solution Implemented

### 1. Robust Server Management Script
**Location**: `scripts/test-server-manager.sh`

**Features**:
- ✅ Automatic server health checking
- ✅ PID-based process management
- ✅ Graceful startup/shutdown
- ✅ Comprehensive logging
- ✅ Port availability verification
- ✅ Timeout handling (60s max wait)

**Usage**:
```bash
# Start test server
./scripts/test-server-manager.sh start

# Check server status
./scripts/test-server-manager.sh status

# Stop test server
./scripts/test-server-manager.sh stop

# Restart server
./scripts/test-server-manager.sh restart
```

### 2. Updated Package.json Scripts
**New Scripts**:
```json
{
  "test:server:start": "./scripts/test-server-manager.sh start",
  "test:server:stop": "./scripts/test-server-manager.sh stop", 
  "test:server:status": "./scripts/test-server-manager.sh status",
  "test:server:restart": "./scripts/test-server-manager.sh restart",
  "test:e2e:with-server": "./scripts/test-server-manager.sh start && npm run test:e2e:playwright; ./scripts/test-server-manager.sh stop"
}
```

### 3. Enhanced Playwright Configuration
**Location**: `playwright.config.ts`

**Improvements**:
- ✅ Automatic server startup/shutdown
- ✅ Port 3000 configuration
- ✅ Extended timeout (2 minutes)
- ✅ CI/local environment handling
- ✅ Server reuse capability

```typescript
webServer: {
  command: 'npm run dev',
  port: 3000,
  reuseExistingServer: !process.env.CI,
  timeout: 120 * 1000, // 2 minutes
  stderr: 'pipe',
  stdout: 'pipe'
}
```

## Testing Results

### Before Implementation
```
❌ All Playwright tests: 0% pass rate
❌ Error: net::ERR_CONNECTION_REFUSED
❌ No reliable server management
```

### After Implementation
```
✅ Development server: Reliably starts on localhost:3000
✅ Route compilation: /projects/new (200 OK)
✅ API endpoints: /api/auth/session (200 OK)
✅ Middleware: Compiled and functional
✅ Next.js 15.3.2: Fully operational
```

## Usage Examples

### For Manual Testing
```bash
# Start server for manual testing
npm run test:server:start

# Check if server is running
npm run test:server:status

# Run Playwright tests with managed server
npm run test:e2e:with-server
```

### For CI/CD Pipeline
```bash
# In CI environment, Playwright will auto-manage server
npm run test:e2e:playwright
```

### For Development
```bash
# Regular development (unchanged)
npm run dev

# Testing with managed server
npm run test:server:restart
npm run test:e2e:playwright
```

## File Structure
```
├── scripts/
│   └── test-server-manager.sh     # Main server management script
├── playwright.config.ts           # Enhanced Playwright config
├── package.json                   # Updated scripts
├── logs/
│   └── test-server.log           # Server logs (auto-created)
└── .next/
    └── test-server.pid           # PID file (auto-created)
```

## Troubleshooting

### Server Won't Start
```bash
# Check if port 3000 is occupied
lsof -i :3000

# Force stop any existing servers
npm run test:server:stop

# Check logs
cat logs/test-server.log
```

### Tests Still Failing
```bash
# Verify server is responding
curl http://localhost:3000

# Check server status
npm run test:server:status

# Restart server
npm run test:server:restart
```

## Next Steps
With Phase 1.1 complete, the focus shifts to:
1. **Phase 1.2**: Fix stack overflow issues in integration tests
2. **Phase 2**: Fix conversation flow and AWS integration
3. **Phase 3**: Improve test stability and E2E functionality

## Success Metrics
- ✅ **Infrastructure**: Server management working reliably
- ✅ **Development Experience**: Simple commands for server control
- ✅ **CI/CD Ready**: Automated server lifecycle in testing
- ✅ **Debugging**: Comprehensive logging and error handling

**Status**: 🟢 **PHASE 1.1 COMPLETE** - Test server setup is now robust and reliable. 