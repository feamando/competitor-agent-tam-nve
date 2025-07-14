#!/bin/bash

# Load Testing Script
# Task 6.3: Load Testing
#
# This script runs comprehensive load tests and generates reports

# Set script to exit on error
set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_ID="${TIMESTAMP}"
REPORT_DIR="load-tests/reports/${TEST_ID}"
LOG_FILE="${REPORT_DIR}/load-test.log"
HTML_REPORT="${REPORT_DIR}/index.html"

# Export test ID for use in Artillery
export TEST_ID

# Print header
print_header() {
  echo -e "${BLUE}"
  echo "================================================"
  echo "   Load Testing - Task 6.3"
  echo "   $(date)"
  echo "================================================"
  echo -e "${NC}"
}

# Print step information
print_step() {
  echo -e "${YELLOW}[$(date +"%H:%M:%S")] $1${NC}"
}

# Print success message
print_success() {
  echo -e "${GREEN}[✓] $1${NC}"
}

# Print error message
print_error() {
  echo -e "${RED}[✗] $1${NC}"
}

# Create directories
setup_directories() {
  print_step "Setting up test directories"
  
  mkdir -p "$REPORT_DIR"
  
  # Create placeholder for HTML report
  echo "Load Test Run: ${TIMESTAMP}" > "$HTML_REPORT"
  
  print_success "Created report directory: $REPORT_DIR"
}

# Check dependencies
check_dependencies() {
  print_step "Checking dependencies"
  
  # Check if Artillery is installed
  if ! npx artillery -V &> /dev/null; then
    print_step "Installing Artillery"
    npm install -g artillery
  fi
  
  # Check if Node.js is installed
  if ! node -v &> /dev/null; then
    print_error "Node.js is required but not installed"
    exit 1
  fi
  
  print_success "Dependencies verified"
}

# Start the application for testing
start_application() {
  print_step "Starting application for testing"
  
  # Check if application is already running
  if curl -s http://localhost:3000/api/health > /dev/null; then
    print_success "Application is already running"
    return 0
  fi
  
  # Start the application in the background
  print_step "Starting application in development mode"
  npm run dev > "${REPORT_DIR}/app.log" 2>&1 &
  APP_PID=$!
  
  # Wait for application to start
  print_step "Waiting for application to start..."
  for i in {1..30}; do
    if curl -s http://localhost:3000/api/health > /dev/null; then
      print_success "Application started successfully"
      return 0
    fi
    sleep 1
  done
  
  print_error "Application failed to start within timeout"
  return 1
}

# Run API load tests
run_api_load_test() {
  print_step "Running API load tests"
  
  npx artillery run load-tests/config/api-load-test.yml \
    -o "${REPORT_DIR}/api-load-test-results.json" \
    -e local \
    2>&1 | tee -a "$LOG_FILE"
    
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "API load tests completed successfully"
  else
    print_error "Some API load tests failed"
  fi
}

# Run general load tests
run_general_load_test() {
  print_step "Running general load tests"
  
  npx artillery run load-tests/config/artillery.yml \
    -o "${REPORT_DIR}/general-load-test-results.json" \
    -e local \
    2>&1 | tee -a "$LOG_FILE"
    
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "General load tests completed successfully"
  else
    print_error "Some general load tests failed"
  fi
}

# Run browser load tests
run_browser_load_test() {
  print_step "Running browser load tests"
  
  # Set environment variables
  export BASE_URL="http://localhost:3000"
  export CONCURRENT_USERS=3
  export TEST_DURATION=30
  export RAMP_UP_TIME=5
  export HEADLESS=true
  
  node load-tests/browser-load-test.js 2>&1 | tee -a "$LOG_FILE"
    
  if [ $? -eq 0 ]; then
    print_success "Browser load tests completed successfully"
    
    # Copy the browser load test report to our unified report directory
    cp load-tests/reports/browser-test-*/browser-load-test-report.json "${REPORT_DIR}/" || true
  else
    print_error "Some browser load tests failed"
  fi
}

# Generate unified HTML report
generate_report() {
  print_step "Generating unified load test report"
  
  # Create a basic HTML report
  cat > "$HTML_REPORT" << EOL
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Load Test Results - ${TIMESTAMP}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
    h1 { color: #333; }
    h2 { color: #0056b3; margin-top: 30px; }
    .summary { background-color: #f8f9fa; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0; }
    .success { color: green; }
    .warning { color: orange; }
    .error { color: red; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .chart { width: 100%; height: 300px; margin: 20px 0; border: 1px solid #ddd; }
  </style>
</head>
<body>
  <h1>Load Test Results</h1>
  <div class="summary">
    <p><strong>Test ID:</strong> ${TEST_ID}</p>
    <p><strong>Timestamp:</strong> $(date)</p>
    <p><strong>Environment:</strong> Local Development</p>
  </div>
  
  <h2>Test Summary</h2>
  <p>This report combines results from API load tests, general application load tests, and browser-based load tests.</p>
  
  <h2>API Load Test Results</h2>
  <p>See detailed results in <a href="api-load-test-results.json">api-load-test-results.json</a></p>
  
  <h2>General Load Test Results</h2>
  <p>See detailed results in <a href="general-load-test-results.json">general-load-test-results.json</a></p>
  
  <h2>Browser Load Test Results</h2>
  <p>See detailed results in <a href="browser-load-test-report.json">browser-load-test-report.json</a></p>
  
  <h2>Performance Recommendations</h2>
  <ul>
    <li>Review any endpoints with response times > 2000ms</li>
    <li>Check for database query optimizations on frequently used endpoints</li>
    <li>Consider implementing caching for static resources</li>
    <li>Monitor memory usage during peak load scenarios</li>
  </ul>
</body>
</html>
EOL

  print_success "Load test report generated at ${HTML_REPORT}"
  echo "View the HTML report at: file://$(pwd)/${HTML_REPORT}"
}

# Stop the application if we started it
stop_application() {
  if [ -n "$APP_PID" ]; then
    print_step "Stopping application"
    kill $APP_PID
    wait $APP_PID 2>/dev/null || true
    print_success "Application stopped"
  fi
}

# Set trap to ensure application is stopped on exit
trap stop_application EXIT

# Main execution
main() {
  print_header
  setup_directories
  check_dependencies
  start_application
  
  # Run all test types
  run_api_load_test
  run_general_load_test
  run_browser_load_test
  
  # Generate comprehensive report
  generate_report
  
  print_success "Load testing complete"
}

# Run script
main 