# AWS Credentials & AI Service Status Implementation Plan

## 🎯 **Objective**
Fix the root cause of comparative reports failing due to missing AWS credentials and implement comprehensive AI service status monitoring throughout the application.

## 📋 **Problem Summary**
- **Root Cause**: AWS Bedrock credentials not configured (all env vars = 'NOT_SET')
- **Impact**: `ComparativeAnalysisService` fails → System falls back to individual reports
- **Token Limit**: Current `maxTokens: 200` is insufficient for comprehensive analysis
- **User Experience**: No visibility into AI service status or credential issues

---

## 🚀 **Implementation Plan**

### **Phase 1: AWS Credentials Validation Service**

#### **1.1 Create AWS Credentials Health Check Service**
**File**: `src/services/aws/awsCredentialsService.ts`

```typescript
export interface AWSCredentialsStatus {
  status: 'healthy' | 'expired' | 'missing' | 'invalid';
  message: string;
  lastChecked: Date;
  region?: string;
  modelId?: string;
  testResults?: {
    credentialsValid: boolean;
    bedrockAccess: boolean;
    modelAccess: boolean;
  };
}

export class AWSCredentialsService {
  // Check overall AWS credentials health
  async checkCredentialsHealth(): Promise<AWSCredentialsStatus>
  
  // Test actual Bedrock connection with real API call
  async testBedrockConnection(): Promise<boolean>
  
  // Validate credentials without making service calls
  async validateCredentials(): Promise<boolean>
  
  // Get current credential configuration
  getCredentialsSummary(): CredentialsSummary
}
```

#### **1.2 Create AWS Error Types**
**File**: `src/types/aws.ts`

```typescript
export class AWSCredentialsError extends Error {
  constructor(
    message: string, 
    public status: 'missing' | 'expired' | 'invalid' | 'access_denied',
    public details?: any
  ) {
    super(message);
    this.name = 'AWSCredentialsError';
  }
}

export interface CredentialsSummary {
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  hasSessionToken: boolean;
  region: string;
  isConfigured: boolean;
}
```

#### **1.3 Update BedrockService with Proper Error Handling**
**File**: `src/services/bedrock/bedrock.service.ts`

```typescript
// Add credential validation before API calls
async generateCompletion(messages: BedrockMessage[]): Promise<string> {
  // 1. Validate credentials first
  if (!this.areCredentialsConfigured()) {
    throw new AWSCredentialsError('AWS credentials not configured', 'missing');
  }

  try {
    const request: BedrockRequest = { messages };
    const response = await this.invokeModel(request);
    return response.completion;
  } catch (error) {
    // Enhanced error handling for AWS-specific errors
    if (this.isCredentialError(error)) {
      throw new AWSCredentialsError('AWS credentials invalid or expired', 'invalid', error);
    }
    throw error;
  }
}

private areCredentialsConfigured(): boolean {
  return !!(
    this.config.credentials?.accessKeyId &&
    this.config.credentials?.secretAccessKey
  );
}
```

---

### **Phase 2: Environment & Configuration Updates**

#### **2.1 Set AWS Credentials**
**File**: `.env` or environment variables

```bash
# AWS Bedrock Configuration
AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
AWS_SESSION_TOKEN="YOUR_AWS_SESSION_TOKEN"
AWS_REGION="eu-west-1"
```

#### **2.2 Update Bedrock Configuration**
**File**: `src/services/bedrock/bedrock.config.ts`

```typescript
export const claudeConfig: BedrockConfig = {
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  provider: "anthropic",
  region: process.env.AWS_REGION || "eu-west-1",
  maxTokens: 4000, // ✅ INCREASED from 200 to 4000
  temperature: 0.3, // ✅ REDUCED from 1 to 0.3 for consistency
  // ... rest of config
};
```

---

### **Phase 3: Status Indicator Components**

#### **3.1 Create AWS Status Indicator Component**
**File**: `src/components/status/AWSStatusIndicator.tsx`

```typescript
export interface AWSStatusProps {
  compact?: boolean; // For chat interface
  showDetails?: boolean; // For dashboard
  refreshInterval?: number; // Auto-refresh interval in ms
}

export function AWSStatusIndicator({ 
  compact = false, 
  showDetails = false,
  refreshInterval = 30000 
}: AWSStatusProps) {
  const { status, isLoading, error, refresh } = useAWSStatus(refreshInterval);
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'expired': return 'text-yellow-500';
      case 'missing':
      case 'invalid': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <div className={`h-2 w-2 rounded-full ${getStatusColor(status.status)}`} />
        <span className="text-sm">AI {status.status === 'healthy' ? 'Live' : 'Offline'}</span>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-2">AWS/AI Service Status</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span>Status:</span>
          <span className={`font-medium ${getStatusColor(status.status)}`}>
            {status.status.toUpperCase()}
          </span>
        </div>
        {showDetails && (
          <>
            <div className="text-sm text-gray-600">{status.message}</div>
            <div className="text-xs text-gray-500">
              Last checked: {status.lastChecked.toLocaleTimeString()}
            </div>
            {status.testResults && (
              <div className="mt-2 space-y-1 text-sm">
                <div>Credentials: {status.testResults.credentialsValid ? '✅' : '❌'}</div>
                <div>Bedrock Access: {status.testResults.bedrockAccess ? '✅' : '❌'}</div>
                <div>Model Access: {status.testResults.modelAccess ? '✅' : '❌'}</div>
              </div>
            )}
          </>
        )}
        <button 
          onClick={refresh}
          className="text-blue-500 text-sm hover:underline"
          disabled={isLoading}
        >
          {isLoading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
```

#### **3.2 Create AWS Status Hook**
**File**: `src/hooks/useAWSStatus.ts`

```typescript
export function useAWSStatus(refreshInterval: number = 30000) {
  const [status, setStatus] = useState<AWSCredentialsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/health/aws');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError('Failed to check AWS status');
      console.error('AWS status check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [checkStatus, refreshInterval]);

  return { status, isLoading, error, refresh: checkStatus };
}
```

---

### **Phase 4: UI Integration**

#### **4.1 Dashboard Integration**
**File**: `src/app/dashboard/page.tsx`

Add AWS Status Card to Dashboard:
```typescript
import { AWSStatusIndicator } from '@/components/status/AWSStatusIndicator';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* AWS Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AWSStatusIndicator showDetails={true} />
        {/* Other status cards */}
      </div>
    </div>
  );
}
```

#### **4.2 Chat Interface Integration**
**File**: `src/components/chat/ChatInterface.tsx`

Add compact status indicator to chat header:
```typescript
import { AWSStatusIndicator } from '@/components/status/AWSStatusIndicator';

export function ChatInterface() {
  return (
    <div className="flex flex-col h-full">
      {/* Chat Header with AWS Status */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Project Assistant</h2>
        <AWSStatusIndicator compact={true} />
      </div>
      {/* Rest of chat interface */}
    </div>
  );
}
```

---

### **Phase 5: Error Handling & User Messaging**

#### **5.1 Update ComparativeAnalysisService Error Handling**
**File**: `src/services/analysis/comparativeAnalysisService.ts`

```typescript
private async executeAnalysis(prompt: string): Promise<string> {
  try {
    const messages: BedrockMessage[] = [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ];
    
    const result = await this.bedrockService.generateCompletion(messages);
    
    if (!result || result.length < 50) {
      throw new AIServiceError('AI service returned insufficient response');
    }
    
    return result;
  } catch (error) {
    if (error instanceof AWSCredentialsError) {
      logger.error('AWS Credentials Error in Analysis', {
        error: error.status,
        service: 'comparative_analysis',
        impact: 'analysis_blocked'
      });
      
      // Don't fallback - throw proper user-facing error
      throw new ComparativeAnalysisError(
        `AI analysis unavailable: ${AWS_ERROR_MESSAGES[error.status.toUpperCase()]}`,
        'AWS_CREDENTIALS_ERROR',
        { credentialStatus: error.status }
      );
    }
    
    logger.error('AI service execution failed', error as Error);
    throw new AIServiceError('Failed to get analysis from AI service', { originalError: error });
  }
}
```

#### **5.2 Update InitialComparativeReportService**
**File**: `src/services/reports/initialComparativeReportService.ts`

```typescript
// In generateInitialComparativeReport method
try {
  analysis = await this.comparativeAnalysisService.analyzeProductVsCompetitors(analysisInput);
} catch (error) {
  if (error instanceof ComparativeAnalysisError && error.code === 'AWS_CREDENTIALS_ERROR') {
    // Don't fallback to individual reports - show credential error to user
    realTimeStatusService.sendCompletionUpdate(
      projectId,
      false,
      undefined,
      undefined,
      error.message
    );
    
    throw error; // Re-throw to show user the credential error
  }
  
  // Handle other analysis errors with fallback
  logger.warn('Analysis failed, proceeding with partial data report', {
    ...context,
    error: (error as Error).message
  });
  analysis = null; // Will trigger partial data generation
}
```

#### **5.3 Create User-Friendly Error Messages**
**File**: `src/constants/errorMessages.ts`

```typescript
export const AWS_ERROR_MESSAGES = {
  MISSING: "AI analysis is currently unavailable. AWS credentials are not configured. Please contact your administrator.",
  EXPIRED: "AI analysis is temporarily unavailable. AWS credentials have expired and need to be renewed.",
  INVALID: "AI analysis is currently unavailable. AWS credentials are invalid. Please check your configuration.",
  ACCESS_DENIED: "AI analysis is unavailable. Access to AWS Bedrock service is denied. Please verify your permissions."
};

export const AI_SERVICE_MESSAGES = {
  FALLBACK_USED: "Using simplified analysis due to AI service limitations.",
  PARTIAL_DATA: "Analysis completed with limited data. Some insights may be incomplete.",
  SERVICE_DEGRADED: "AI service is experiencing issues. Analysis quality may be reduced."
};
```

---

### **Phase 6: API Health Check Endpoints**

#### **6.1 Create AWS Health Check API**
**File**: `src/app/api/health/aws/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { AWSCredentialsService } from '@/services/aws/awsCredentialsService';

export async function GET() {
  try {
    const credentialsService = new AWSCredentialsService();
    const status = await credentialsService.checkCredentialsHealth();
    
    return NextResponse.json(status, {
      status: status.status === 'healthy' ? 200 : 503
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to check AWS credentials',
        lastChecked: new Date(),
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}
```

#### **6.2 Create AI Service Health Check**
**File**: `src/app/api/health/ai/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { ComparativeAnalysisService } from '@/services/analysis/comparativeAnalysisService';
import { BedrockService } from '@/services/bedrock/bedrock.service';

export async function GET() {
  try {
    // Test basic Bedrock connectivity
    const bedrockService = new BedrockService();
    const testMessage = "Test connection - respond with 'OK'";
    
    const startTime = Date.now();
    const response = await bedrockService.generateCompletion([
      { role: 'user', content: [{ type: 'text', text: testMessage }] }
    ]);
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'healthy',
      service: 'bedrock',
      responseTime,
      testResponse: response.slice(0, 100),
      timestamp: new Date()
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        service: 'bedrock',
        error: (error as Error).message,
        timestamp: new Date()
      },
      { status: 503 }
    );
  }
}
```

---

## 📋 **Implementation Checklist**

### **Phase 1: Core Infrastructure**
- [ ] Create `AWSCredentialsService` with health checks
- [ ] Create AWS error types and constants
- [ ] Update `BedrockService` error handling
- [ ] Update Bedrock configuration (tokens + temperature)

### **Phase 2: Environment Setup**
- [ ] Set AWS credentials in environment
- [ ] Test credential connectivity
- [ ] Verify Bedrock model access

### **Phase 3: UI Components**
- [ ] Create `AWSStatusIndicator` component
- [ ] Create `useAWSStatus` hook
- [ ] Test status indicator with different states

### **Phase 4: Integration**
- [ ] Add status indicator to Dashboard
- [ ] Add status indicator to Chat interface
- [ ] Test real-time status updates

### **Phase 5: Error Handling**
- [ ] Update `ComparativeAnalysisService` error handling
- [ ] Update `InitialComparativeReportService` error handling
- [ ] Create user-friendly error messages
- [ ] Test error scenarios

### **Phase 6: API Endpoints**
- [ ] Create `/api/health/aws` endpoint
- [ ] Create `/api/health/ai` endpoint
- [ ] Test health check APIs

### **Phase 7: Testing & Validation**
- [ ] Test with missing credentials
- [ ] Test with expired credentials
- [ ] Test with invalid credentials
- [ ] Test successful credential flow
- [ ] Verify comparative reports generate correctly

---

## 🎯 **Expected Outcomes**

### **Immediate Fixes**
- ✅ Comparative reports work with proper AWS credentials
- ✅ Clear error messages when credentials are missing/expired
- ✅ No more fallback to individual reports due to AWS issues

### **Enhanced User Experience**
- ✅ Real-time AWS/AI status visibility on Dashboard
- ✅ AWS status indicator in Chat interface
- ✅ Proactive notification of credential issues

### **Operational Benefits**
- ✅ Easy diagnosis of AWS credential problems
- ✅ Monitoring of AI service health
- ✅ Reduced support tickets for "reports not working"

### **System Reliability**
- ✅ Proper error propagation instead of silent failures
- ✅ Health check endpoints for monitoring
- ✅ Enhanced logging for troubleshooting

---

## 🔧 **Testing Strategy**

### **Test Scenarios**
1. **No Credentials**: Verify proper error message and red status
2. **Expired Credentials**: Verify yellow status and expiration message
3. **Invalid Credentials**: Verify red status and invalid message  
4. **Valid Credentials**: Verify green status and successful reports
5. **Network Issues**: Verify graceful degradation

### **Manual Testing Checklist**
- [ ] Dashboard shows correct AWS status
- [ ] Chat interface shows correct AWS status  
- [ ] Comparative reports generate successfully
- [ ] Error messages are user-friendly
- [ ] Health check APIs return correct data
- [ ] Status refreshes automatically

---

## 📊 **Success Metrics**

- **Functional**: Comparative reports generate successfully with AWS credentials
- **User Experience**: Clear visibility into AI service status
- **Operational**: Zero "unknown AI failures" - all failures properly categorized
- **Monitoring**: Real-time awareness of AI service health

This plan addresses the root cause while providing comprehensive monitoring and user experience improvements for AI service management. 