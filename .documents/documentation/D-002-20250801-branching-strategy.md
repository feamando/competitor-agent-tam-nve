# Branching Strategy - Competitor Research Agent

## 📋 Overview

This document outlines the branching strategy implemented on **June 6, 2025** to organize development work and maintain code stability across different feature sets and experimental implementations.

## 🌿 Branch Structure

### **Two-Branch System**

```
┌─────────────┐    ┌─────────────────────────────┐
│ stable-main │    │           main              │
│   🔒 Stable │    │    🚀 Current Development   │
│  June 5th   │    │  + 🧪 Observability Merged │
│  Baseline   │    │        June 6th            │
└─────────────┘    └─────────────────────────────┘
```

## 🎯 Branch Purposes

### **stable-main** 
- **Commit Hash**: `9595d8c`
- **Date**: June 5, 2025
- **Purpose**: Production-ready baseline with core functionality
- **Contents**:
  ✅ Core competitor research features
  ✅ Real web scraping with Puppeteer
  ✅ AI-powered analysis with AWS Bedrock
  ✅ Project management system
  ✅ Chat interface for project creation
  ✅ Comprehensive report generation
  ✅ Database and file storage systems

### **main**
- **Purpose**: Active development branch with all latest features including observability
- **Contents**: Everything in `stable-main` plus:
  ✅ Frequency-based scraping implementation
  ✅ Enhanced test suites and bug fixes
  ✅ Improved documentation
  ✅ Performance optimizations
  ✅ Additional API endpoints
  ✅ **Comprehensive observability system** (merged June 6, 2025)
  ✅ Custom React hooks for monitoring
  ✅ Error boundaries with user-friendly handling
  ✅ Correlation ID tracking
  ✅ Performance analytics
  ✅ User journey tracking
  ✅ 44-test comprehensive test suite

## 🔄 Workflow Patterns

### **For Production Deployments**
```bash
# Use stable-main for production
git checkout stable-main
git pull origin stable-main
npm install
npm run build
npm start
```

### **For Feature Development**
```bash
# Branch from main for new features
git checkout main
git pull origin main
git checkout -b feature/new-feature-name

# Develop feature
# Test thoroughly
# Create PR to main
```

### **For Critical Fixes**
```bash
# Branch from stable-main for urgent fixes
git checkout stable-main
git pull origin stable-main
git checkout -b hotfix/critical-fix

# Apply minimal fix
# Test thoroughly
# Create PR to stable-main
# Cherry-pick to main if needed
```

### **For Observability Features**
```bash
# Use advanced monitoring features (now in main)
git checkout main
git pull origin main
npm install
npm run test
npm run dev
```

## 🎯 Use Case Decision Matrix

| Scenario | Branch Choice | Reasoning |
|----------|---------------|-----------|
| **Production Deployment** | `stable-main` | Proven stability, minimal risk |
| **New Feature Development** | `main` | Latest features, good test coverage |
| **Critical Bug Fix** | `stable-main` | Minimal changes, focused fixes |
| **Observability Features** | `main` | Access to all monitoring features |
| **Integration Testing** | `main` | Full feature set including observability |
| **Experimental Features** | `main` | All features are now production-ready |
| **Client Demos** | `main` | Latest stable features |
| **Long-term Maintenance** | `stable-main` | Minimal complexity |

## 📈 Merge Strategy

### **Merging Rules**
1. **stable-main** ← hotfixes only
2. **main** ← feature branches + cherry-picked hotfixes (includes observability)

### **No Direct Merges**
- All changes go through Pull Requests
- Require code review before merging
- Run full test suite before merge
- Update documentation as needed

## 🧪 Observability Implementation (Merged to Main)

### **What's Now in Main**
The observability implementation has been merged into main and contains:

#### **Files Added**
- `src/hooks/useObservability.ts` - Custom React hook
- `src/components/ErrorBoundary.tsx` - Error boundary component
- `src/lib/observability.ts` - Advanced utilities
- `src/__tests__/unit/observability.test.ts` - Test suite (44 tests)
- `OBSERVABILITY_IMPLEMENTATION.md` - Documentation

#### **Files Enhanced**
- `src/app/reports/page.tsx` - Reports list with tracking
- `src/app/reports/[id]/page.tsx` - Report viewer monitoring
- `src/components/reports/ReportViewer.tsx` - Component observability
- `src/app/api/reports/list/route.ts` - API logging

#### **Features Implemented**
- ✅ Correlation ID tracking across all requests
- ✅ Performance monitoring (page load, API calls, rendering)
- ✅ User interaction tracking (clicks, navigation, downloads)
- ✅ Error tracking with React Error Boundaries
- ✅ User journey analytics with step-by-step tracking
- ✅ Session summaries with performance metrics

## 🔧 Development Guidelines

### **Branch Selection for New Work**

#### **Choose `stable-main` when:**
- Fixing critical production bugs
- Making minimal, low-risk changes
- Working on long-term maintenance
- Need maximum stability

#### **Choose `main` when:**
- Developing new features
- Need latest functionality
- Building on recent improvements
- Standard development work

#### **Choose `main` for observability when:**
- Using monitoring features (now included)
- Implementing monitoring enhancements
- Working with user analytics
- Need advanced error tracking

### **Code Quality Standards**
All branches maintain the same quality standards:
- TypeScript strict mode compliance
- Comprehensive test coverage
- ESLint/Prettier formatting
- Proper error handling
- Documentation updates

## 📊 Branch Comparison

| Feature | stable-main | main |
|---------|-------------|------|
| **Web Scraping** | ✅ Basic | ✅ Enhanced |
| **AI Analysis** | ✅ Core | ✅ Improved |
| **Project Management** | ✅ Basic | ✅ Enhanced |
| **Frequency Scraping** | ❌ | ✅ |
| **Enhanced Testing** | ❌ | ✅ |
| **Observability** | ❌ | ✅ |
| **Error Boundaries** | ❌ | ✅ |
| **Performance Monitoring** | ❌ | ✅ |
| **User Journey Tracking** | ❌ | ✅ |

## 🚀 Future Branch Plans

### **Potential Merges**
1. **✅ 20250606 → main**: Completed June 6, 2025
2. **main → stable-main**: Periodic stable releases (future)
3. **New feature branches**: For future development

### **Branch Lifecycle**
- **stable-main**: Permanent baseline
- **main**: Continuously evolving with full feature set
- **Feature branches**: Created as needed for new development

## 📝 Documentation Updates

When working with branches, update relevant documentation:
- Update README.md for user-facing changes
- Update BRANCHING_STRATEGY.md for workflow changes
- Update API documentation for new endpoints
- Update OBSERVABILITY_IMPLEMENTATION.md for monitoring changes

## 🔍 Monitoring Branch Health

### **Health Indicators**
- All tests passing
- No linting errors
- Documentation up to date
- Performance benchmarks met
- Security scans clean

### **Branch Status Tracking**
Regular monitoring ensures branch quality:
- Daily automated test runs
- Weekly security scans
- Monthly performance reviews
- Quarterly branch strategy reviews

---

**Last Updated**: June 6, 2025  
**Document Version**: 2.0 (Updated after 20250606 merge)  
**Merge Completed**: June 6, 2025 - Observability implementation merged to main  
**Next Review**: July 6, 2025 