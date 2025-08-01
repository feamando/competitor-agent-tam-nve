#!/bin/bash

# Documentation Migration Script
# Migrates all project documentation to standardized naming convention
# Usage: ./scripts/migrate-documentation.sh [--dry-run]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/documentation-migration-$(date +%Y%m%d_%H%M%S)"
DRY_RUN=false
DATE=$(date +%Y%m%d)

# Check for dry-run flag
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "🔍 DRY RUN MODE - No files will be moved"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Create directories function
create_directories() {
    log "Creating target directory structure..."
    
    local dirs=(
        ".documents/completion-reports"
        ".documents/strategy" 
        ".documents/thought-process"
        ".documents/documentation"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ "$DRY_RUN" == "false" ]]; then
            mkdir -p "$PROJECT_ROOT/$dir"
        fi
        success "Directory: $dir"
    done
}

# Backup function
create_backup() {
    if [[ "$DRY_RUN" == "false" ]]; then
        log "Creating backup at: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
        
                 # Backup all markdown files (excluding reports and node_modules)
         # Use rsync for better cross-platform compatibility
         rsync -av --include="*.md" --exclude="node_modules/" --exclude="reports/" \
               "$PROJECT_ROOT/" "$BACKUP_DIR/" 2>/dev/null || \
         find "$PROJECT_ROOT" -name "*.md" -type f \
             -not -path "*/node_modules/*" \
             -not -path "*/reports/*" \
             -exec sh -c 'mkdir -p "'$BACKUP_DIR'/$(dirname "$1")" && cp "$1" "'$BACKUP_DIR'/$1"' _ {} \;
        
        success "Backup created successfully"
    else
        success "Backup would be created at: $BACKUP_DIR"
    fi
}

# Generate new filename based on classification
generate_filename() {
    local file="$1"
    local category="$2"
    local number="$3"
    local basename="$(basename "$file" .md)"
    
    # Clean up basename - remove common prefixes and convert to kebab-case
    local clean_name=$(echo "$basename" | \
        sed 's/^PHASE_[0-9_]*_*//g' | \
        sed 's/^TASK_[0-9_]*_*//g' | \
        sed 's/^[0-9]*-[0-9]*-//g' | \
        sed 's/IMPLEMENTATION_SUMMARY/implementation/g' | \
        sed 's/COMPLETION_SUMMARY/completion/g' | \
        sed 's/_SUMMARY//g' | \
        sed 's/_PLAN//g' | \
        sed 's/_REPORT//g' | \
        sed 's/_GUIDE//g' | \
        sed 's/_DOCUMENTATION//g' | \
        tr 'A-Z' 'a-z' | \
        sed 's/_/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//g' | \
        sed 's/-$//g')
    
    echo "${category}-$(printf "%03d" $number)-${DATE}-${clean_name}.md"
}

# Migration functions for each category

migrate_completion_reports() {
    log "Migrating Completion Reports (CR)..."
    local counter=1
    
    # Category 1: Implementation Reports
    while IFS= read -r -d '' file; do
        local new_name=$(generate_filename "$file" "CR" $counter)
        local target=".documents/completion-reports/$new_name"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            mv "$file" "$PROJECT_ROOT/$target"
        fi
        success "CR-$(printf "%03d" $counter): $(basename "$file") → $new_name"
        ((counter++))
    done < <(find "$PROJECT_ROOT/docs/implementation" -name "*_SUMMARY.md" -o -name "*_COMPLETION_SUMMARY.md" -print0 2>/dev/null || true)
    
    # Category 2: Testing Reports  
    while IFS= read -r -d '' file; do
        local new_name=$(generate_filename "$file" "CR" $counter)
        local target=".documents/completion-reports/$new_name"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            mv "$file" "$PROJECT_ROOT/$target"
        fi
        success "CR-$(printf "%03d" $counter): $(basename "$file") → $new_name"
        ((counter++))
    done < <(find "$PROJECT_ROOT/docs/testing" -name "*.md" -print0 2>/dev/null || true)
    
    # Category 6: Root Level Reports
    local root_files=(
        "PHASE_1_1_COMPLETION_SUMMARY.md"
        "PHASE_1_2_COMPLETION_SUMMARY.md" 
        "PHASE_2_1_COMPLETION_SUMMARY.md"
        "PHASE_2_2_COMPLETION_SUMMARY.md"
        "PHASE_3_1_IMPLEMENTATION_SUMMARY.md"
        "PHASE_3_2_E2E_RECOVERY_IMPLEMENTATION_SUMMARY.md"
        "app-health-audit-20250718.md"
        "health-audit-analysis.md"
        "test-fixes-summary.md"
        "test-issues-summary.md"
        "TEST_SUITE_RESULTS_SUMMARY.md"
    )
    
    for file in "${root_files[@]}"; do
        local full_path="$PROJECT_ROOT/$file"
        if [[ -f "$full_path" ]]; then
            local new_name=$(generate_filename "$full_path" "CR" $counter)
            local target=".documents/completion-reports/$new_name"
            
            if [[ "$DRY_RUN" == "false" ]]; then
                mv "$full_path" "$PROJECT_ROOT/$target"
            fi
            success "CR-$(printf "%03d" $counter): $file → $new_name"
            ((counter++))
        fi
    done
}

migrate_strategy_documents() {
    log "Migrating Strategy Documents (S)..."
    local counter=2  # S-001 already exists
    
    # Planning documents
    while IFS= read -r -d '' file; do
        local new_name=$(generate_filename "$file" "S" $counter)
        local target=".documents/strategy/$new_name"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            mv "$file" "$PROJECT_ROOT/$target"
        fi
        success "S-$(printf "%03d" $counter): $(basename "$file") → $new_name"
        ((counter++))
    done < <(find "$PROJECT_ROOT/docs/planning" -name "*.md" -print0 2>/dev/null || true)
}

migrate_documentation() {
    log "Migrating Documentation (D)..."
    local counter=1
    
    # Architecture documentation from docs root
    local arch_files=(
        "docs/API_REFERENCE.md"
        "docs/BRANCHING_STRATEGY.md" 
        "docs/OPERATIONAL_RUNBOOK.md"
        "docs/TROUBLESHOOTING_GUIDE.md"
        "docs/USER_GUIDE.md"
        "docs/DOCUMENTATION_INDEX.md"
    )
    
    for file in "${arch_files[@]}"; do
        local full_path="$PROJECT_ROOT/$file"
        if [[ -f "$full_path" ]]; then
            local new_name=$(generate_filename "$full_path" "D" $counter)
            local target=".documents/documentation/$new_name"
            
            if [[ "$DRY_RUN" == "false" ]]; then
                mv "$full_path" "$PROJECT_ROOT/$target"
            fi
            success "D-$(printf "%03d" $counter): $(basename "$file") → $new_name"
            ((counter++))
        fi
    done
    
    # Analysis reports (excluding requirements)
    while IFS= read -r -d '' file; do
        # Skip requirements analysis file
        if [[ "$(basename "$file")" != "20250606-requirements-comparativeanalysis-v1.md" ]]; then
            local new_name=$(generate_filename "$file" "D" $counter)
            local target=".documents/documentation/$new_name"
            
            if [[ "$DRY_RUN" == "false" ]]; then
                mv "$file" "$PROJECT_ROOT/$target"
            fi
            success "D-$(printf "%03d" $counter): $(basename "$file") → $new_name"
            ((counter++))
        fi
    done < <(find "$PROJECT_ROOT/docs/analysis" -name "*.md" -not -path "*/testing/*" -print0 2>/dev/null || true)
    
    # Integration documentation  
    while IFS= read -r -d '' file; do
        local new_name=$(generate_filename "$file" "D" $counter)
        local target=".documents/documentation/$new_name"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            mv "$file" "$PROJECT_ROOT/$target"
        fi
        success "D-$(printf "%03d" $counter): $(basename "$file") → $new_name"
        ((counter++))
    done < <(find "$PROJECT_ROOT/docs/integration" -name "*.md" -print0 2>/dev/null || true)
}

migrate_thought_process() {
    log "Migrating Thought Process Documents (TH)..."
    
    # Move existing TH documents to new location
    # Note: Fix duplicate TH-001 numbering by renaming the second one to TH-005
    local th_files=(
        ".cursor/rules/rapid-prototyping/tasks/TH-001-20250718-competitor-research-agent-v1-5-analysis.md"
        ".cursor/rules/rapid-prototyping/tasks/TH-002-20250714-delete-competitor-feature-analysis.md"
        ".cursor/rules/rapid-prototyping/tasks/TH-003-20250730-memory-leak-fix-analysis.md"
        ".cursor/rules/rapid-prototyping/tasks/TH-004-20250729-report-generation-instant-remediation-analysis.md"
    )
    
    # Handle the duplicate TH-001 by renaming it to TH-005
    local duplicate_th001=".cursor/rules/rapid-prototyping/tasks/TH-001-20250730-competitor-snapshot-bug-analysis.md"
    
    for file in "${th_files[@]}"; do
        local full_path="$PROJECT_ROOT/$file"
        if [[ -f "$full_path" ]]; then
            local filename=$(basename "$file")
            local target=".documents/thought-process/$filename"
            
            if [[ "$DRY_RUN" == "false" ]]; then
                mv "$full_path" "$PROJECT_ROOT/$target"
            fi
            success "TH: $filename → thought-process/"
        fi
    done
    
    # Handle the duplicate TH-001 by renaming it to TH-005
    local full_path="$PROJECT_ROOT/$duplicate_th001"
    if [[ -f "$full_path" ]]; then
        local new_filename="TH-005-20250730-competitor-snapshot-bug-analysis.md"
        local target=".documents/thought-process/$new_filename"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            mv "$full_path" "$PROJECT_ROOT/$target"
        fi
        success "TH: $(basename "$duplicate_th001") → $new_filename (renumbered from duplicate TH-001)"
    fi
}

cleanup_empty_directories() {
    log "Cleaning up empty directories..."
    
    local dirs_to_check=(
        "docs/implementation"
        "docs/testing" 
        "docs/planning"
        "docs/analysis/testing"
        "docs/integration"
        ".cursor/rules/rapid-prototyping/tasks"
    )
    
    for dir in "${dirs_to_check[@]}"; do
        local full_path="$PROJECT_ROOT/$dir"
        if [[ -d "$full_path" ]] && [[ -z "$(ls -A "$full_path")" ]]; then
            if [[ "$DRY_RUN" == "false" ]]; then
                rmdir "$full_path" 2>/dev/null || true
            fi
            success "Removed empty directory: $dir"
        fi
    done
}

# Main execution
main() {
    log "Starting documentation migration..."
    log "Project root: $PROJECT_ROOT"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        warning "DRY RUN MODE - No actual file operations will be performed"
    fi
    
    create_backup
    create_directories
    
    migrate_completion_reports
    migrate_strategy_documents  
    migrate_documentation
    migrate_thought_process
    
    cleanup_empty_directories
    
    log "Migration completed successfully!"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        success "All documentation has been migrated to the new structure"
        success "Backup created at: $BACKUP_DIR"
        echo ""
        log "New structure:"
        tree .documents/ 2>/dev/null || find .documents/ -type f | sort
    else
        echo ""
        success "Dry run completed - review the proposed changes above"
        echo ""
        log "To execute the migration, run:"
        log "$0"
    fi
}

# Run main function
main "$@" 