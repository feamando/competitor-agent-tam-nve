#!/bin/bash

# Remaining Documentation Migration Script
# Migrates all remaining .md files from docs/ directory
# Usage: ./scripts/migrate-remaining-docs.sh [--dry-run]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/remaining-docs-migration-$(date +%Y%m%d_%H%M%S)"
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

# Create backup function
create_backup() {
    if [[ "$DRY_RUN" == "false" ]]; then
        log "Creating backup at: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
        
        # Backup remaining docs files
        rsync -av --include="*.md" "$PROJECT_ROOT/docs/" "$BACKUP_DIR/" 2>/dev/null || \
        find "$PROJECT_ROOT/docs" -name "*.md" -type f \
            -exec sh -c 'mkdir -p "'$BACKUP_DIR'/$(dirname "${1#'$PROJECT_ROOT'/}")" && cp "$1" "'$BACKUP_DIR'/${1#'$PROJECT_ROOT'/}"' _ {} \;
        
        success "Backup created successfully"
    else
        success "Backup would be created at: $BACKUP_DIR"
    fi
}

# Get current highest numbers for each document type
get_current_numbers() {
    # Get highest CR number
    CR_MAX=$(find "$PROJECT_ROOT/.documents/completion-reports" -name "CR-*" 2>/dev/null | \
        sed 's/.*CR-\([0-9]*\)-.*/\1/' | sort -n | tail -1)
    CR_NEXT=$(((10#${CR_MAX:-0}) + 1))
    
    # Get highest D number  
    D_MAX=$(find "$PROJECT_ROOT/.documents/documentation" -name "D-*" 2>/dev/null | \
        sed 's/.*D-\([0-9]*\)-.*/\1/' | sort -n | tail -1)
    D_NEXT=$(((10#${D_MAX:-0}) + 1))
    
    # Get highest S number
    S_MAX=$(find "$PROJECT_ROOT/.documents/strategy" -name "S-*" 2>/dev/null | \
        sed 's/.*S-\([0-9]*\)-.*/\1/' | sort -n | tail -1)  
    S_NEXT=$(((10#${S_MAX:-0}) + 1))
    
    log "Current numbering: CR-$CR_NEXT, D-$D_NEXT, S-$S_NEXT"
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
        sed 's/IMPLEMENTATION/implementation/g' | \
        sed 's/COMPLETION/completion/g' | \
        tr 'A-Z' 'a-z' | \
        sed 's/_/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//g' | \
        sed 's/-$//g')
    
    echo "${category}-$(printf "%03d" $number)-${DATE}-${clean_name}.md"
}

# Classify and migrate files
classify_and_migrate() {
    local file="$1"
    local relative_path="${file#$PROJECT_ROOT/docs/}"
    local basename="$(basename "$file" .md)"
    local dirname="$(dirname "$relative_path")"
    
    local category=""
    local target_dir=""
    local counter=""
    
    # Classification logic based on path and filename
    case "$relative_path" in
        # Status reports and completion summaries -> Completion Reports
        status-reports/*|*COMPLETION_SUMMARY*|*COMPLETION_REPORT*|*_SUMMARY.md|CRITICAL_FIXES_SUMMARY.md|ITERATION_*|EXECUTIVE_SUMMARY.md|ISSUE_RESOLUTION_SUMMARY.md|BEDROCK_STATUS.md)
            category="CR"
            target_dir=".documents/completion-reports"
            counter=$CR_NEXT
            CR_NEXT=$((CR_NEXT + 1))
            ;;
        # Analysis files in testing subdirectory -> Completion Reports (test analysis)  
        analysis/testing/*)
            category="CR"
            target_dir=".documents/completion-reports"
            counter=$CR_NEXT
            CR_NEXT=$((CR_NEXT + 1))
            ;;
        # Requirements analysis -> Documentation
        analysis/*requirements*)
            category="D"
            target_dir=".documents/documentation"
            counter=$D_NEXT
            D_NEXT=$((D_NEXT + 1))
            ;;
        # Implementation files already exist, these must be additional ones -> Completion Reports
        implementation/*)
            category="CR"
            target_dir=".documents/completion-reports"
            counter=$CR_NEXT
            CR_NEXT=$((CR_NEXT + 1))
            ;;
        # Root level phase completion -> Completion Reports
        PHASE_*_COMPLETION_SUMMARY.md)
            category="CR"
            target_dir=".documents/completion-reports"
            counter=$CR_NEXT
            CR_NEXT=$((CR_NEXT + 1))
            ;;
        # Default case - treat as documentation
        *)
            category="D"
            target_dir=".documents/documentation"
            counter=$D_NEXT
            D_NEXT=$((D_NEXT + 1))
            ;;
    esac
    
    local new_name=$(generate_filename "$file" "$category" $counter)
    local target_path="$PROJECT_ROOT/$target_dir/$new_name"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        mv "$file" "$target_path"
    fi
    
    success "$category-$(printf "%03d" $counter): $(basename "$file") → $new_name"
}

# Main migration function
migrate_remaining_files() {
    log "Migrating remaining documentation files..."
    
    # Find all remaining .md files in docs/
    local count=0
    while IFS= read -r -d '' file; do
        classify_and_migrate "$file"
        ((count++))
    done < <(find "$PROJECT_ROOT/docs" -name "*.md" -type f -print0 2>/dev/null)
    
    log "Migrated $count additional files"
}

# Cleanup empty directories
cleanup_empty_directories() {
    log "Cleaning up empty directories..."
    
    # Remove empty directories in docs/
    find "$PROJECT_ROOT/docs" -type d -empty -delete 2>/dev/null || true
    
    success "Cleaned up empty directories"
}

# Main execution
main() {
    log "Starting remaining documentation migration..."
    log "Project root: $PROJECT_ROOT"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        warning "DRY RUN MODE - No actual file operations will be performed"
    fi
    
    get_current_numbers
    create_backup
    migrate_remaining_files
    cleanup_empty_directories
    
    log "Remaining documentation migration completed successfully!"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        success "All remaining documentation has been migrated"
        success "Backup created at: $BACKUP_DIR"
        echo ""
        log "Updated numbering:"
        log "Next CR: CR-$(printf "%03d" $CR_NEXT)"
        log "Next D: D-$(printf "%03d" $D_NEXT)"
        log "Next S: S-$(printf "%03d" $S_NEXT)"
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