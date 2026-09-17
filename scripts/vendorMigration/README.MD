# Vendor Migration Scripts Documentation

## Overview

This directory contains SQL scripts for consolidating duplicate vendors and vendor products in the database. The migration preserves all data relationships and includes full merger tracking functionality.

**⚠️ CRITICAL: This is a complex, irreversible data migration. Always test on a copy of production data first.**

## Migration Goals

- **Consolidate duplicate vendors** by name while preserving all relationships
- **Consolidate duplicate vendor products** by vendor + product name combinations
- **Preserve merger tracking** with `merged_into_vendor_id` and `merger_effective_date` fields
- **Maintain data integrity** across all dependent tables
- **Provide complete rollback capability** via backup tables

## Prerequisites

### 1. Database Backup

```bash
# Create full database backup before starting
pg_dump your_database > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Maintenance Window

- Plan for **30-60 minutes** depending on data size
- Coordinate with team to avoid concurrent data changes
- Consider putting application in maintenance mode

### 3. Verify Current Schema

```sql
-- Check if merger fields exist in current schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vendors'
AND column_name IN ('merged_into_vendor_id', 'merger_effective_date');
```

## Migration Process

### Step 1: Setup and Preparation

```bash
# Navigate to migration directory
cd scripts/vendorMigration

# Option 1: Test on database copy (RECOMMENDED)
createdb your_database_test -T your_database
psql your_database_test -f 00_table_setup.sql

# Option 2: Transaction-based testing
psql your_database -c "BEGIN; \i 00_table_setup.sql; ROLLBACK;"
```

### Step 2: Execute Migration Scripts (IN ORDER)

**⚠️ Execute scripts in exact order - each depends on the previous:**

```bash
# 1. Create global tables and mapping structures
psql -f 00_table_setup.sql

# 2. Consolidate vendors (preserves merger relationships)
psql -f 01_g_vendors.sql

# NEW: 2b. Populate organization-specific ICT provider settings
psql -f 01b_populate_org_ict_settings.sql

# 3. Consolidate vendor products
psql -f 02_g_vendor_products.sql

# 4. Update foreign key values in dependent tables
psql -f 03_update_f_keys.sql

# 5. Consolidate vendor_products_users relationships
psql -f 03b_consolidate_vendor_product_users.sql

# 6. Rename global tables to final names and update constraints
psql -f 04_rename_tables.sql

# NEW: 6b. Drop global ict_provider column from final vendors table
psql -f 02a_drop_global_ict_provider.sql

# 7. Clean up original tables (creates backups first)
psql -f 05_drop_originals.sql

# 8. Recreate current_vendors view with merger support
psql -f 06_recreate_current_vendors_view.sql

# 9. Validate migration success
psql -f 07_validate_migration.sql
```

### Step 3: Validation and Verification

After completing the migration, the validation script (`07_validate_migration.sql`) will provide a comprehensive report. Look for:

- ✅ **MIGRATION SUCCESSFUL** - All checks passed
- ❌ **MIGRATION ISSUES DETECTED** - Review and address issues

**Key validation points:**

- No duplicate vendor names or product combinations
- All foreign key relationships intact
- Merger tracking fields properly configured
- No orphaned records
- Backup tables created successfully

## Rollback Procedures

### Automatic Rollback (Recommended)

If you need to rollback the migration, use the provided rollback script:

```bash
# Execute rollback script
psql -f 99_rollback_migration_fixed.sql
```

**What the rollback does:**

- Restores original `vendors` and `vendor_products` tables from backups
- Restores all original constraints and relationships
- Recreates original `current_vendors` view
- Restores merger tracking data if it existed
- Validates successful restoration

### Manual Rollback (Emergency)

If the automated rollback fails:

```sql
-- 1. Drop current tables
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS vendor_products CASCADE;

-- 2. Restore from backups (replace YYYYMMDD with actual date)
ALTER TABLE vendors_original_backup_YYYYMMDD RENAME TO vendors;
ALTER TABLE vendor_products_original_backup_YYYYMMDD RENAME TO vendor_products;

-- 3. Restore constraints (names may vary)
ALTER TABLE vendors RENAME CONSTRAINT vendors_original_backup_YYYYMMDD_pkey TO vendors_pkey;
ALTER TABLE vendor_products RENAME CONSTRAINT vendor_products_original_backup_YYYYMMDD_pkey TO vendor_products_pkey;

-- 4. Recreate foreign key constraints
-- (Reference dependent table list in 04_rename_tables.sql)
```

## Important Considerations

### Merger Field Support

The migration **fully supports** merger tracking:

- **`merged_into_vendor_id`**: Self-referencing FK to track vendor mergers
- **`merger_effective_date`**: Timestamp of merger
- **Self-referencing constraint**: Maintains referential integrity

If your current schema doesn't have these fields, they'll be added automatically.

### Data Consolidation Logic

**Vendors are consolidated by:**

- **Primary key**: `name` (case-sensitive)
- **Data aggregation**: Uses `MIN()` for most fields, `BOOL_OR()` for boolean fields
- **Merger preservation**: Maintains original merger relationships

**Products are consolidated by:**

- **Primary key**: `vendor_id + name` combination
- **Relationship preservation**: All user associations maintained

### Performance Considerations

**Expected consolidation:**

- Typically reduces vendor count by 15-25%
- Product reduction varies based on duplicate patterns
- Migration time scales with data volume and relationship complexity

### Tables Affected

**Primary tables:**

- `vendors` (consolidated)
- `vendor_products` (consolidated)

**Dependent tables updated:**

- `contracts`
- `vendor_products_details`
- `contract_relationships`
- `contract_users`
- `vendor_products_users`
- `corporate_actions`

## Troubleshooting

### Common Issues

**1. Constraint Violations**

```
ERROR: duplicate key value violates unique constraint
```

**Solution**: Review data for unexpected duplicates, check consolidation logic

**2. Foreign Key Errors**

```
ERROR: violates foreign key constraint
```

**Solution**: Verify mapping tables populated correctly, check step 3 execution

**3. Missing Merger Fields**

```
NOTICE: No merger fields in original schema
```

**Expected**: Migration will add these fields automatically

### Recovery Strategies

**If migration fails mid-process:**

1. **Identify last successful step** from console output
2. **Check database state** - which tables exist
3. **Use rollback script** to restore to original state
4. **Address root cause** before retry

**If rollback fails:**

1. **Use manual rollback procedure**
2. **Restore from full database backup** if necessary
3. **Contact database administrator** for assistance

## Validation Commands

### Pre-Migration Data Counts

```sql
-- Record baseline counts
SELECT COUNT(*) as total_vendors FROM vendors;
SELECT COUNT(DISTINCT name) as unique_vendor_names FROM vendors;
SELECT COUNT(*) as total_products FROM vendor_products;
SELECT COUNT(*) as contracts_with_vendors FROM contracts WHERE vendor_id IS NOT NULL;
```

### Post-Migration Verification

```sql
-- Verify consolidation results
SELECT COUNT(*) as consolidated_vendors FROM vendors;
SELECT COUNT(*) as consolidated_products FROM vendor_products;
SELECT COUNT(*) as current_vendors_view_records FROM current_vendors;

-- Check merger tracking
SELECT COUNT(*) as merger_relationships
FROM vendors WHERE merged_into_vendor_id IS NOT NULL;
```

## Scripts Reference

| Script                                     | Purpose                                              | Dependencies                                     |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `00_table_setup.sql`                       | Create global tables and mapping structures          | None                                             |
| `01_g_vendors.sql`                         | Consolidate vendors with merger preservation         | 00                                               |
| `01b_populate_org_ict_settings.sql`        | Populate organization-specific ICT provider settings | 00, 01 (and users, organizations tables)         |
| `02_g_vendor_products.sql`                 | Consolidate vendor products                          | 01b (implicitly 01 via map_old_vendor_to_global) |
| `03_update_f_keys.sql`                     | Update foreign key values in dependent tables        | 02                                               |
| `03b_consolidate_vendor_product_users.sql` | Consolidate user-product relationships               | 03                                               |
| `04_rename_tables.sql`                     | Rename global tables and update constraints          | 03b                                              |
| `05_drop_originals.sql`                    | Clean up original tables (with backup)               | 04                                               |
| `06_recreate_current_vendors_view.sql`     | Recreate view with merger support                    | 05                                               |
| `07_validate_migration.sql`                | Comprehensive migration validation                   | 06                                               |
| `99_rollback_migration_fixed.sql`          | Complete rollback to original state                  | Any                                              |

## Safety Features

- **Atomic transactions**: Each script uses `BEGIN`/`COMMIT`
- **Backup creation**: Original tables preserved with date stamps
- **Constraint validation**: Comprehensive integrity checking
- **Graceful error handling**: Scripts continue when possible
- **Detailed logging**: Extensive `RAISE NOTICE` statements
- **Rollback capability**: Full restoration possible

## Support

For issues during migration:

1. **Check validation output** for specific error details
2. **Review database logs** for additional error context
3. **Use rollback script** to restore if needed
4. **Test on copy of production data** before retry

---

**Last Updated**: $(date)  
**Migration Version**: v2.0 with full merger field support
