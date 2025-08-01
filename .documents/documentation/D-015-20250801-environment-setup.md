# Environment Setup for Competitor Research Agent

## Required Environment Variables

To enable AWS Bedrock integration with Claude and Mistral models, add the following variables to your `.env` file:

```bash
# Database Configuration
DATABASE_URL="postgresql://nikita.gorshkov@localhost:5432/competitor_research?schema=public"
NODE_ENV="development"

# AWS Bedrock Configuration (for Claude & Mistral models)
AWS_REGION="eu-north-1"
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
AWS_SESSION_TOKEN="your-aws-session-token"

# Anthropic API Configuration (alternative to Bedrock)
ANTHROPIC_API_KEY="your-anthropic-api-key"

# Optional: OpenAI Configuration
OPENAI_API_KEY="your-openai-api-key"

# Optional: Mistral API Configuration (direct API)
MISTRAL_API_KEY="your-mistral-api-key"
```

## AWS Bedrock Setup

1. **AWS Account**: Ensure you have an AWS account with Bedrock access
2. **Model Access**: Request access to the following models in AWS Bedrock:
   - `anthropic.claude-3-7-sonnet-20250219-v1:0`
   - `eu.mistral.pixtral-large-2502-v1:0`
3. **IAM Permissions**: Ensure your AWS credentials have the following permissions:
   - `bedrock:InvokeModel`
   - `bedrock:ListFoundationModels`

## Testing the Integration

After setting up the environment variables, test the integration:

```bash
# Test Claude integration
curl -H "Cookie: mockUser=authenticated" http://localhost:3000/api/test-claude

# Test chat functionality
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: mockUser=authenticated" \
  -d '{"message": "Hello", "sessionId": "test"}'
```

## Authentication

The application uses mock authentication. Use these credentials:
- **Email**: `nikita.gorshkov@hellofresh.com`
- **Password**: `Illuvatar1!`

## Troubleshooting

1. **Timestamp Error**: Fixed in `ChatMessage.tsx` - timestamps now handle both Date objects and ISO strings
2. **Bedrock Access**: Ensure your AWS region supports the specified models
3. **API Limits**: Check AWS Bedrock quotas and rate limits 