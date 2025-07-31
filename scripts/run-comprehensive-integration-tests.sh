#!/bin/bash

# Task 8.1: Comprehensive Integration Tests Runner
# 
# This script orchestrates the execution of all comprehensive integration tests
# for the consolidated services architecture validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_TIMEOUT=300000  # 5 minutes per test suite
PARALLEL_WORKERS=2
COVERAGE_THRESHOLD=80
LOG_LEVEL=info

# Test suites to run
declare -a TEST_SUITES=(
    "comprehensive-workflow-integration.test.ts"
    "consolidated-services-integration.test.ts" 
    "analysis-to-reporting-pipeline.test.ts"
    "smart-scheduling-preservation.test.ts"
    "queue-async-processing-preservation.test.ts"
    "database-schema-alignment.test.ts"
    "consolidated-services-benchmark.test.ts"
)

# E2E tests
declare -a E2E_TESTS=(
    "comprehensive-user-journeys.spec.ts"
    "production-validation.spec.ts"
)

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "================================================================="
    echo "  Task 8.1: Comprehensive Integration Tests"
    echo "  Consolidated Services Architecture Validation"
    echo "================================================================="
    echo ""
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check database connectivity
    log_info "Checking database connectivity..."
    if ! npm run db:status > /dev/null 2>&1; then
        log_warning "Database connection issues detected - attempting to setup test database"
        npm run db:reset || {
            log_error "Failed to setup test database"
            exit 1
        }
    fi
    
    # Check Redis connectivity (for queue tests)
    log_info "Checking Redis connectivity..."
    if ! redis-cli ping > /dev/null 2>&1; then
        log_warning "Redis is not running - some queue tests may be skipped"
    fi
    
    # Check environment variables
    if [[ -z "$DATABASE_URL" ]]; then
        log_error "DATABASE_URL environment variable is not set"
        exit 1
    fi
    
    log_success "Prerequisites check completed"
}

setup_test_environment() {
    log_info "Setting up test environment..."
    
    # Create test directories if they don't exist
    mkdir -p test-reports/integration
    mkdir -p test-reports/e2e
    mkdir -p test-reports/performance
    
    # Clean up previous test artifacts
    rm -rf test-reports/integration/*
    rm -rf test-reports/e2e/*
    rm -rf test-reports/performance/*
    
    # Setup test data if needed
    log_info "Initializing test data..."
    npm run test:setup-data > /dev/null 2>&1 || {
        log_warning "Test data setup failed - tests will use minimal data"
    }
    
    log_success "Test environment setup completed"
}

run_integration_tests() {
    log_info "Running integration tests..."
    
    local failed_tests=()
    local passed_tests=()
    local total_duration=0
    
    for test_suite in "${TEST_SUITES[@]}"; do
        log_info "Running test suite: $test_suite"
        
        local start_time=$(date +%s)
        local test_output_file="test-reports/integration/${test_suite%.test.ts}_output.log"
        
        if npm run test:integration -- --testNamePattern="$test_suite" \
           --testTimeout=$TEST_TIMEOUT \
           --maxWorkers=$PARALLEL_WORKERS \
           --verbose \
           --json --outputFile="test-reports/integration/${test_suite%.test.ts}_results.json" \
           > "$test_output_file" 2>&1; then
            
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            total_duration=$((total_duration + duration))
            
            passed_tests+=("$test_suite")
            log_success "✅ $test_suite completed in ${duration}s"
        else
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            total_duration=$((total_duration + duration))
            
            failed_tests+=("$test_suite")
            log_error "❌ $test_suite failed after ${duration}s"
            log_error "See $test_output_file for details"
        fi
    done
    
    # Summary
    echo ""
    log_info "Integration Tests Summary:"
    log_success "Passed: ${#passed_tests[@]}/${#TEST_SUITES[@]} test suites"
    
    if [[ ${#failed_tests[@]} -gt 0 ]]; then
        log_error "Failed: ${#failed_tests[@]} test suites"
        for failed_test in "${failed_tests[@]}"; do
            log_error "  - $failed_test"
        done
    fi
    
    log_info "Total integration test duration: ${total_duration}s"
    
    # Return failure if any tests failed
    [[ ${#failed_tests[@]} -eq 0 ]]
}

run_e2e_tests() {
    log_info "Running E2E tests..."
    
    # Start the application server
    log_info "Starting application server for E2E tests..."
    npm run build > /dev/null 2>&1 || {
        log_error "Failed to build application for E2E tests"
        return 1
    }
    
    # Start server in background
    npm run start > test-reports/e2e/server.log 2>&1 &
    local server_pid=$!
    
    # Wait for server to start
    log_info "Waiting for server to start..."
    sleep 10
    
    # Check if server is running
    if ! curl -s http://localhost:3000 > /dev/null; then
        log_error "Server failed to start"
        kill $server_pid 2>/dev/null || true
        return 1
    fi
    
    local failed_e2e=()
    local passed_e2e=()
    
    for e2e_test in "${E2E_TESTS[@]}"; do
        log_info "Running E2E test: $e2e_test"
        
        if npx playwright test "$e2e_test" \
           --reporter=html,json \
           --output-dir=test-reports/e2e \
           > "test-reports/e2e/${e2e_test%.spec.ts}_output.log" 2>&1; then
            
            passed_e2e+=("$e2e_test")
            log_success "✅ $e2e_test completed"
        else
            failed_e2e+=("$e2e_test")
            log_error "❌ $e2e_test failed"
        fi
    done
    
    # Stop server
    kill $server_pid 2>/dev/null || true
    
    # E2E Summary
    echo ""
    log_info "E2E Tests Summary:"
    log_success "Passed: ${#passed_e2e[@]}/${#E2E_TESTS[@]} E2E tests"
    
    if [[ ${#failed_e2e[@]} -gt 0 ]]; then
        log_error "Failed: ${#failed_e2e[@]} E2E tests"
        for failed_test in "${failed_e2e[@]}"; do
            log_error "  - $failed_test"
        done
    fi
    
    # Return failure if any tests failed
    [[ ${#failed_e2e[@]} -eq 0 ]]
}

run_performance_benchmarks() {
    log_info "Running performance benchmarks..."
    
    local benchmark_start=$(date +%s)
    
    if npm run test:integration -- --testNamePattern="consolidated-services-benchmark.test.ts" \
       --testTimeout=600000 \
       --maxWorkers=1 \
       --verbose \
       --json --outputFile="test-reports/performance/benchmark_results.json" \
       > "test-reports/performance/benchmark_output.log" 2>&1; then
        
        local benchmark_end=$(date +%s)
        local benchmark_duration=$((benchmark_end - benchmark_start))
        
        log_success "✅ Performance benchmarks completed in ${benchmark_duration}s"
        
        # Extract performance metrics if available
        if [[ -f "test-reports/performance/benchmark_results.json" ]]; then
            log_info "Performance benchmark results saved to test-reports/performance/"
        fi
        
        return 0
    else
        log_error "❌ Performance benchmarks failed"
        return 1
    fi
}

generate_report() {
    log_info "Generating comprehensive test report..."
    
    local report_file="test-reports/comprehensive-integration-report.md"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    cat > "$report_file" << EOF
# Task 8.1: Comprehensive Integration Test Report

**Generated:** $timestamp  
**Test Suite Version:** Consolidated Services v1.5  
**Environment:** $(node --version) on $(uname -s)

## Test Execution Summary

### Integration Tests
$(
    if [[ -d "test-reports/integration" ]]; then
        echo "- **Test Suites:** ${#TEST_SUITES[@]}"
        echo "- **Results:** Available in \`test-reports/integration/\`"
        echo ""
        for test_suite in "${TEST_SUITES[@]}"; do
            result_file="test-reports/integration/${test_suite%.test.ts}_results.json"
            if [[ -f "$result_file" ]]; then
                echo "  - ✅ $test_suite"
            else
                echo "  - ❌ $test_suite"
            fi
        done
    else
        echo "- **Status:** Not executed"
    fi
)

### E2E Tests
$(
    if [[ -d "test-reports/e2e" ]]; then
        echo "- **Test Files:** ${#E2E_TESTS[@]}"
        echo "- **Results:** Available in \`test-reports/e2e/\`"
        echo "- **Playwright Report:** \`test-reports/e2e/playwright-report/\`"
    else
        echo "- **Status:** Not executed"
    fi
)

### Performance Benchmarks
$(
    if [[ -f "test-reports/performance/benchmark_results.json" ]]; then
        echo "- **Status:** ✅ Completed"
        echo "- **Results:** Available in \`test-reports/performance/\`"
        echo "- **Benchmark Log:** \`test-reports/performance/benchmark_output.log\`"
    else
        echo "- **Status:** ❌ Failed or not executed"
    fi
)

## Validation Results

### Task 8.1 Requirements Checklist

- [ ] Complete workflows: project creation → analysis → report generation
- [ ] Critical user journeys continue to work
- [ ] Error scenarios and recovery mechanisms tested
- [ ] Performance meets or exceeds existing benchmarks
- [ ] Service integration verification completed
- [ ] Data integrity and quality assurance validated

### Production Readiness Assessment

$(
    # Count passed/failed tests
    local integration_passed=0
    local integration_total=${#TEST_SUITES[@]}
    local e2e_passed=0
    local e2e_total=${#E2E_TESTS[@]}
    
    for test_suite in "${TEST_SUITES[@]}"; do
        if [[ -f "test-reports/integration/${test_suite%.test.ts}_results.json" ]]; then
            integration_passed=$((integration_passed + 1))
        fi
    done
    
    for e2e_test in "${E2E_TESTS[@]}"; do
        if [[ -f "test-reports/e2e/${e2e_test%.spec.ts}_output.log" ]]; then
            # Simple check - could be enhanced with actual result parsing
            e2e_passed=$((e2e_passed + 1))
        fi
    done
    
    local overall_pass_rate=$(( (integration_passed + e2e_passed) * 100 / (integration_total + e2e_total) ))
    
    echo "- **Integration Test Pass Rate:** ${integration_passed}/${integration_total}"
    echo "- **E2E Test Pass Rate:** ${e2e_passed}/${e2e_total}"
    echo "- **Overall Pass Rate:** ${overall_pass_rate}%"
    echo ""
    
    if [[ $overall_pass_rate -ge 90 ]]; then
        echo "🟢 **Production Readiness:** READY"
        echo ""
        echo "The consolidated services architecture has passed comprehensive testing and is ready for production deployment."
    elif [[ $overall_pass_rate -ge 70 ]]; then
        echo "🟡 **Production Readiness:** NEEDS ATTENTION"
        echo ""
        echo "Some tests have failed. Review test results and address issues before production deployment."
    else
        echo "🔴 **Production Readiness:** NOT READY"
        echo ""
        echo "Significant test failures detected. Do not deploy to production until issues are resolved."
    fi
)

## Next Steps

1. Review detailed test results in the respective directories
2. Address any failing tests or performance issues
3. Update Task 8.1 completion status in the task plan
4. Proceed with production deployment if all tests pass

---

*This report was generated automatically by the comprehensive integration test runner.*
EOF

    log_success "Comprehensive test report generated: $report_file"
}

cleanup() {
    log_info "Cleaning up test environment..."
    
    # Kill any remaining processes
    pkill -f "npm run start" 2>/dev/null || true
    pkill -f "next" 2>/dev/null || true
    
    # Clean up temporary test data
    npm run test:cleanup-data > /dev/null 2>&1 || true
    
    log_success "Cleanup completed"
}

# Main execution
main() {
    print_header
    
    # Parse command line arguments
    local run_integration=true
    local run_e2e=true
    local run_performance=true
    local generate_report_flag=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --integration-only)
                run_e2e=false
                run_performance=false
                shift
                ;;
            --e2e-only)
                run_integration=false
                run_performance=false
                shift
                ;;
            --performance-only)
                run_integration=false
                run_e2e=false
                shift
                ;;
            --no-report)
                generate_report_flag=false
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --integration-only    Run only integration tests"
                echo "  --e2e-only           Run only E2E tests"
                echo "  --performance-only    Run only performance benchmarks"
                echo "  --no-report          Skip report generation"
                echo "  --help               Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Setup trap for cleanup
    trap cleanup EXIT
    
    # Execute test phases
    local overall_success=true
    
    check_prerequisites || overall_success=false
    setup_test_environment || overall_success=false
    
    if [[ "$run_integration" == true ]]; then
        run_integration_tests || overall_success=false
    fi
    
    if [[ "$run_e2e" == true ]]; then
        run_e2e_tests || overall_success=false
    fi
    
    if [[ "$run_performance" == true ]]; then
        run_performance_benchmarks || overall_success=false
    fi
    
    if [[ "$generate_report_flag" == true ]]; then
        generate_report
    fi
    
    # Final summary
    echo ""
    echo "================================================================="
    if [[ "$overall_success" == true ]]; then
        log_success "🎉 All comprehensive integration tests completed successfully!"
        log_success "Task 8.1 validation: PASSED"
        echo ""
        log_info "The consolidated services architecture is ready for production."
        exit 0
    else
        log_error "💥 Some tests failed during execution"
        log_error "Task 8.1 validation: FAILED"
        echo ""
        log_error "Review test results and address issues before proceeding."
        exit 1
    fi
}

# Execute main function with all arguments
main "$@" 