#!/bin/bash

# Cross-Browser Testing Script
# Task 6.2: Cross-Browser Testing
#
# This script runs cross-browser tests and generates a comprehensive report

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
REPORT_DIR="test-reports/cross-browser-${TIMESTAMP}"
SCREENSHOTS_DIR="${REPORT_DIR}/screenshots"
LOG_FILE="${REPORT_DIR}/cross-browser-test.log"
HTML_REPORT="${REPORT_DIR}/index.html"
TEST_TIMEOUT=120000 # 2 minutes

# Print header
print_header() {
  echo -e "${BLUE}"
  echo "================================================"
  echo "   Cross-Browser Testing - Task 6.2"
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
  mkdir -p "$SCREENSHOTS_DIR"
  
  # Create placeholder for HTML report
  echo "Cross-Browser Test Run: ${TIMESTAMP}" > "$HTML_REPORT"
  
  print_success "Created report directory: $REPORT_DIR"
}

# Install dependencies if needed
check_dependencies() {
  print_step "Checking dependencies"
  
  # Check if Playwright browsers are installed
  if ! npx playwright --version &> /dev/null; then
    print_step "Installing Playwright browsers"
    npx playwright install
  fi
  
  print_success "Dependencies verified"
}

# Run visual regression tests
run_visual_tests() {
  print_step "Running visual regression tests"
  
  npx playwright test --grep="@visual" \
    --timeout="$TEST_TIMEOUT" \
    --reporter=html,json \
    --output="$REPORT_DIR" \
    2>&1 | tee -a "$LOG_FILE"
    
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "Visual regression tests completed"
  else
    print_error "Some visual regression tests failed"
  fi
}

# Run browser-specific tests
run_browser_specific_tests() {
  print_step "Running browser-specific tests"
  
  npx playwright test e2e/browser-specific \
    --timeout="$TEST_TIMEOUT" \
    --reporter=html,json \
    --output="${REPORT_DIR}/browser-specific" \
    2>&1 | tee -a "$LOG_FILE"
    
  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_success "Browser-specific tests completed"
  else
    print_error "Some browser-specific tests failed"
  fi
}

# Run cross-browser compatibility tests
run_cross_browser_tests() {
  print_step "Running cross-browser compatibility tests"
  
  for browser in "chromium" "firefox" "webkit"; do
    print_step "Testing in ${browser}"
    
    npx playwright test e2e/immediateReports.spec.ts \
      --project="${browser}-desktop" \
      --timeout="$TEST_TIMEOUT" \
      --reporter=html,json \
      --output="${REPORT_DIR}/${browser}" \
      2>&1 | tee -a "$LOG_FILE"
      
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
      print_success "${browser} tests completed"
    else
      print_error "Some ${browser} tests failed"
    fi
  done
}

# Generate a summary report
generate_summary_report() {
  print_step "Generating test summary"
  
  # Count successes and failures
  local total_tests=$(grep -c "test" "$LOG_FILE" || echo 0)
  local passed_tests=$(grep -c "passed" "$LOG_FILE" || echo 0)
  local failed_tests=$(grep -c "failed" "$LOG_FILE" || echo 0)
  
  # Create summary report
  cat > "$REPORT_DIR/summary.json" << EOL
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "total_tests": $total_tests,
  "passed_tests": $passed_tests,
  "failed_tests": $failed_tests,
  "browsers_tested": ["chromium", "firefox", "webkit"],
  "test_run_id": "$TIMESTAMP"
}
EOL

  print_success "Test summary generated"
  echo "Total tests: $total_tests"
  echo "Passed: $passed_tests"
  echo "Failed: $failed_tests"
}

# Generate report URL
generate_report_url() {
  print_step "Generating report URL"
  
  # Create a relative symlink to the latest report
  ln -sf "${TIMESTAMP}" "test-reports/cross-browser-latest"
  
  print_success "Report generated"
  echo ""
  echo -e "${GREEN}View the HTML report at:${NC} file://$(pwd)/test-reports/cross-browser-latest/index.html"
  echo ""
}

# Main execution
main() {
  print_header
  setup_directories
  check_dependencies
  
  # Run tests
  run_visual_tests
  run_browser_specific_tests
  run_cross_browser_tests
  
  # Generate reports
  generate_summary_report
  generate_report_url
  
  print_success "Cross-browser testing complete"
}

# Run script
main 