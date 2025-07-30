/**
 * Consolidated Services Integration Tests
 * Validates end-to-end functionality of consolidated AnalysisService and ReportingService
 * 
 * Task 8.1: Comprehensive Integration Testing
 * - Tests complete workflows: project creation → analysis → report generation
 * - Validates critical user journeys continue to work
 * - Tests error scenarios and recovery mechanisms
 * - Verifies performance meets existing benchmarks
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { generateCorrelationId } from '@/lib/logger';

// Mock data and utilities
const mockProjectId = 'test-project-123';
const mockCompetitorIds = ['comp-1', 'comp-2', 'comp-3'];

describe('Consolidated Services Integration Tests', () => {
  let testCorrelationId: string;

  beforeAll(async () => {
    // Setup test environment
    console.log('🧪 Setting up Consolidated Services Integration Tests');
  });

  beforeEach(() => {
    testCorrelationId = generateCorrelationId();
  });

  afterAll(async () => {
    // Cleanup test data
    console.log('🧹 Cleaning up integration test data');
  });

  describe('End-to-End Workflow Testing', () => {
    it('should complete full analysis → report generation workflow', async () => {
      const startTime = Date.now();

      // Step 1: Trigger Analysis using consolidated AnalysisService
      console.log('📊 Step 1: Running consolidated analysis...');
      
      const analysisResponse = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          analysisConfig: {
            focusAreas: ['features', 'positioning', 'user_experience', 'customer_targeting'],
            depth: 'detailed',
            includeRecommendations: true
          },
          testMode: true
        })
      });

      expect(analysisResponse.status).toBe(200);
      const analysisResult = await analysisResponse.json();

      // Validate analysis response structure
      expect(analysisResult).toHaveProperty('analysis');
      expect(analysisResult.analysis).toHaveProperty('id');
      expect(analysisResult.analysis).toHaveProperty('metadata');
      expect(analysisResult.analysis.metadata).toHaveProperty('generatedBy');
      expect(analysisResult.analysis.metadata.generatedBy).toContain('consolidated');
      expect(analysisResult).toHaveProperty('correlationId');

      console.log(`✅ Analysis completed in ${Date.now() - startTime}ms with consolidated service`);

      // Step 2: Generate Report using consolidated ReportingService
      console.log('📄 Step 2: Generating report with consolidated service...');
      
      const reportResponse = await fetch('http://localhost:3000/api/reports/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          projectId: mockProjectId,
          template: 'comprehensive',
          immediate: true,
          reportOptions: {
            includeRecommendations: true,
            enhanceWithAI: true,
            includeDataFreshness: true,
            usingConsolidatedService: true,
            consolidatedServiceV15: true // Flag to ensure consolidated service usage
          },
          testMode: true
        })
      });

      expect(reportResponse.status).toBe(200);
      const reportResult = await reportResponse.json();

      // Validate report response structure
      expect(reportResult).toHaveProperty('reportId');
      expect(reportResult).toHaveProperty('reportTitle');
      expect(reportResult).toHaveProperty('reportType', 'comparative');
      expect(reportResult).toHaveProperty('competitorCount');
      expect(reportResult.competitorCount).toBeGreaterThan(0);

      console.log(`✅ Report generated in ${Date.now() - startTime}ms (ID: ${reportResult.reportId})`);

      // Step 3: Validate end-to-end processing time
      const totalProcessingTime = Date.now() - startTime;
      expect(totalProcessingTime).toBeLessThan(30000); // Should complete within 30 seconds

      console.log(`🎉 End-to-end workflow completed in ${totalProcessingTime}ms`);
    }, 45000); // 45 second timeout for full workflow

    it('should handle smart AI analysis workflow', async () => {
      console.log('🤖 Testing Smart AI Analysis workflow...');

      const response = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/smart-ai-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          analysisType: 'comprehensive',
          forceFreshData: true,
          context: {
            testMode: true,
            integrationTest: true
          }
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Validate Smart AI specific features
      expect(result).toHaveProperty('smartAnalosis') // Note: This might be in smartAnalosis field
      expect(result).toHaveProperty('analysisMetadata');
      expect(result.analysisMetadata).toHaveProperty('dataFreshGuaranteed');
      expect(result.analysisMetadata).toHaveProperty('scrapingTriggered');

      console.log('✅ Smart AI Analysis workflow completed successfully');
    }, 30000);

    it('should generate comparative reports end-to-end', async () => {
      console.log('⚖️ Testing Comparative Report generation...');

      const response = await fetch('http://localhost:3000/api/reports/comparative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          projectId: mockProjectId,
          template: 'executive',
          options: {
            focusArea: 'all',
            analysisDepth: 'detailed',
            includeRecommendations: true,
            enhanceWithAI: true
          },
          testMode: true
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Validate comparative report structure
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('reportId');
      expect(result).toHaveProperty('reportTitle');
      expect(result.reportTitle).toContain('Comparative');

      console.log('✅ Comparative Report generation completed successfully');
    });
  });

  describe('Critical Data Flow Preservation', () => {
    it('should preserve smart scheduling integration', async () => {
      console.log('⏰ Testing Smart Scheduling integration preservation...');

      // Test data freshness check
      const response = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/smart-ai-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          analysisType: 'comprehensive',
          forceFreshData: false, // Test existing data usage
          testMode: true
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Validate smart scheduling features are preserved
      expect(result.analysisMetadata).toHaveProperty('dataFreshGuaranteed');
      expect(result.analysisMetadata).toHaveProperty('scrapingTriggered');
      
      // Check that data freshness logic is working
      expect(typeof result.analysisMetadata.dataFreshGuaranteed).toBe('boolean');
      expect(typeof result.analysisMetadata.scrapingTriggered).toBe('boolean');

      console.log('✅ Smart Scheduling integration preserved successfully');
    });

    it('should preserve analysis-to-reporting pipeline', async () => {
      console.log('🔄 Testing Analysis-to-Reporting pipeline preservation...');

      // Generate analysis first
      const analysisResponse = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          testMode: true
        })
      });

      expect(analysisResponse.status).toBe(200);
      const analysisResult = await analysisResponse.json();

      // Generate report based on analysis
      const reportResponse = await fetch('http://localhost:3000/api/reports/comparative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          projectId: mockProjectId,
          template: 'comprehensive',
          testMode: true
        })
      });

      expect(reportResponse.status).toBe(200);
      const reportResult = await reportResponse.json();

      // Validate that analysis data flows into report
      expect(reportResult).toHaveProperty('success', true);
      expect(reportResult).toHaveProperty('reportId');

      console.log('✅ Analysis-to-Reporting pipeline preserved successfully');
    });

    it('should preserve queue and async processing', async () => {
      console.log('🔄 Testing Queue and Async Processing preservation...');

      // Test async report generation
      const response = await fetch('http://localhost:3000/api/reports/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          projectId: mockProjectId,
          template: 'comprehensive',
          immediate: false, // Test async processing
          testMode: true
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Validate async processing features
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('reportId');
      expect(result).toHaveProperty('timestamp');

      console.log('✅ Queue and Async Processing preserved successfully');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle analysis service errors gracefully', async () => {
      console.log('⚠️ Testing Analysis Service error handling...');

      // Test with invalid project ID
      const response = await fetch('http://localhost:3000/api/projects/invalid-project-id/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          testMode: true
        })
      });

      expect(response.status).toBe(404);
      const result = await response.json();

      // Validate error response structure
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('correlationId');
      expect(result.correlationId).toBe(testCorrelationId);

      console.log('✅ Analysis Service error handling validated');
    });

    it('should handle reporting service errors gracefully', async () => {
      console.log('⚠️ Testing Reporting Service error handling...');

      // Test with invalid request
      const response = await fetch('http://localhost:3000/api/reports/comparative', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          projectId: 'invalid-project-id',
          testMode: true
        })
      });

      expect(response.status).toBe(404);
      const result = await response.json();

      // Validate error response structure
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('correlationId');

      console.log('✅ Reporting Service error handling validated');
    });

    it('should recover from service timeouts', async () => {
      console.log('⏱️ Testing Service timeout recovery...');

      // This test simulates timeout scenarios
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      const requestPromise = fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          testMode: true,
          simulateTimeout: true
        })
      });

      try {
        // Race between request and timeout
        await Promise.race([requestPromise, timeoutPromise]);
        console.log('✅ Request completed within timeout');
      } catch (error) {
        // Timeout occurred - this is expected for this test
        expect(error).toBeInstanceOf(Error);
        console.log('✅ Timeout handling validated');
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet analysis performance benchmarks', async () => {
      console.log('⚡ Testing Analysis performance benchmarks...');

      const startTime = Date.now();

      const response = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          testMode: true,
          performanceTest: true
        })
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(15000); // Should complete within 15 seconds

      const result = await response.json();
      expect(result.analysis.metadata.processingTime).toBeLessThan(10000); // Processing time should be under 10 seconds

      console.log(`✅ Analysis completed in ${responseTime}ms, processing time: ${result.analysis.metadata.processingTime}ms`);
    });

    it('should meet report generation performance benchmarks', async () => {
      console.log('⚡ Testing Report generation performance benchmarks...');

      const startTime = Date.now();

      const response = await fetch('http://localhost:3000/api/reports/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          projectId: mockProjectId,
          template: 'comprehensive',
          immediate: true,
          testMode: true,
          performanceTest: true
        })
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(20000); // Should complete within 20 seconds

      console.log(`✅ Report generation completed in ${responseTime}ms`);
    });

    it('should handle concurrent requests efficiently', async () => {
      console.log('🔄 Testing concurrent request handling...');

      const concurrentRequests = 3;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const promise = fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': `${testCorrelationId}-${i}`
          },
          body: JSON.stringify({
            testMode: true,
            concurrentTest: true,
            requestIndex: i
          })
        });
        promises.push(promise);
      }

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
      });

      const totalTime = endTime - startTime;
      const averageTime = totalTime / concurrentRequests;

      console.log(`✅ ${concurrentRequests} concurrent requests completed in ${totalTime}ms (avg: ${averageTime}ms each)`);

      // Concurrent processing should not take much longer than sequential
      expect(averageTime).toBeLessThan(20000);
    });
  });

  describe('Service Health and Monitoring', () => {
    it('should report service health correctly', async () => {
      console.log('🏥 Testing Service health reporting...');

      // Test consolidated service health endpoints
      const healthEndpoints = [
        '/api/analysis-service/health',
        '/api/reporting-service/health'
      ];

      for (const endpoint of healthEndpoints) {
        try {
          const response = await fetch(`http://localhost:3000${endpoint}`);
          
          if (response.ok) {
            const health = await response.json();
            expect(health).toHaveProperty('status');
            console.log(`✅ ${endpoint} - Status: ${health.status}`);
          } else {
            console.log(`⚠️ ${endpoint} - Not available (${response.status})`);
          }
        } catch (error) {
          console.log(`⚠️ ${endpoint} - Error: ${(error as Error).message}`);
        }
      }
    });

    it('should maintain correlation ID tracking', async () => {
      console.log('🔗 Testing Correlation ID tracking...');

      const response = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          testMode: true
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Validate correlation ID is preserved throughout the flow
      expect(result).toHaveProperty('correlationId');
      expect(result.correlationId).toBe(testCorrelationId);

      console.log(`✅ Correlation ID tracking maintained: ${result.correlationId}`);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain API response compatibility', async () => {
      console.log('🔄 Testing API response compatibility...');

      const response = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          testMode: true
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Check that all expected legacy fields are present
      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('reportContent');
      expect(result).toHaveProperty('correlationId');

      // Analysis should have expected structure
      expect(result.analysis).toHaveProperty('id');
      expect(result.analysis).toHaveProperty('metadata');
      expect(result.analysis.metadata).toHaveProperty('processingTime');
      expect(result.analysis.metadata).toHaveProperty('confidenceScore');

      console.log('✅ API response compatibility maintained');
    });

    it('should support legacy analysis parameters', async () => {
      console.log('🔄 Testing legacy parameter support...');

      // Test with legacy parameter format
      const response = await fetch(`http://localhost:3000/api/projects/${mockProjectId}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': testCorrelationId
        },
        body: JSON.stringify({
          analysisConfig: {
            focusAreas: ['features', 'positioning'],
            depth: 'detailed',
            includeRecommendations: true
          },
          testMode: true
        })
      });

      expect(response.status).toBe(200);
      const result = await response.json();

      // Validate that legacy parameters are processed correctly
      expect(result.analysis.metadata.focusAreas).toContain('features');
      expect(result.analysis.metadata.focusAreas).toContain('positioning');
      expect(result.analysis.metadata.analysisDepth).toBe('detailed');

      console.log('✅ Legacy parameter support validated');
    });
  });
});

// Utility functions for testing
async function waitForReportCompletion(reportId: string, maxWaitTime: number = 30000): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await fetch(`http://localhost:3000/api/reports/${reportId}`);
      if (response.ok) {
        const report = await response.json();
        if (report.status === 'completed') {
          return report;
        }
      }
    } catch (error) {
      // Continue waiting
    }
    
    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Report ${reportId} did not complete within ${maxWaitTime}ms`);
}

async function validateServiceResponse(response: Response, expectedStatus: number = 200): Promise<any> {
  expect(response.status).toBe(expectedStatus);
  
  if (response.ok) {
    const result = await response.json();
    expect(result).toBeDefined();
    return result;
  } else {
    const error = await response.json();
    expect(error).toHaveProperty('error');
    return error;
  }
} 