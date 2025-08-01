# Claude AI Integration Guide

## Overview

The Competitor Research Agent now includes full integration with Claude AI via AWS Bedrock to perform real competitive analysis. This guide explains how the integration works and how to use it.

## What's New

### 🤖 Real AI-Powered Analysis
- **Claude AI Integration**: Uses Claude 3 Sonnet via AWS Bedrock for competitive analysis
- **Structured Analysis**: AI analyzes your product, industry, and customer data to identify real competitors
- **Comprehensive Reports**: Generates detailed markdown reports with AI insights

### 📊 Enhanced Report Generation
- **AI-Generated Insights**: Real competitive analysis from Claude AI
- **Competitor Identification**: AI identifies 3-5 key competitors in your industry
- **Strategic Recommendations**: Immediate and long-term action items
- **Feature Gap Analysis**: AI-identified opportunities for competitive advantage

## How It Works

### 1. Chat-Based Data Collection
The agent collects information through a conversational interface:
- **Project Setup**: Email, frequency, report name
- **Product Information**: Name, industry, positioning, customer problems, business challenges
- **Customer Analysis**: Demographics, behaviors, segments

### 2. AI-Powered Analysis
When you confirm to proceed, the agent:
1. **Sends data to Claude AI** via AWS Bedrock
2. **Performs competitive analysis** using AI knowledge
3. **Identifies real competitors** in your industry
4. **Analyzes positioning differences** and feature gaps
5. **Generates strategic recommendations**

### 3. Report Generation
The agent creates a comprehensive markdown report including:
- **Executive Summary** with AI-generated key findings
- **Competitor Analysis** with real competitor insights
- **Positioning Differences** identified by AI
- **Feature Gaps** and opportunities
- **Strategic Recommendations** (immediate and long-term)
- **Full AI Analysis** (raw Claude response)

## Setup Instructions

### 1. Environment Variables
Set the following environment variables:

```bash
# AWS Bedrock Configuration
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-east-1"  # or your preferred region

# Database (if using)
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Authentication (if using)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret"
```

### 2. AWS Bedrock Setup
1. **Enable Bedrock**: Go to AWS Console → Bedrock → Model access
2. **Request Claude Access**: Enable "Anthropic Claude 3 Sonnet"
3. **IAM Permissions**: Ensure your AWS credentials have Bedrock access

### 3. Test Integration
Run the integration test:

```bash
node test-integration.js
```

Expected output:
```
🧪 Testing Claude Integration via AWS Bedrock...

✅ Environment variables configured
   - AWS Region: us-east-1
   - AWS Access Key: AKIA1234...

🔗 Connecting to AWS Bedrock...
🤖 Sending test message to Claude...

✅ Claude Response:
   "Claude AI is operational"

🎉 Integration test successful!
```

## Usage Guide

### 1. Start the Application
```bash
npm run dev
```

### 2. Navigate to Chat Interface
Go to `http://localhost:3000/chat`

### 3. Follow the Conversation Flow

#### Step 1: Project Setup
```
Welcome to the HelloFresh Competitor Research Agent.

Please tell me:
1. Your email address
2. How often would you want to receive the report?
3. How would you want to call the report?
```

Example input:
```
john.doe@hellofresh.com
Monthly
Good Chop Competitive Analysis
```

#### Step 2: Product Information
The agent will ask for:
- Product name
- Industry details
- Positioning information
- Customer problems addressed
- Business challenges

#### Step 3: Customer Analysis
Provide detailed customer information:
- Customer segments
- Demographics
- Behaviors
- Motivations

#### Step 4: AI Analysis
Confirm to proceed with analysis. The agent will:
- Show progress updates
- Call Claude AI for analysis
- Generate comprehensive report

### 4. Download Report
After analysis, you'll receive:
- **Summary in chat** with key findings
- **Download link** for full markdown report
- **AI-powered insights** and recommendations

## API Endpoints

### Chat API
```
POST /api/chat
{
  "message": "user message",
  "sessionId": "optional-session-id"
}
```

### Test Claude Integration
```
POST /api/test-claude
{
  "prompt": "Hello Claude!"
}
```

### Download Reports
```
GET /api/reports/download?filename=report.md
```

## Report Structure

Generated reports include:

```markdown
# Competitor Research Report: [Project Name]

## Executive Summary
- AI-generated key findings
- Competitor count and analysis date

## Product Context
- Product information
- Customer problems
- Business challenges

## Customer Analysis
- Customer description
- Segments and demographics

## AI-Generated Competitive Analysis
- Executive summary (AI-generated)
- Customer experience insights

## Competitive Analysis
- Positioning differences
- Feature gaps identified
- Competitor insights (AI-analyzed)

## Recommendations
- Immediate actions
- Long-term strategy

## Full AI Analysis
- Complete Claude response
- Raw analysis data

## Methodology
- Analysis process
- AI model details
- Token usage information
```

## Troubleshooting

### Common Issues

#### 1. AWS Credentials Error
```
Error: AWS credentials not configured
```
**Solution**: Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables

#### 2. Bedrock Access Denied
```
Error: Access denied. Check your AWS credentials and permissions
```
**Solution**: 
- Verify IAM permissions for Bedrock
- Enable Claude model access in AWS Console

#### 3. Model Not Available
```
Error: Claude model not available in your region
```
**Solution**: 
- Use a supported region (us-east-1, us-west-2, eu-west-1)
- Check Bedrock model availability

#### 4. Report Generation Failed
```
Error: Failed to generate report
```
**Solution**:
- Check file permissions for `./reports` directory
- Verify disk space availability

### Debug Mode

Enable debug logging:
```bash
DEBUG=true npm run dev
```

## Performance Notes

- **Analysis Time**: 2-3 minutes for comprehensive analysis
- **Token Usage**: ~3000-4000 tokens per analysis
- **Cost**: Approximately $0.10-0.15 per analysis
- **Rate Limits**: Bedrock has built-in rate limiting

## Next Steps

1. **Test the integration** with the test script
2. **Start a conversation** in the chat interface
3. **Provide your product information** following the prompts
4. **Review the AI-generated report** and insights
5. **Download the markdown report** for sharing

The agent now provides real competitive intelligence powered by Claude AI, making it a powerful tool for product managers and strategic decision-making. 