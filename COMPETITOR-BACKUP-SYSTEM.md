# 🏪 Competitor Backup & Restoration System

This system prevents data loss like what happened during the database migration by maintaining CSV backups of all competitors.

## 📁 Files Created

- `competitors-backup.csv` - Latest backup (always current)
- `backups/competitors-backup-YYYY-MM-DDTHH-MM-SS-sssZ.csv` - Timestamped backups
- `export-competitors-to-csv.js` - Export database to CSV
- `restore-competitors-from-csv.js` - Restore from CSV to database  
- `sync-competitors.js` - Sync between database and CSV
- `check-db.js` - Quick database check utility

## 🚀 Quick Commands

### Export (Database → CSV)
```bash
node export-competitors-to-csv.js
```

### Restore (CSV → Database) 
```bash
# Add new competitors from CSV (keeps existing)
node restore-competitors-from-csv.js

# Replace ALL competitors with CSV data
node restore-competitors-from-csv.js --clear

# Use specific CSV file
node restore-competitors-from-csv.js --file=backups/competitors-backup-2025-08-11T14-34-45-014Z.csv
```

### Sync Commands
```bash
# Export database to CSV (default)
node sync-competitors.js

# Import CSV to database (add new)
node sync-competitors.js csv-to-db

# Replace database with CSV
node sync-competitors.js csv-to-db-replace
```

### Check Database
```bash
node check-db.js
```

## 📊 Current Status

**25 Total Competitors:**
- **22 Real Food/Meal Kit Companies** (Butcher Box, HelloFresh, Blue Apron, etc.)
- **3 Legacy Test Competitors** (Direct Test, Fresh Server Test, Shared Competitor)

## 🛡️ Backup Strategy

1. **Automatic Export**: Run `node export-competitors-to-csv.js` after any major changes
2. **Version Control**: Timestamped backups are kept in `backups/` directory
3. **Quick Recovery**: Use `node restore-competitors-from-csv.js --clear` to completely restore from backup

## ⚠️ Important Notes

- CSV backup includes ALL competitor data (id, name, website, industry, description, etc.)
- Foreign key constraints may prevent deleting competitors with existing reports
- Always create backup before database migrations or major changes
- The `--clear` flag will DELETE ALL existing competitors before restoring

## 🔧 Recovery Scenarios

### After Migration Failure
```bash
# Restore all competitors from latest backup
node restore-competitors-from-csv.js --clear
```

### Add Missing Competitors
```bash  
# Add new competitors without replacing existing ones
node restore-competitors-from-csv.js
```

### Manual Recovery
Edit `competitors-backup.csv` manually, then:
```bash
node restore-competitors-from-csv.js --clear
```

## 📈 Data Format

CSV includes these fields:
- `id`, `name`, `website`, `industry`, `description`
- `employeeCount`, `revenue`, `founded`, `headquarters`  
- `socialMedia` (JSON), `createdAt`, `updatedAt`

---

**🎯 Never lose competitor data again!** Always backup before migrations.
