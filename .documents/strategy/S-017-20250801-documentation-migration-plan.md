# Documentation Migration Plan

## Overview
This migration plan consolidates all project documentation into a standardized structure using the document classification naming convention: `[[type]]-[[number]]-[[date]]-[[name]]`

## Target Directory Structure

```
.documents/
├── task-plan/           # TP-XXX files
├── completion-reports/  # CR-XXX files  
├── strategy/           # S-XXX files
├── thought-process/    # TH-XXX files (moving from .cursor/rules/rapid-prototyping/tasks/)
└── documentation/      # D-XXX files
```

## Document Type Classifications

### Task Plans (TP)
- **Current:** TP-001 through TP-012 (already properly formatted)
- **Action:** Keep existing, ensure consistent location

### Completion Reports (CR) 
- **Target:** Implementation completion summaries, phase completions
- **Current:** All PHASE_*_COMPLETION_SUMMARY.md, TASK_*_COMPLETION_SUMMARY.md files
- **Next Number:** CR-001

### Strategy Documents (S)
- **Target:** High-level strategic documents, planning contexts
- **Current:** S-001 exists, various planning documents
- **Next Number:** S-002

### Thought Process (TH)
- **Current:** TH-001 through TH-004 (in .cursor/rules/rapid-prototyping/tasks/)
- **Action:** Move to .documents/thought-process/
- **Next Number:** TH-005

### Documentation (D)
- **Target:** Architecture docs, guides, references
- **Current:** API_REFERENCE.md, USER_GUIDE.md, TROUBLESHOOTING_GUIDE.md, etc.
- **Next Number:** D-001

## Migration Categories

### Category 1: Implementation Reports → Completion Reports (CR)
**Source:** docs/implementation/*_SUMMARY.md, *_COMPLETION_SUMMARY.md
**Target:** .documents/completion-reports/
**Count:** ~40 files
**Pattern:** Implementation summaries and completion reports

### Category 2: Testing Reports → Completion Reports (CR) 
**Source:** docs/testing/*.md
**Target:** .documents/completion-reports/
**Count:** ~11 files
**Pattern:** Test results and testing completion reports

### Category 3: Analysis Reports → Documentation (D)
**Source:** docs/analysis/*.md (excluding requirements analysis)
**Target:** .documents/documentation/
**Count:** ~7 files
**Pattern:** Technical analysis and assessment documents

### Category 4: Planning Documents → Strategy (S)
**Source:** docs/planning/*.md
**Target:** .documents/strategy/
**Count:** ~15 files
**Pattern:** Strategic planning and roadmap documents

### Category 5: Architecture Documentation → Documentation (D)
**Source:** docs/*.md (root level architectural docs)
**Target:** .documents/documentation/
**Count:** ~6 files
**Pattern:** API references, user guides, operational runbooks

### Category 6: Root Level Reports → Completion Reports (CR)
**Source:** Root *.md files (phase summaries, health audits)
**Target:** .documents/completion-reports/
**Count:** ~8 files
**Pattern:** Project phase completions and status reports

## File Exclusions
- reports/* (application output)
- README.md files (base documentation)
- node_modules/* (dependencies)
- test-results/*.md (test artifacts) 