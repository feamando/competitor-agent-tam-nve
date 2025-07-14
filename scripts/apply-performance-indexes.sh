#!/bin/bash
# Script to apply database performance indexes
# This script is part of the Phase 3.3 performance optimization effort

set -e  # Exit on error

# Color codes for output formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
MIGRATION_FILE="./prisma/migrations/20240617_add_performance_indexes/migration.sql"
DATABASE_URL="${DATABASE_URL:-$(grep DATABASE_URL .env | cut -d '=' -f2-)}"

# Validate requirements
echo -e "${YELLOW}Checking requirements...${NC}"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo -e "${RED}Error: Migration file not found: $MIGRATION_FILE${NC}"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
  echo "Please set it in the .env file or pass it as an environment variable"
  exit 1
fi

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo -e "${RED}Error: PostgreSQL client (psql) not found${NC}"
  echo "Please install the PostgreSQL client"
  exit 1
fi

# Function to execute SQL file
execute_migration() {
  local file=$1
  echo -e "${YELLOW}Executing migration: $file${NC}"
  
  # Attempt to apply the migration
  if PGPASSWORD=$PGPASSWORD psql "$DATABASE_URL" -f "$file"; then
    echo -e "${GREEN}Migration applied successfully${NC}"
    return 0
  else
    echo -e "${RED}Failed to apply migration${NC}"
    return 1
  fi
}

# Function to verify indexes
verify_indexes() {
  echo -e "${YELLOW}Verifying indexes...${NC}"
  
  # Extract index names from migration file
  index_names=$(grep -oP 'CREATE INDEX IF NOT EXISTS "\K[^"]+' "$MIGRATION_FILE")
  
  # Check if each index exists
  for index in $index_names; do
    echo -n "Checking index $index: "
    
    # Query to check if index exists
    result=$(PGPASSWORD=$PGPASSWORD psql "$DATABASE_URL" -t -c "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = '$index');")
    
    if [[ $result == *"t"* ]]; then
      echo -e "${GREEN}OK${NC}"
    else
      echo -e "${RED}MISSING${NC}"
      missing_indexes+=("$index")
    fi
  done
  
  # Report on missing indexes
  if [ ${#missing_indexes[@]} -gt 0 ]; then
    echo -e "${RED}Warning: Some indexes were not created:${NC}"
    for missing in "${missing_indexes[@]}"; do
      echo "  - $missing"
    done
    return 1
  fi
  
  echo -e "${GREEN}All indexes verified successfully${NC}"
  return 0
}

# Main execution flow
main() {
  echo -e "${GREEN}=== Database Performance Index Application ===${NC}"
  echo "Using migration file: $MIGRATION_FILE"
  echo "Target database: $(echo $DATABASE_URL | sed 's/postgres:\/\/[^:]*:[^@]*@/postgres:\/\/user:password@/')"
  
  read -p "Do you want to proceed with applying indexes? [y/N] " -n 1 -r
  echo
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Operation cancelled by user${NC}"
    exit 0
  fi
  
  # Apply migration
  echo -e "${YELLOW}Applying performance indexes...${NC}"
  if ! execute_migration "$MIGRATION_FILE"; then
    echo -e "${RED}Failed to apply migration. Aborting.${NC}"
    exit 1
  fi
  
  # Verify indexes
  missing_indexes=()
  if ! verify_indexes; then
    echo -e "${YELLOW}Warning: Not all indexes were created successfully.${NC}"
    echo "This might be due to missing tables or columns in your schema."
    echo "Check your database schema and adjust the migration file if needed."
  else
    echo -e "${GREEN}All performance indexes have been successfully applied and verified!${NC}"
  fi
  
  echo -e "${GREEN}=== Performance optimization complete ===${NC}"
}

# Run the script
main 