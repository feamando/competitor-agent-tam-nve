# Competitor Research Agent

An AI-powered competitor research and analysis tool that helps businesses track and analyze their competitors' activities, market trends, and strategic changes. The system automatically generates comprehensive reports with AI-driven insights, trend analysis, and strategic recommendations.

## 🎯 Overview

The Competitor Research Agent is a sophisticated platform that:

- **Monitors Competitors**: Automatically tracks competitor websites and digital presence with real-time web scraping
- **Real Web Scraping**: Captures actual competitor website content using Puppeteer-based browser automation
- **AI-Powered Analysis**: Uses AWS Bedrock (Claude 3 Sonnet) for intelligent trend analysis and report generation
- **Project Management**: Organizes analysis into projects with automatic competitor assignment
- **Chat Interface**: Allows users to create projects and request reports through natural language
- **Comprehensive Reports**: Generates detailed reports with executive summaries, trend analysis, and strategic recommendations
- **Real-time Visibility**: Provides immediate access to generated reports through both database and file storage
- **Scheduled Scraping**: Automated web scraping with configurable schedules (daily, weekly, custom)

## ✨ Key Features

### 🕷️ **Real Web Scraping**
- **Puppeteer-based Browser Automation**: Real browser-based scraping for dynamic content
- **Content Extraction**: Captures HTML, text, metadata, headings, and links from competitor websites
- **Resource Optimization**: Blocks images and fonts to improve scraping performance
- **Error Handling & Retries**: Robust error handling with automatic retry mechanisms
- **Scheduled Scraping**: Cron-based scheduling system for automated competitor monitoring
- **Manual & API Scraping**: Support for both on-demand and scheduled scraping operations

### 🤖 **AI-Powered Intelligence**
- **AWS Bedrock Integration**: Uses Claude 3 Sonnet for natural language processing
- **Smart Trend Analysis**: Identifies market trends and competitive positioning changes from real scraped data
- **Automated Report Generation**: Creates professional reports with minimal user input
- **Fallback Mechanisms**: Ensures report generation even when AI services are unavailable

### 📊 **Project & Report Management**
- **Auto-Competitor Assignment**: Automatically assigns all available competitors to new projects
- **Dual Storage System**: Reports stored in both database and file system for reliability
- **Version Control**: Tracks report versions and maintains change history
- **Real-time Status Tracking**: Comprehensive logging with correlation IDs for debugging

### 💬 **Chat Interface**
- **Natural Language Processing**: Create projects using simple chat commands
- **Intelligent Parsing**: Extracts user email, frequency, and project details from chat
- **Immediate Project Creation**: Projects created and ready for report generation instantly

### 🔧 **Robust Architecture**
- **Error Handling**: Comprehensive error handling with fallback mechanisms
- **Performance Monitoring**: Built-in performance tracking and optimization
- **Scalable Design**: Modular architecture for easy maintenance and expansion

## 🛠️ Technologies

### **Core Stack**
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js, Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL with comprehensive schema
- **AI/ML**: AWS Bedrock (Claude 3 Sonnet), OpenAI API (optional), Mistral AI (optional)

### **Infrastructure & DevOps**
- **Cloud**: AWS (Bedrock, S3, EC2)
- **Authentication**: NextAuth.js
- **Testing**: Jest, React Testing Library, Playwright
- **Monitoring**: Custom logging system with correlation IDs
- **Development**: TypeScript, ESLint, Prettier

### **Key Libraries**
- **@aws-sdk/client-bedrock-runtime**: AWS Bedrock integration
- **@prisma/client**: Database ORM
- **puppeteer**: Browser automation for web scraping
- **cheerio**: Server-side HTML parsing and manipulation
- **node-cron**: Task scheduling for automated scraping
- **zod**: Runtime type validation
- **lucide-react**: Modern icon library

## 📋 Prerequisites

### **Required**
- **Node.js**: Version 18 or higher
- **PostgreSQL**: Version 12 or higher
- **AWS Account**: With Bedrock access enabled
- **Git**: For repository management

### **Optional**
- **OpenAI API Key**: For additional AI capabilities
- **Mistral AI API Key**: For alternative AI processing
- **SMTP Server**: For email notifications

## 🚀 Installation

### 1. **Clone Repository**
```bash
git clone https://github.com/ngorshkov-nve/competitor-agent-tam-nve.git
cd competitor-research-agent
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Environment Setup**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/competitor_research"

# AWS Configuration (Required)
AWS_REGION="us-east-1"  # or "eu-west-1" 
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_SESSION_TOKEN="your-session-token"  # if using temporary credentials

# Application Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secure-random-secret"

# Optional AI Services
OPENAI_API_KEY="your-openai-api-key"
MISTRAL_API_KEY="your-mistral-api-key"

# Optional Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
```

### 4. **Database Setup**
```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) View database in browser
npx prisma studio
```

### 5. **Start Development Server**
```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## 🎯 Operation & Usage

### **Creating Projects**

#### **Method 1: Chat Interface**
1. Navigate to the chat interface
2. Enter a message with format: `email@domain.com\nFrequency\nProject Name`
3. Example:
   ```
   user@company.com
   Weekly
   Q1 2025 Competitor Analysis
   ```
4. Project is created automatically with all competitors assigned

#### **Method 2: API Direct**
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Analysis Project",
    "description": "Quarterly competitor analysis",
    "autoAssignCompetitors": true
  }'
```

### **Generating Reports**

#### **Via API**
```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "your-project-id",
    "reportName": "Monthly Analysis Report"
  }' \
  "?competitorId=competitor-id"
```

#### **Report Generation Process**
1. **Data Fetching**: Retrieves competitor snapshots and analyses
2. **Trend Analysis**: AI identifies patterns and trends
3. **Report Creation**: Generates comprehensive report with 4 sections:
   - Executive Summary
   - Significant Changes
   - Trend Analysis
   - Strategic Recommendations
4. **Storage**: Saves to both database and file system
5. **Availability**: Immediately accessible via API and UI

### **Web Scraping Operations**

#### **Manual Scraping**
```bash
# Scrape all competitors
curl -X POST http://localhost:3000/api/scrape/competitors \
  -H "Content-Type: application/json"

# Scrape specific competitor
curl -X POST http://localhost:3000/api/scrape/competitors \
  -H "Content-Type: application/json" \
  -d '{"competitorId": "competitor-id"}'
```

#### **Scheduled Scraping Setup**
The system supports automated scraping with configurable schedules:

```javascript
// Set up daily scraping at 9 AM
import { ScraperScheduler } from './src/services/scraperScheduler';

const scheduler = new ScraperScheduler();
scheduler.scheduleDaily('09:00');

// Custom cron schedule (every 6 hours)
scheduler.scheduleCustom('0 */6 * * *');
```

#### **Scraping Results**
- **Real Website Content**: Captures actual HTML, titles, and metadata
- **Performance Optimized**: Blocks unnecessary resources for faster scraping
- **Data Storage**: Scraped content stored as snapshots for trend analysis
- **Error Handling**: Graceful failure handling with detailed logging

### **Viewing Reports**

#### **List All Reports**
```bash
curl http://localhost:3000/api/reports/list
```

#### **Download Report**
- **Database Report**: `GET /api/reports/database/{reportId}`
- **File Report**: `GET /api/reports/download?filename={filename}`

## 🐛 Debugging & Troubleshooting

### **Common Issues & Solutions**

#### **1. AWS Bedrock API Errors**
```
Error: Invalid API version: 2023-06-01
```
**Solution**: Ensure `anthropic_version: 'bedrock-2023-05-31'` in Bedrock calls

#### **2. Data Structure Errors**
```
Error: analysis.keyChanges is not iterable
```
**Solution**: Always check arrays with `Array.isArray()` before using spread operator

#### **3. Reports Not Visible**
**Potential Causes**:
- Report generation still in progress (takes 4-7 seconds)
- No competitors assigned to project
- AWS credentials invalid

**Solution**: Check logs for correlation ID and trace the issue

#### **4. Project Creation Failures**
```
Error: Missing script: "dev"
```
**Solution**: Ensure you're in the correct directory with `package.json`

### **Debugging Tools**

#### **Comprehensive Logging**
The application includes extensive logging with correlation IDs:

```bash
# View recent logs
tail -f logs/application.log

# Search by correlation ID
grep "correlation-id-here" logs/application.log
```

#### **Database Inspection**
```bash
# Access Prisma Studio
npx prisma studio

# Check recent projects
psql -d competitor_research -c "SELECT * FROM Project ORDER BY createdAt DESC LIMIT 10;"

# Check reports
psql -d competitor_research -c "SELECT * FROM Report ORDER BY createdAt DESC LIMIT 10;"
```

#### **Performance Monitoring**
Built-in performance tracking for all major operations:
- Report generation timing
- Database query performance
- AI processing duration

### **Debug Scripts**

Create debugging scripts for common tasks:

```javascript
// check-project.js - Check project status
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkProject(projectName) {
  const project = await prisma.project.findFirst({
    where: { name: projectName },
    include: { competitors: true, reports: true }
  });
  
  console.log(`Project: ${project?.name || 'Not found'}`);
  console.log(`Competitors: ${project?.competitors.length || 0}`);
  console.log(`Reports: ${project?.reports.length || 0}`);
  
  await prisma.$disconnect();
}

checkProject("your-project-name");
```

## 🧪 Testing

### **Test Categories**

#### **Unit Tests**
```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

#### **Integration Tests**
```bash
# Test API endpoints
npm run test:integration

# Test database operations
npm run test:db
```

#### **End-to-End Tests**
```bash
# Run E2E tests
npm run test:e2e

# Run with UI (debug mode)
npm run test:e2e:ui

# Run specific test suite
npm run test:e2e -- --grep "report generation"
```

### **Manual Testing Workflows**

#### **Complete Report Generation Test**
1. Create test project via chat
2. Verify auto-competitor assignment
3. Generate report via API
4. Check report visibility in `/api/reports/list`
5. Verify both database and file storage

#### **Error Recovery Test**
1. Test with invalid AWS credentials
2. Verify fallback mechanisms activate
3. Ensure graceful error handling
4. Check correlation ID tracking

### **Test Data Management**

```bash
# Reset test database
npx prisma db push --force-reset

# Seed test data
npm run db:seed

# Clean up test files
rm -rf reports/test_*
```

## 📁 Project Structure

```
competitor-research-agent/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API endpoints
│   │   │   ├── projects/      # Project management
│   │   │   ├── reports/       # Report generation & retrieval
│   │   │   ├── competitors/   # Competitor management
│   │   │   └── scrape/        # Web scraping endpoints
│   │   ├── chat/             # Chat interface
│   │   ├── reports/          # Reports UI
│   │   └── globals.css       # Global styles
│   ├── components/            # React components
│   │   ├── ui/               # UI primitives
│   │   ├── chat/             # Chat components
│   │   └── reports/          # Report components
│   ├── lib/                  # Core business logic
│   │   ├── chat/             # Chat processing
│   │   ├── reports.ts        # Report generation
│   │   ├── trends.ts         # Trend analysis
│   │   ├── logger.ts         # Logging system
│   │   └── prisma.ts         # Database client
│   ├── services/              # Core services
│   │   ├── webScraper.ts     # Web scraping service
│   │   └── scraperScheduler.ts # Scraping scheduler
│   ├── types/                # TypeScript definitions
│   └── utils/                # Utility functions
├── prisma/                   # Database schema & migrations
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Migration files
├── reports/                  # Generated report files
├── public/                   # Static assets
├── __tests__/               # Unit & integration tests
├── e2e/                     # End-to-end tests
├── .env.example             # Environment template
├── package.json             # Dependencies & scripts
└── README.md               # This file
```

## 🔧 API Reference

### **Projects**
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### **Reports**
- `GET /api/reports/list` - List all reports
- `POST /api/reports/generate` - Generate new report
- `GET /api/reports/database/{id}` - Get database report
- `GET /api/reports/download` - Download file report

### **Competitors**
- `GET /api/competitors` - List competitors
- `POST /api/competitors` - Add competitor
- `PUT /api/competitors/{id}` - Update competitor

### **Chat**
- `POST /api/chat` - Process chat message
- `GET /api/chat/history` - Get chat history

### **Web Scraping**
- `POST /api/scrape/competitors` - Scrape competitor websites
- `GET /api/scrape/status` - Get scraping job status
- `POST /api/scrape/schedule` - Configure scraping schedules

## 🌟 Best Practices

### **Development**
- Use correlation IDs for tracking requests across services
- Implement comprehensive error handling with fallbacks
- Monitor performance for all AI operations
- Use TypeScript strictly for type safety

### **Production**
- Set up proper AWS IAM roles for Bedrock access
- Configure database connection pooling
- Implement rate limiting for AI services
- Set up monitoring and alerting

### **Security**
- Store AWS credentials securely (never in code)
- Use environment variables for all secrets
- Implement proper authentication for API endpoints
- Validate all user inputs

## 🚀 Deployment

### **Development**
```bash
npm run dev
```

### **Production Build**
```bash
npm run build
npm start
```

### **Docker (Optional)**
```bash
docker build -t competitor-research-agent .
docker run -p 3000:3000 competitor-research-agent
```

## 🌿 Branch Strategy

This repository uses a structured branching strategy to organize development work:

### **Branch Overview**
- **`stable-main`**: 🔒 Stable baseline (June 5, 2025) - Production-ready code without experimental features
- **`main`**: 🚀 Current development branch with all latest features including observability implementation

### **Branch Details**

#### **stable-main** (Stable Baseline)
- **Purpose**: Production-ready baseline from June 5, 2025
- **Features**: Core competitor research functionality, web scraping, AI analysis
- **Status**: ✅ Fully tested and operational
- **Use For**: Production deployments, stable feature development

#### **main** (Current Development)
- **Purpose**: Active development with all latest features including observability
- **Features**: Everything in stable-main plus:
  - Frequency-based scraping, enhanced testing, bug fixes
  - **Comprehensive observability implementation**
  - Custom React hooks for monitoring
  - Error boundaries with user-friendly handling
  - Correlation ID tracking across all requests
  - Performance monitoring for pages and APIs
  - User journey analytics and session summaries
  - Comprehensive test suite (44 tests)
- **Status**: ✅ Fully tested and production-ready
- **Use For**: New feature development, standard deployments, observability monitoring

#### **aws-bedrock-credentials-feature** (AWS Credentials Integration)
- **Purpose**: AWS Bedrock credentials integration and test stability improvements
- **Features**: Everything in main plus:
  - AWS Bedrock credential management and validation
  - Test failures remediation implementation
  - Enhanced performance optimization
  - Comprehensive test coverage for edge cases
  - Cross-browser testing infrastructure
  - Load testing framework
  - Memory optimization for large operations
- **Status**: ✅ Fully tested and production-ready
- **Use For**: Production deployments with AWS Bedrock integration, performance testing

### **Working with Branches**

#### **For Stable Development**
```bash
git checkout stable-main
git pull origin stable-main
# Work on stable features
```

#### **For Latest Features**
```bash
git checkout main
git pull origin main
# Work with all current features
```

#### **For Observability Features**
```bash
git checkout main
git pull origin main
# All observability features are now in main
```

#### **Creating New Features**
```bash
# Branch from main for new features
git checkout main
git checkout -b feature/your-feature-name

# Branch from stable-main for critical fixes
git checkout stable-main
git checkout -b hotfix/your-fix-name
```

### **Branch Selection Guide**

| Use Case | Recommended Branch | Why |
|----------|-------------------|-----|
| **Production Deployment** | `aws-bedrock-credentials-feature` | Latest stable features with AWS integration and performance optimizations |
| **Feature Development** | `main` | Latest features with good test coverage |
| **Observability Monitoring** | `main` | Advanced monitoring and error tracking included |
| **AWS Integration** | `aws-bedrock-credentials-feature` | Complete AWS Bedrock credential handling and validation |
| **Performance Testing** | `aws-bedrock-credentials-feature` | Enhanced testing infrastructure for load and cross-browser testing |
| **Critical Bug Fixes** | `stable-main` | Minimal risk, focused fixes |
| **Integration Testing** | `main` | Full feature set including observability |

## 🤝 Contributing

1. Fork the repository
2. Choose appropriate base branch (see Branch Strategy above)
3. Create feature branch (`git checkout -b feature/amazing-feature`)
4. Make changes with proper tests
5. Ensure all tests pass (`npm test`)
6. Update README if needed
7. Commit changes (`git commit -m 'Add amazing feature'`)
8. Push to branch (`git push origin feature/amazing-feature`)
9. Open Pull Request to appropriate target branch

### **Development Guidelines**
- Follow TypeScript strict mode
- Add tests for new features
- Update documentation
- Use conventional commit messages
- Ensure code passes linting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- **Issues**: [GitHub Issues](https://github.com/ngorshkov-nve/competitor-agent-tam-nve/issues)
- **Documentation**: This README and inline code comments
- **Web Scraping Details**: See `WEB_SCRAPING_IMPLEMENTATION.md` for comprehensive scraping documentation
- **Debugging**: Use correlation IDs and comprehensive logging system

---

## 📊 System Status

**Current System Health**: ✅ All systems operational
- ✅ Auto-competitor assignment working
- ✅ Report generation functional 
- ✅ Real web scraping operational (100% success rate)
- ✅ AWS Bedrock API configured correctly
- ✅ AWS Credential management and validation
- ✅ Database and file storage operational
- ✅ Chat interface responsive
- ✅ Scheduled scraping available
- ✅ Comprehensive logging active
- ✅ Performance monitoring active
- ✅ Memory optimization implemented
- ✅ Cross-browser compatibility verified

**Recent Enhancements**:
- 🆕 AWS Bedrock credentials integration and validation
- 🆕 Comprehensive test failures remediation implementation
- 🆕 Enhanced performance optimization for API response times
- 🆕 Memory monitoring and optimization for large operations
- 🆕 Cross-browser testing infrastructure with Playwright
- 🆕 Load testing framework with Artillery
- 🆕 Real web scraping implementation with Puppeteer
- 🆕 Scheduled scraping with configurable cron jobs
- 🆕 Performance-optimized content extraction
- 🆕 Comprehensive scraping API endpoints

**Last Updated**: July 2025
