"""
MySQL assessment queries.
Compatible with MySQL 5.7 / 8.0+ on any cloud platform:
  - Azure Database for MySQL (Single & Flexible Server)
  - AWS RDS MySQL / Aurora MySQL
  - GCP Cloud SQL for MySQL
  - PlanetScale, TiDB, on-premises MySQL

All queries produce the same column aliases as the SQL Server equivalents
so the same section keys and report builder work without changes.

Notes:
  - Uses information_schema exclusively for cloud compatibility
    (mysql.user / mysql.* system tables are restricted on managed services)
  - information_schema.USER_PRIVILEGES is accessible to all users with any grant
  - performance_schema access is checked gracefully via IFNULL/subselect
"""

# ── Core metadata ─────────────────────────────────────────────────────────────

OVERVIEW = """
SELECT
    DATABASE()                                                   AS database_name,
    USER()                                                       AS connected_user,
    VERSION()                                                    AS sql_version,
    (SELECT COUNT(DISTINCT TABLE_SCHEMA)
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA NOT IN (
         'information_schema','performance_schema','mysql','sys')
    )                                                            AS schema_count,
    (SELECT COUNT(*)
     FROM information_schema.TABLES
     WHERE TABLE_TYPE = 'BASE TABLE'
       AND TABLE_SCHEMA = DATABASE()
    )                                                            AS table_count,
    (SELECT COUNT(*)
     FROM information_schema.VIEWS
     WHERE TABLE_SCHEMA = DATABASE()
    )                                                            AS view_count,
    (SELECT COUNT(*)
     FROM information_schema.ROUTINES
     WHERE ROUTINE_TYPE = 'PROCEDURE'
       AND ROUTINE_SCHEMA = DATABASE()
    )                                                            AS proc_count,
    (SELECT COUNT(*)
     FROM information_schema.ROUTINES
     WHERE ROUTINE_TYPE = 'FUNCTION'
       AND ROUTINE_SCHEMA = DATABASE()
    )                                                            AS func_count,
    COALESCE(
        ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / (1024.0 * 1024.0), 2),
        0
    )                                                            AS total_size_mb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
"""

SCHEMAS = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    SUM(TABLE_TYPE = 'BASE TABLE')                            AS table_count,
    SUM(TABLE_TYPE = 'VIEW')                                  AS view_count,
    (SELECT COUNT(*) FROM information_schema.ROUTINES r
     WHERE r.ROUTINE_SCHEMA = t.TABLE_SCHEMA)                 AS proc_count
FROM information_schema.TABLES t
WHERE TABLE_SCHEMA NOT IN (
    'information_schema','performance_schema','mysql','sys')
GROUP BY TABLE_SCHEMA
ORDER BY TABLE_SCHEMA
"""

TABLES = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    (SELECT COUNT(*) FROM information_schema.COLUMNS c
     WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
       AND c.TABLE_NAME   = t.TABLE_NAME)                     AS column_count,
    TABLE_ROWS                                                 AS row_count,
    COALESCE(ROUND((DATA_LENGTH + INDEX_LENGTH) / (1024.0 * 1024.0), 4), 0) AS size_mb,
    DATE_FORMAT(CREATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS create_date,
    DATE_FORMAT(UPDATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS modify_date
FROM information_schema.TABLES t
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_SCHEMA, TABLE_NAME
"""

COLUMNS = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    ORDINAL_POSITION                                           AS column_id,
    COLUMN_NAME                                                AS column_name,
    DATA_TYPE                                                  AS data_type,
    CHARACTER_MAXIMUM_LENGTH                                   AS max_length,
    NUMERIC_PRECISION                                          AS precision,
    NUMERIC_SCALE                                              AS scale,
    IS_NULLABLE,
    CASE WHEN EXTRA LIKE '%auto_increment%' THEN 'YES' ELSE 'NO' END AS is_identity,
    CASE WHEN COLUMN_KEY = 'PRI' THEN 'YES' ELSE 'NO' END     AS is_primary_key,
    CASE WHEN COLUMN_KEY IN ('MUL','UNI') THEN 'YES' ELSE 'NO' END AS is_foreign_key,
    COLUMN_DEFAULT                                             AS default_value
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
"""

VIEWS = """
SELECT
    v.TABLE_SCHEMA                                               AS schema_name,
    v.TABLE_NAME                                                 AS view_name,
    DATE_FORMAT(t.CREATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS create_date,
    DATE_FORMAT(t.UPDATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS modify_date,
    v.VIEW_DEFINITION                                            AS definition
FROM information_schema.VIEWS v
LEFT JOIN information_schema.TABLES t
  ON t.TABLE_SCHEMA = v.TABLE_SCHEMA
 AND t.TABLE_NAME   = v.TABLE_NAME
WHERE v.TABLE_SCHEMA = DATABASE()
ORDER BY v.TABLE_SCHEMA, v.TABLE_NAME
"""

STORED_PROCEDURES = """
SELECT
    ROUTINE_SCHEMA                                             AS schema_name,
    ROUTINE_NAME                                               AS procedure_name,
    DATE_FORMAT(CREATED,      '%Y-%m-%dT%H:%i:%s')            AS create_date,
    DATE_FORMAT(LAST_ALTERED, '%Y-%m-%dT%H:%i:%s')            AS modify_date,
    (SELECT COUNT(*) FROM information_schema.PARAMETERS p
     WHERE p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA
       AND p.SPECIFIC_NAME   = r.ROUTINE_NAME)                AS param_count
FROM information_schema.ROUTINES r
WHERE ROUTINE_TYPE = 'PROCEDURE'
  AND ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
"""

FUNCTIONS = """
SELECT
    ROUTINE_SCHEMA                                             AS schema_name,
    ROUTINE_NAME                                               AS function_name,
    DATA_TYPE                                                  AS function_type,
    DATE_FORMAT(CREATED,      '%Y-%m-%dT%H:%i:%s')            AS create_date,
    DATE_FORMAT(LAST_ALTERED, '%Y-%m-%dT%H:%i:%s')            AS modify_date
FROM information_schema.ROUTINES
WHERE ROUTINE_TYPE = 'FUNCTION'
  AND ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
"""

INDEXES = """
SELECT
    s.TABLE_SCHEMA                                             AS schema_name,
    s.TABLE_NAME                                               AS table_name,
    s.INDEX_NAME                                               AS index_name,
    s.INDEX_TYPE                                               AS index_type,
    CASE WHEN s.NON_UNIQUE = 0 THEN 'YES' ELSE 'NO' END       AS is_unique,
    CASE WHEN s.INDEX_NAME = 'PRIMARY' THEN 'YES' ELSE 'NO' END AS is_primary_key,
    'NO'                                                       AS is_unique_constraint,
    GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX SEPARATOR ', ') AS indexed_columns,
    0                                                          AS fill_factor
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = DATABASE()
GROUP BY s.TABLE_SCHEMA, s.TABLE_NAME, s.INDEX_NAME, s.INDEX_TYPE, s.NON_UNIQUE
ORDER BY s.TABLE_SCHEMA, s.TABLE_NAME, s.INDEX_NAME
"""

RELATIONSHIPS = """
SELECT
    kcu.CONSTRAINT_NAME                                        AS fk_name,
    kcu.TABLE_SCHEMA                                           AS parent_schema,
    kcu.TABLE_NAME                                             AS parent_table,
    kcu.COLUMN_NAME                                            AS parent_column,
    kcu.REFERENCED_TABLE_SCHEMA                               AS ref_schema,
    kcu.REFERENCED_TABLE_NAME                                  AS ref_table,
    kcu.REFERENCED_COLUMN_NAME                                 AS ref_column,
    rc.DELETE_RULE                                             AS on_delete,
    rc.UPDATE_RULE                                             AS on_update
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
 AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
WHERE kcu.TABLE_SCHEMA = DATABASE()
  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY kcu.TABLE_SCHEMA, kcu.TABLE_NAME
"""

INDEX_COVERAGE = """
SELECT
    t.TABLE_SCHEMA                                             AS schema_name,
    t.TABLE_NAME                                               AS table_name,
    COUNT(DISTINCT s.INDEX_NAME)                               AS index_count,
    CASE
        WHEN COUNT(DISTINCT s.INDEX_NAME) = 0 THEN 'No indexes'
        WHEN COUNT(DISTINCT s.INDEX_NAME) = 1 THEN 'Minimal coverage'
        ELSE 'Good coverage'
    END                                                        AS coverage
FROM information_schema.TABLES t
LEFT JOIN information_schema.STATISTICS s
  ON s.TABLE_SCHEMA = t.TABLE_SCHEMA
 AND s.TABLE_NAME   = t.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND t.TABLE_SCHEMA = DATABASE()
GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
"""

INSERTION_FREQUENCY = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    TABLE_ROWS                                                 AS current_rows,
    DATE_FORMAT(CREATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS create_date,
    DATE_FORMAT(UPDATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS modify_date,
    DATEDIFF(NOW(), CREATE_TIME)                               AS age_days,
    CASE
        WHEN DATEDIFF(NOW(), CREATE_TIME) > 0
        THEN ROUND(TABLE_ROWS / DATEDIFF(NOW(), CREATE_TIME), 2)
        ELSE NULL
    END                                                        AS avg_rows_per_day
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_SCHEMA, TABLE_NAME
"""

# Null analysis — dynamically built in assessment_service using parameterised queries
NULL_ANALYSIS_COLUMNS = "PARAMETERISED"

# ── Security ─────────────────────────────────────────────────────────────────

# Uses information_schema.USER_PRIVILEGES instead of mysql.user
# because mysql.user requires SUPER privilege — not available on most cloud platforms.
DB_USERS_ROLES = """
SELECT DISTINCT
    REPLACE(GRANTEE, '''', '')                                 AS principal_name,
    'LOGIN'                                                    AS principal_type,
    'N/A'                                                      AS create_date,
    'N/A'                                                      AS default_schema,
    GRANTEE                                                    AS server_login,
    GROUP_CONCAT(PRIVILEGE_TYPE ORDER BY PRIVILEGE_TYPE SEPARATOR ', ') AS roles
FROM information_schema.USER_PRIVILEGES
GROUP BY GRANTEE
ORDER BY GRANTEE
"""

ORPHANED_USERS = """
SELECT NULL AS user_name, NULL AS user_type, NULL AS create_date, NULL AS default_schema
WHERE false
"""

# Superuser detection via USER_PRIVILEGES (cloud-safe)
DB_OWNER_MEMBERS = """
SELECT DISTINCT
    REPLACE(GRANTEE, '''', '')                                 AS member_name,
    'LOGIN'                                                    AS member_type,
    GRANTEE                                                    AS server_login,
    'N/A'                                                      AS create_date
FROM information_schema.USER_PRIVILEGES
WHERE PRIVILEGE_TYPE IN ('SUPER','ALL PRIVILEGES','GRANT OPTION')
ORDER BY GRANTEE
"""

DYNAMIC_SQL_USAGE = """
SELECT
    ROUTINE_TYPE                                               AS object_type,
    ROUTINE_SCHEMA                                             AS schema_name,
    ROUTINE_NAME                                               AS object_name,
    'PREPARE/EXECUTE'                                         AS dynamic_sql_type
FROM information_schema.ROUTINES
WHERE (ROUTINE_DEFINITION LIKE '%PREPARE%'
    OR ROUTINE_DEFINITION LIKE '%EXECUTE%')
  AND ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
"""

CLR_ASSEMBLIES = """
SELECT NULL AS assembly_name, NULL AS permission_set, NULL AS create_date,
       NULL AS modify_date, NULL AS is_visible, NULL AS clr_object_count
WHERE false
"""

# Cloud-safe TDE check — tries performance_schema, falls back gracefully
TDE_STATUS = """
SELECT
    DATABASE()                                                 AS database_name,
    COALESCE(
        (SELECT VARIABLE_VALUE
         FROM performance_schema.global_variables
         WHERE VARIABLE_NAME IN (
             'innodb_encrypt_tables',
             'innodb_tablespace_encryption')
         LIMIT 1),
        'N/A'
    )                                                          AS tde_status,
    'N/A (MySQL uses SSL/TLS at connection level)'             AS encryption_state,
    0                                                          AS percent_complete,
    'N/A'                                                      AS key_algorithm,
    0                                                          AS key_length
"""

COLUMN_ENCRYPTION = """
SELECT NULL AS schema_name, NULL AS table_name, NULL AS column_name,
       NULL AS data_type, NULL AS encryption_key_name, NULL AS encryption_type
WHERE false
"""

PII_INDICATORS = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CASE
        WHEN COLUMN_NAME LIKE '%email%' OR COLUMN_NAME LIKE '%mail%'
                                                               THEN 'Email'
        WHEN COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%'
          OR COLUMN_NAME LIKE '%tel%'                          THEN 'Phone'
        WHEN COLUMN_NAME LIKE '%ssn%' OR COLUMN_NAME LIKE '%social_security%'
                                                               THEN 'SSN'
        WHEN COLUMN_NAME LIKE '%password%' OR COLUMN_NAME LIKE '%passwd%'
          OR COLUMN_NAME LIKE '%pwd%'                          THEN 'Password'
        WHEN COLUMN_NAME LIKE '%credit%' OR COLUMN_NAME LIKE '%card%'
          OR COLUMN_NAME LIKE '%cvv%'                          THEN 'Payment'
        WHEN COLUMN_NAME LIKE '%dob%' OR COLUMN_NAME LIKE '%birth%'
                                                               THEN 'DOB'
        WHEN COLUMN_NAME LIKE '%address%' OR COLUMN_NAME LIKE '%postcode%'
          OR COLUMN_NAME LIKE '%zipcode%'                      THEN 'Address'
        WHEN COLUMN_NAME LIKE '%passport%' OR COLUMN_NAME LIKE '%license%'
          OR COLUMN_NAME LIKE '%licence%'                      THEN 'ID Document'
        WHEN COLUMN_NAME LIKE '%salary%' OR COLUMN_NAME LIKE '%income%'
          OR COLUMN_NAME LIKE '%wage%'                         THEN 'Financial'
        WHEN COLUMN_NAME LIKE '%ip_addr%' OR COLUMN_NAME LIKE '%ip_address%'
                                                               THEN 'IP Address'
    END                                                        AS pii_category
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    COLUMN_NAME LIKE '%email%'    OR COLUMN_NAME LIKE '%mail%'
    OR COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%'
    OR COLUMN_NAME LIKE '%tel%'
    OR COLUMN_NAME LIKE '%ssn%'   OR COLUMN_NAME LIKE '%social_security%'
    OR COLUMN_NAME LIKE '%password%' OR COLUMN_NAME LIKE '%passwd%'
    OR COLUMN_NAME LIKE '%pwd%'
    OR COLUMN_NAME LIKE '%credit%' OR COLUMN_NAME LIKE '%card%'
    OR COLUMN_NAME LIKE '%cvv%'
    OR COLUMN_NAME LIKE '%dob%'   OR COLUMN_NAME LIKE '%birth%'
    OR COLUMN_NAME LIKE '%address%' OR COLUMN_NAME LIKE '%postcode%'
    OR COLUMN_NAME LIKE '%zipcode%'
    OR COLUMN_NAME LIKE '%passport%' OR COLUMN_NAME LIKE '%license%'
    OR COLUMN_NAME LIKE '%licence%'
    OR COLUMN_NAME LIKE '%salary%' OR COLUMN_NAME LIKE '%income%'
    OR COLUMN_NAME LIKE '%wage%'
    OR COLUMN_NAME LIKE '%ip_addr%' OR COLUMN_NAME LIKE '%ip_address%'
  )
ORDER BY TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
"""

# ── Feature usage ─────────────────────────────────────────────────────────────

SQL_AGENT_JOBS = """
SELECT NULL AS job_name, NULL AS status, NULL AS description,
       NULL AS date_created, NULL AS date_modified,
       NULL AS failure_count, NULL AS last_run_status
WHERE false
"""

LINKED_SERVERS = """
SELECT NULL AS linked_server_name, NULL AS product, NULL AS provider,
       NULL AS data_source, NULL AS remote_login_enabled,
       NULL AS data_access_enabled, NULL AS rpc_out_enabled, NULL AS modify_date
WHERE false
"""

CROSS_DB_REFERENCES = """
SELECT NULL AS object_type, NULL AS schema_name, NULL AS object_name,
       NULL AS referenced_database, NULL AS referenced_schema,
       NULL AS referenced_entity
WHERE false
"""

REPLICATION_STATUS = """
SELECT
    DATABASE()                                                 AS database_name,
    false                                                      AS has_replicated_tables,
    0                                                          AS replicated_table_count,
    false                                                      AS is_publisher,
    false                                                      AS is_subscriber,
    false                                                      AS is_merge_published
"""

SERVICE_BROKER = """
SELECT NULL AS database_name, NULL AS broker_status, NULL AS user_queue_count,
       NULL AS user_service_count, NULL AS active_conversations
WHERE false
"""

VERSION_FEATURES = """
SELECT
    @@hostname                                                 AS server_name,
    VERSION()                                                  AS product_version,
    NULL                                                       AS product_level,
    NULL                                                       AS product_update_level,
    @@version_compile_os                                       AS edition,
    'MySQL'                                                    AS engine_edition,
    false                                                      AS is_clustered,
    false                                                      AS hadr_enabled,
    (SELECT COUNT(*) FROM information_schema.PLUGINS
     WHERE PLUGIN_NAME IN ('ngram','MeCab')
       AND PLUGIN_STATUS = 'ACTIVE') > 0                      AS fulltext_installed,
    false                                                      AS clr_enabled,
    false                                                      AS xp_cmdshell_enabled,
    false                                                      AS ole_automation_enabled,
    false                                                      AS adhoc_distributed_queries
"""

# ── Schema / Design checks ────────────────────────────────────────────────────

TRUSTWORTHY_DATABASES = """
SELECT
    DATABASE()                                                 AS database_name,
    'N/A (MySQL has no trustworthy concept)'                   AS trustworthy_status,
    CASE @@global.local_infile
         WHEN 1 THEN 'RISK: LOCAL INFILE enabled'
         ELSE        'OK'
    END                                                        AS cross_db_chaining,
    'ONLINE'                                                   AS state_desc,
    @@global.transaction_isolation                             AS recovery_model_desc
"""

DEPRECATED_DATA_TYPES = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    COLUMN_NAME                                                AS column_name,
    DATA_TYPE                                                  AS data_type,
    CASE DATA_TYPE
        WHEN 'tinyblob'   THEN 'DEPRECATED — use blob or varbinary'
        WHEN 'mediumblob' THEN 'CAUTION — very large binary; consider external storage'
        WHEN 'longblob'   THEN 'CAUTION — very large binary; consider external storage'
        WHEN 'tinytext'   THEN 'DEPRECATED — use varchar'
        WHEN 'mediumtext' THEN 'CAUTION — large text; use text or varchar'
        WHEN 'longtext'   THEN 'CAUTION — very large text; consider external storage'
        WHEN 'set'        THEN 'AVOID — use a normalised lookup table instead'
        WHEN 'enum'       THEN 'CAUTION — schema change required to add values'
        WHEN 'year'       THEN 'AVOID — use date or smallint'
        WHEN 'float'      THEN 'CAUTION — imprecise; use decimal for finance'
        WHEN 'double'     THEN 'CAUTION — imprecise; use decimal for finance'
        ELSE 'REVIEW'
    END                                                        AS recommendation
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND DATA_TYPE IN (
      'tinyblob','mediumblob','longblob',
      'tinytext','mediumtext','longtext',
      'set','enum','year','float','double'
  )
ORDER BY DATA_TYPE, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
"""

MISSING_PRIMARY_KEYS = """
SELECT
    t.TABLE_SCHEMA                                             AS schema_name,
    t.TABLE_NAME                                               AS table_name,
    t.TABLE_ROWS                                               AS row_count,
    'No primary key constraint defined'                        AS finding
FROM information_schema.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND t.TABLE_SCHEMA = DATABASE()
  AND NOT EXISTS (
      SELECT 1 FROM information_schema.TABLE_CONSTRAINTS tc
      WHERE tc.TABLE_SCHEMA      = t.TABLE_SCHEMA
        AND tc.TABLE_NAME        = t.TABLE_NAME
        AND tc.CONSTRAINT_TYPE   = 'PRIMARY KEY'
  )
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
"""

HEAP_TABLES = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    TABLE_ROWS                                                 AS row_count,
    COALESCE(ROUND((DATA_LENGTH + INDEX_LENGTH) / (1024.0 * 1024.0), 4), 0) AS size_mb,
    CASE ENGINE
        WHEN 'MEMORY' THEN 'HEAP table: data lost on server restart'
        ELSE CONCAT('No primary key on ', ENGINE, ' table — full scans on every query')
    END                                                        AS finding
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA = DATABASE()
  AND (ENGINE = 'MEMORY'
       OR TABLE_NAME NOT IN (
           SELECT tc.TABLE_NAME
           FROM information_schema.TABLE_CONSTRAINTS tc
           WHERE tc.TABLE_SCHEMA    = DATABASE()
             AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
       ))
ORDER BY TABLE_ROWS DESC
"""

UNTRUSTED_CONSTRAINTS = """
SELECT
    'TABLE ENGINE'                                             AS constraint_type,
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    ENGINE                                                     AS constraint_name,
    CASE ENGINE WHEN 'InnoDB' THEN 'Enforced' ELSE 'NOT Enforced' END AS trust_status,
    'N/A'                                                      AS enabled_status,
    CASE ENGINE
        WHEN 'InnoDB'  THEN 'OK — InnoDB enforces FK constraints'
        WHEN 'MyISAM'  THEN 'RISK: FK constraints silently ignored on MyISAM'
        WHEN 'MEMORY'  THEN 'RISK: FK constraints not supported on MEMORY engine'
        ELSE CONCAT('REVIEW: FK enforcement unknown for engine ', ENGINE)
    END                                                        AS finding
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE   = 'BASE TABLE'
  AND ENGINE != 'InnoDB'
ORDER BY TABLE_NAME
"""

SP_NAMING_VIOLATIONS = """
SELECT
    ROUTINE_SCHEMA                                             AS schema_name,
    ROUTINE_NAME                                               AS procedure_name,
    CASE
        WHEN ROUTINE_NAME LIKE 'sp_%'
            THEN 'sp_ prefix — no special risk in MySQL but inconsistent with conventions'
        WHEN ROUTINE_NAME LIKE 'proc_%'
            THEN 'proc_ prefix — redundant with ROUTINE_TYPE'
        WHEN ROUTINE_NAME REGEXP BINARY '^[A-Z]'
            THEN 'Starts with uppercase — prefer consistent snake_case naming'
        ELSE 'Non-standard naming pattern'
    END                                                        AS finding
FROM information_schema.ROUTINES
WHERE ROUTINE_TYPE = 'PROCEDURE'
  AND ROUTINE_SCHEMA = DATABASE()
  AND (ROUTINE_NAME LIKE 'sp_%'
    OR ROUTINE_NAME LIKE 'proc_%'
    OR ROUTINE_NAME REGEXP BINARY '^[A-Z]')
ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
"""

DUPLICATE_INDEXES = """
SELECT
    s1.TABLE_SCHEMA                                            AS schema_name,
    s1.TABLE_NAME                                              AS table_name,
    s1.INDEX_NAME                                              AS index1_name,
    s2.INDEX_NAME                                              AS index2_name,
    s1.INDEX_TYPE                                              AS index_type,
    GROUP_CONCAT(DISTINCT s1.COLUMN_NAME
                 ORDER BY s1.SEQ_IN_INDEX SEPARATOR ', ')      AS shared_key_columns,
    'Duplicate leading key columns — consider consolidating'   AS finding
FROM information_schema.STATISTICS s1
JOIN information_schema.STATISTICS s2
  ON s2.TABLE_SCHEMA  = s1.TABLE_SCHEMA
 AND s2.TABLE_NAME    = s1.TABLE_NAME
 AND s2.INDEX_NAME    > s1.INDEX_NAME
 AND s2.COLUMN_NAME   = s1.COLUMN_NAME
 AND s2.SEQ_IN_INDEX  = s1.SEQ_IN_INDEX
WHERE s1.TABLE_SCHEMA = DATABASE()
  AND s1.INDEX_NAME  != 'PRIMARY'
  AND s2.INDEX_NAME  != 'PRIMARY'
GROUP BY s1.TABLE_SCHEMA, s1.TABLE_NAME, s1.INDEX_NAME, s2.INDEX_NAME, s1.INDEX_TYPE
ORDER BY s1.TABLE_SCHEMA, s1.TABLE_NAME
"""

DATABASE_OPTIONS_AUDIT = """
SELECT
    DATABASE()                                                 AS database_name,
    @@global.transaction_isolation                             AS recovery_model_desc,
    'InnoDB'                                                   AS page_verify_option_desc,
    @@global.version                                           AS compatibility_level,
    @@global.character_set_database                            AS collation_name,
    'ONLINE'                                                   AS state_desc,
    CASE @@global.innodb_file_per_table
         WHEN 1 THEN 'OK — file-per-table mode'
         ELSE        'CAUTION: shared tablespace — cannot reclaim space after DELETE'
    END                                                        AS auto_close,
    CASE @@global.innodb_stats_auto_recalc
         WHEN 1 THEN 'OK'
         ELSE        'RISK: Auto stats recalc disabled'
    END                                                        AS auto_shrink,
    CASE @@global.innodb_flush_log_at_trx_commit
         WHEN 1 THEN 'OK — ACID compliant (flush per commit)'
         ELSE        'RISK: Not fully ACID — data loss possible on crash'
    END                                                        AS page_verify_status,
    CASE @@global.innodb_stats_auto_recalc
         WHEN 1 THEN 'Enabled' ELSE 'RISK: Disabled'
    END                                                        AS auto_update_stats,
    CASE @@global.innodb_stats_auto_recalc
         WHEN 1 THEN 'Enabled' ELSE 'RISK: Disabled'
    END                                                        AS auto_create_stats,
    CASE @@global.read_only
         WHEN 1 THEN 'Read-Only' ELSE 'Read-Write'
    END                                                        AS access_mode
"""

OBJECT_PERMISSIONS = """
SELECT
    PRIVILEGE_TYPE                                             AS permission_state,
    PRIVILEGE_TYPE                                             AS permission_name,
    TABLE_NAME                                                 AS object_class,
    TABLE_NAME                                                 AS object_name,
    TABLE_SCHEMA                                               AS schema_name,
    GRANTEE,
    'USER'                                                     AS grantee_type
FROM information_schema.TABLE_PRIVILEGES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_SCHEMA, TABLE_NAME, GRANTEE
"""

# ── Performance checks ────────────────────────────────────────────────────────

MISSING_INDEXES = """
SELECT
    OBJECT_SCHEMA                                              AS schema_name,
    OBJECT_NAME                                                AS table_name,
    'N/A'                                                      AS equality_columns,
    'N/A'                                                      AS inequality_columns,
    'N/A'                                                      AS included_columns,
    COUNT_READ                                                 AS improvement_score,
    COUNT_READ                                                 AS user_seeks,
    COUNT_FETCH                                                AS user_scans,
    0                                                          AS avg_impact_pct,
    'N/A'                                                      AS last_user_seek
FROM performance_schema.table_io_waits_summary_by_table
WHERE OBJECT_SCHEMA = DATABASE()
  AND COUNT_READ > 0
ORDER BY COUNT_READ DESC
LIMIT 50
"""

INDEX_USAGE_STATS = """
SELECT
    OBJECT_SCHEMA                                              AS schema_name,
    OBJECT_NAME                                                AS table_name,
    INDEX_NAME                                                 AS index_name,
    'BTREE'                                                    AS type_desc,
    COUNT_FETCH                                                AS user_seeks,
    COUNT_READ                                                 AS user_scans,
    0                                                          AS user_lookups,
    COUNT_INSERT + COUNT_UPDATE + COUNT_DELETE                 AS user_updates,
    'N/A'                                                      AS last_user_seek,
    'N/A'                                                      AS last_user_update,
    CASE
        WHEN COUNT_FETCH = 0 AND COUNT_READ = 0 THEN 'Never Used'
        WHEN COUNT_FETCH + COUNT_READ < 100      THEN 'Rarely Used'
        ELSE                                          'Active'
    END                                                        AS index_status
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE OBJECT_SCHEMA = DATABASE()
  AND INDEX_NAME IS NOT NULL
ORDER BY COUNT_FETCH DESC
"""

FRAGMENTATION_REPORT = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    'TABLE'                                                    AS index_name,
    ENGINE                                                     AS type_desc,
    CASE
        WHEN DATA_FREE > 0 AND (DATA_LENGTH + INDEX_LENGTH) > 0
        THEN ROUND(100.0 * DATA_FREE / (DATA_LENGTH + INDEX_LENGTH + DATA_FREE), 2)
        ELSE 0
    END                                                        AS fragmentation_pct,
    TABLE_ROWS                                                 AS page_count,
    CASE
        WHEN DATA_FREE > 0
         AND 100.0 * DATA_FREE / NULLIF(DATA_LENGTH + INDEX_LENGTH + DATA_FREE, 0) > 30
            THEN 'OPTIMIZE TABLE recommended (>30% fragmented)'
        WHEN DATA_FREE > 0
         AND 100.0 * DATA_FREE / NULLIF(DATA_LENGTH + INDEX_LENGTH + DATA_FREE, 0) > 10
            THEN 'Consider OPTIMIZE TABLE (10-30% fragmented)'
        ELSE 'OK'
    END                                                        AS recommendation
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE   = 'BASE TABLE'
  AND TABLE_ROWS   > 100
ORDER BY DATA_FREE DESC
LIMIT 100
"""

STATISTICS_HEALTH = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    TABLE_NAME                                                 AS table_name,
    'table_stats'                                              AS stat_name,
    DATE_FORMAT(UPDATE_TIME, '%Y-%m-%dT%H:%i:%s')             AS last_updated,
    TABLE_ROWS                                                 AS rows,
    TABLE_ROWS                                                 AS rows_sampled,
    100.0                                                      AS sample_pct,
    0                                                          AS modification_counter,
    CASE
        WHEN UPDATE_TIME IS NULL
            THEN 'No update timestamp (managed service — check cloud metrics)'
        WHEN DATEDIFF(NOW(), UPDATE_TIME) > 30
            THEN 'OLD — table not modified in 30+ days'
        ELSE 'OK'
    END                                                        AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE   = 'BASE TABLE'
ORDER BY UPDATE_TIME ASC
LIMIT 100
"""

# ── Reliability / config checks ───────────────────────────────────────────────

BACKUP_HISTORY = """
SELECT
    DATABASE()                                                 AS database_name,
    'N/A (use cloud backup console)'                           AS last_full_backup,
    'N/A'                                                      AS last_diff_backup,
    'N/A'                                                      AS last_log_backup,
    0                                                          AS hours_since_full_backup,
    0                                                          AS hours_since_log_backup,
    CASE @@global.log_bin
         WHEN 1 THEN 'Binary Logging (PITR capable)'
         ELSE        'NOARCHIVELOG'
    END                                                        AS recovery_model_desc,
    CASE @@global.log_bin
         WHEN 1 THEN 'Binary logging enabled — PITR possible via mysqlbinlog'
         ELSE        'WARNING: Binary logging disabled — no PITR capability'
    END                                                        AS backup_status
"""

SERVER_CONFIGURATIONS = """
SELECT
    VARIABLE_NAME                                              AS config_name,
    VARIABLE_VALUE                                             AS configured_value,
    VARIABLE_VALUE                                             AS running_value,
    'N/A'                                                      AS min_value,
    'N/A'                                                      AS max_value,
    'N/A'                                                      AS description,
    CASE
        WHEN VARIABLE_NAME = 'max_connections'
         AND CAST(VARIABLE_VALUE AS UNSIGNED) > 500
            THEN 'WARNING: High max_connections — consider ProxySQL or connection pooling'
        WHEN VARIABLE_NAME = 'innodb_buffer_pool_size'
         AND CAST(VARIABLE_VALUE AS UNSIGNED) < 134217728
            THEN 'RECOMMEND: buffer pool should be 50-75% of available RAM'
        WHEN VARIABLE_NAME = 'slow_query_log'
         AND VARIABLE_VALUE = 'OFF'
            THEN 'RECOMMEND: enable slow query log for performance analysis'
        WHEN VARIABLE_NAME = 'innodb_flush_log_at_trx_commit'
         AND VARIABLE_VALUE != '1'
            THEN 'RISK: Not ACID compliant — data loss possible on crash'
        WHEN VARIABLE_NAME = 'sync_binlog'
         AND VARIABLE_VALUE = '0'
            THEN 'RISK: sync_binlog=0 — binlog may lose entries on crash'
        WHEN VARIABLE_NAME = 'log_bin'
         AND VARIABLE_VALUE = 'OFF'
            THEN 'RISK: Binary logging disabled — no PITR capability'
        ELSE 'OK'
    END                                                        AS recommendation
FROM performance_schema.global_variables
WHERE VARIABLE_NAME IN (
    'max_connections','innodb_buffer_pool_size','innodb_log_file_size',
    'slow_query_log','slow_query_log_file','long_query_time',
    'innodb_flush_log_at_trx_commit','sync_binlog','log_bin',
    'max_allowed_packet','wait_timeout','interactive_timeout',
    'innodb_file_per_table','innodb_stats_auto_recalc',
    'character_set_server','collation_server','sql_mode',
    'innodb_lock_wait_timeout','transaction_isolation'
)
ORDER BY VARIABLE_NAME
"""

WEAK_SQL_LOGINS = """
SELECT DISTINCT
    REPLACE(GRANTEE, '''', '')                                 AS login_name,
    'LOGIN'                                                    AS type_desc,
    'Enabled'                                                  AS login_status,
    CASE WHEN SUM(CASE WHEN PRIVILEGE_TYPE IN (
                        'ALL PRIVILEGES','SUPER','GRANT OPTION')
                       THEN 1 ELSE 0 END) OVER (PARTITION BY GRANTEE) > 0
         THEN 'Has superuser — RISK'
         ELSE 'OK'
    END                                                        AS password_policy,
    'N/A — managed by cloud service'                           AS expiration_policy,
    'N/A'                                                      AS password_last_set,
    0                                                          AS bad_password_count,
    0                                                          AS days_until_expiration,
    CASE WHEN SUM(CASE WHEN PRIVILEGE_TYPE IN (
                        'ALL PRIVILEGES','SUPER','GRANT OPTION')
                       THEN 1 ELSE 0 END) OVER (PARTITION BY GRANTEE) > 0
         THEN 'RISK: Account has superuser-level privileges'
         ELSE 'OK'
    END                                                        AS assessment
FROM information_schema.USER_PRIVILEGES
ORDER BY login_name
"""

SERVER_PERMISSIONS = """
SELECT
    PRIVILEGE_TYPE                                             AS server_role,
    REPLACE(GRANTEE, '''', '')                                 AS member_name,
    'LOGIN'                                                    AS type_desc,
    'Enabled'                                                  AS login_status,
    'N/A'                                                      AS member_since
FROM information_schema.USER_PRIVILEGES
WHERE PRIVILEGE_TYPE IN (
    'ALL PRIVILEGES','SUPER','CREATE','CREATE USER',
    'GRANT OPTION','RELOAD','SHUTDOWN','PROCESS',
    'FILE','REFERENCES','CREATE TABLESPACE'
)
ORDER BY PRIVILEGE_TYPE, GRANTEE
"""

DEPRECATED_FEATURES_IN_USE = """
SELECT
    DATA_TYPE                                                  AS deprecated_feature,
    COUNT(*)                                                   AS usage_count_since_restart
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND DATA_TYPE IN (
      'tinyblob','mediumblob','longblob',
      'tinytext','mediumtext','longtext',
      'set','enum','year','float','double'
  )
GROUP BY DATA_TYPE
ORDER BY COUNT(*) DESC
"""

# ── Schema / ETL classification ───────────────────────────────────────────────

SCHEMA_CLASSIFICATION = """
SELECT
    TABLE_SCHEMA                                               AS schema_name,
    COUNT(CASE WHEN TABLE_TYPE = 'BASE TABLE' THEN 1 END)     AS table_count,
    COUNT(CASE WHEN TABLE_TYPE = 'VIEW'       THEN 1 END)     AS view_count,
    (SELECT COUNT(*) FROM information_schema.ROUTINES r
     WHERE r.ROUTINE_SCHEMA = t.TABLE_SCHEMA)                 AS proc_count,
    CASE
        WHEN TABLE_SCHEMA IN ('stg','staging','raw','bronze','landing')
            THEN 'Staging / Landing'
        WHEN TABLE_SCHEMA IN ('etl','ctrl','control','pipeline','meta','metadata')
            THEN 'ETL Control'
        WHEN TABLE_SCHEMA IN ('lkp','lookup','ref','reference','dim','config')
            THEN 'Lookup / Reference'
        WHEN TABLE_SCHEMA IN ('app','reporting','rpt','fact','mart','gold','silver')
            THEN 'Business / Reporting'
        WHEN TABLE_SCHEMA IN ('error','err','log','audit','trace')
            THEN 'Error / Audit'
        WHEN TABLE_SCHEMA IN ('bi','dwh','dw','warehouse','ods','datamart')
            THEN 'Data Warehouse'
        ELSE 'Other — review'
    END                                                        AS schema_classification,
    CASE
        WHEN TABLE_SCHEMA IN ('stg','staging','raw','bronze','landing')
            THEN 'Transient staging — migrate pipelines to Fabric Bronze/Silver'
        WHEN TABLE_SCHEMA IN ('etl','ctrl','control','pipeline','meta','metadata')
            THEN 'ETL orchestration — replace with Fabric Data Pipelines'
        WHEN TABLE_SCHEMA IN ('lkp','lookup','ref','reference','dim','config')
            THEN 'Reference data — move to Fabric Gold layer'
        WHEN TABLE_SCHEMA IN ('app','reporting','rpt','fact','mart','gold','silver')
            THEN 'Core business logic — migrate to Fabric Gold Warehouse'
        WHEN TABLE_SCHEMA IN ('error','err','log','audit','trace')
            THEN 'Operational logs — replace with Fabric Monitor Hub'
        WHEN TABLE_SCHEMA IN ('bi','dwh','dw','warehouse','ods','datamart')
            THEN 'Data warehouse layer — migrate to Fabric Lakehouse'
        ELSE 'Review and classify before migration planning'
    END                                                        AS migration_recommendation
FROM information_schema.TABLES t
WHERE TABLE_SCHEMA NOT IN (
    'information_schema','performance_schema','mysql','sys'
)
GROUP BY TABLE_SCHEMA
ORDER BY schema_classification, TABLE_SCHEMA
"""

SP_COMPLEXITY = """
SELECT
    ROUTINE_SCHEMA                                             AS schema_name,
    ROUTINE_NAME                                               AS procedure_name,
    DATE_FORMAT(CREATED,      '%Y-%m-%dT%H:%i:%s')            AS create_date,
    DATE_FORMAT(LAST_ALTERED, '%Y-%m-%dT%H:%i:%s')            AS modify_date,
    (SELECT COUNT(*) FROM information_schema.PARAMETERS p
     WHERE p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA
       AND p.SPECIFIC_NAME   = r.ROUTINE_NAME)                AS param_count,
    CHAR_LENGTH(ROUTINE_DEFINITION)                            AS char_length,
    CHAR_LENGTH(ROUTINE_DEFINITION)
        - CHAR_LENGTH(REPLACE(ROUTINE_DEFINITION, '\n', ''))  AS line_count,
    CASE WHEN ROUTINE_DEFINITION LIKE '%CURSOR%'
         THEN 'Yes' ELSE 'No' END                             AS uses_cursor,
    CASE WHEN ROUTINE_DEFINITION LIKE '%TEMPORARY TABLE%'
          OR  ROUTINE_DEFINITION LIKE '%CREATE TEMP%'
         THEN 'Yes' ELSE 'No' END                             AS uses_temp_table,
    CASE WHEN ROUTINE_DEFINITION LIKE '%PREPARE%'
          OR  ROUTINE_DEFINITION LIKE '%EXECUTE%'
         THEN 'Yes' ELSE 'No' END                             AS uses_dynamic_sql,
    CASE WHEN ROUTINE_DEFINITION LIKE '%DECLARE%HANDLER%'
         THEN 'Yes' ELSE 'No' END                             AS has_error_handling,
    CASE WHEN ROUTINE_DEFINITION LIKE '%COMMIT%'
          OR  ROUTINE_DEFINITION LIKE '%ROLLBACK%'
         THEN 'Yes' ELSE 'No' END                             AS uses_transactions,
    CASE
        WHEN CHAR_LENGTH(COALESCE(ROUTINE_DEFINITION,'')) > 10000 THEN 'HIGH — refactor candidate'
        WHEN CHAR_LENGTH(COALESCE(ROUTINE_DEFINITION,'')) >  3000 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                        AS complexity_level
FROM information_schema.ROUTINES r
WHERE ROUTINE_TYPE   = 'PROCEDURE'
  AND ROUTINE_SCHEMA = DATABASE()
ORDER BY char_length DESC
"""

VIEW_COMPLEXITY = """
SELECT
    v.TABLE_SCHEMA                                             AS schema_name,
    v.TABLE_NAME                                               AS view_name,
    DATE_FORMAT(t.CREATE_TIME, '%Y-%m-%dT%H:%i:%s')           AS create_date,
    DATE_FORMAT(t.UPDATE_TIME, '%Y-%m-%dT%H:%i:%s')           AS modify_date,
    CHAR_LENGTH(v.VIEW_DEFINITION)                             AS char_length,
    CHAR_LENGTH(v.VIEW_DEFINITION)
        - CHAR_LENGTH(REPLACE(v.VIEW_DEFINITION, '\n', ''))   AS line_count,
    (CHAR_LENGTH(UPPER(v.VIEW_DEFINITION))
        - CHAR_LENGTH(REPLACE(UPPER(v.VIEW_DEFINITION),'JOIN',''))) / 4 AS join_count,
    GREATEST((CHAR_LENGTH(UPPER(v.VIEW_DEFINITION))
        - CHAR_LENGTH(REPLACE(UPPER(v.VIEW_DEFINITION),'SELECT',''))) / 6 - 1, 0) AS subquery_count,
    CASE WHEN UPPER(v.VIEW_DEFINITION) LIKE '%UNION%'
         THEN 'Yes' ELSE 'No' END                             AS has_union,
    CASE WHEN UPPER(v.VIEW_DEFINITION) LIKE '%WITH%AS%SELECT%'
         THEN 'Yes' ELSE 'No' END                             AS has_cte,
    CASE
        WHEN CHAR_LENGTH(COALESCE(v.VIEW_DEFINITION,'')) > 5000 THEN 'HIGH — consider materializing'
        WHEN CHAR_LENGTH(COALESCE(v.VIEW_DEFINITION,'')) > 1500 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                        AS complexity_level
FROM information_schema.VIEWS v
LEFT JOIN information_schema.TABLES t
  ON t.TABLE_SCHEMA = v.TABLE_SCHEMA
 AND t.TABLE_NAME   = v.TABLE_NAME
WHERE v.TABLE_SCHEMA = DATABASE()
ORDER BY char_length DESC
"""

DATABASE_FILES = """
SELECT
    TABLE_SCHEMA                                               AS file_name,
    'N/A (managed by host OS)'                                 AS physical_name,
    'DATABASE'                                                  AS file_type,
    COALESCE(ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / (1024.0*1024.0), 2), 0) AS size_mb,
    'Unlimited'                                                AS max_size,
    CASE @@global.innodb_file_per_table
         WHEN 1 THEN 'Per-table ibd files (OK)'
         ELSE        'Shared ibdata (CAUTION: space not reclaimed after DELETE)'
    END                                                        AS auto_growth,
    'ONLINE'                                                   AS file_state,
    CASE @@global.innodb_file_per_table
         WHEN 1 THEN 'OK — file-per-table mode enabled'
         ELSE        'CAUTION: Shared tablespace — enable innodb_file_per_table'
    END                                                        AS recommendation
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
GROUP BY TABLE_SCHEMA
"""

# ── SQL Server-only stubs (return empty result set with correct columns) ──────

SSIS_CATALOG_PACKAGES = """
SELECT NULL AS folder_name, NULL AS project_name, NULL AS package_name,
       NULL AS description,  NULL AS last_deployed, NULL AS entry_type,
       NULL AS package_format_version
WHERE false
"""

SSIS_EXECUTION_HISTORY = """
SELECT NULL AS folder_name, NULL AS project_name, NULL AS package_name,
       NULL AS status,       NULL AS start_time,   NULL AS end_time,
       NULL AS duration_sec, NULL AS executed_as_name
WHERE false
"""

SSIS_MSDB_PACKAGES = """
SELECT NULL AS folder_name, NULL AS package_name, NULL AS create_date,
       NULL AS package_type, NULL AS vermajor,    NULL AS verminor
WHERE false
"""

SQL_AGENT_JOB_SCHEDULES = """
SELECT NULL AS job_name,         NULL AS job_status,
       NULL AS schedule_name,    NULL AS schedule_status,
       NULL AS frequency_type,   NULL AS freq_interval,
       NULL AS intraday_frequency,
       NULL AS active_start_time, NULL AS active_end_time,
       NULL AS next_run_date
WHERE false
"""

SQL_AGENT_JOB_STEPS = """
SELECT NULL AS job_name,     NULL AS job_status,
       NULL AS step_id,      NULL AS step_name,
       NULL AS step_type,    NULL AS database_name,
       NULL AS retry_attempts, NULL AS retry_interval_min,
       NULL AS on_success,   NULL AS on_fail
WHERE false
"""

SSAS_LINKED_SERVERS = """
SELECT NULL AS linked_server_name, NULL AS product,
       NULL AS provider,            NULL AS data_source,
       NULL AS remote_login_enabled,NULL AS modify_date,
       NULL AS finding
WHERE false
"""

# ── Performance — wait stats & query store ────────────────────────────────────

WAIT_STATISTICS = """
SELECT
    EVENT_NAME                                                 AS wait_type,
    ROUND(SUM_TIMER_WAIT / 1000000000000.0, 2)                AS total_wait_sec,
    ROUND(MAX_TIMER_WAIT / 1000000000000.0, 2)                AS max_wait_sec,
    COUNT_STAR                                                 AS waiting_tasks_count,
    ROUND(100.0 * SUM_TIMER_WAIT / NULLIF(SUM(SUM_TIMER_WAIT) OVER(), 0), 2) AS pct_total_wait,
    CASE
        WHEN EVENT_NAME LIKE '%io%'    THEN 'I/O — disk read bottleneck'
        WHEN EVENT_NAME LIKE '%lock%'  THEN 'Locking — blocking / deadlock pressure'
        WHEN EVENT_NAME LIKE '%mutex%' THEN 'Mutex — memory contention'
        WHEN EVENT_NAME LIKE '%net%'   THEN 'Network — client consuming results slowly'
        WHEN EVENT_NAME LIKE '%cond%'  THEN 'Condition — thread synchronization'
        ELSE 'Other — review'
    END                                                        AS interpretation
FROM performance_schema.events_waits_summary_global_by_event_name
WHERE COUNT_STAR > 0
  AND SUM_TIMER_WAIT > 0
  AND EVENT_NAME NOT LIKE '%idle%'
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 25
"""

QUERY_STORE_TOP_QUERIES = """
SELECT
    DIGEST                                                     AS query_id,
    LEFT(DIGEST_TEXT, 500)                                     AS query_text,
    ROUND(AVG_TIMER_WAIT / 1000000000.0, 2)                   AS avg_duration_ms,
    ROUND(MAX_TIMER_WAIT / 1000000000.0, 2)                   AS max_duration_ms,
    ROUND(AVG_TIMER_WAIT / 1000000000.0, 2)                   AS avg_cpu_ms,
    SUM_ROWS_EXAMINED / NULLIF(COUNT_STAR, 0)                  AS avg_logical_reads,
    COUNT_STAR                                                 AS total_executions,
    DATE_FORMAT(LAST_SEEN, '%Y-%m-%dT%H:%i:%s')               AS last_executed,
    CASE
        WHEN AVG_TIMER_WAIT / 1000000000.0 > 5000 THEN 'CRITICAL: avg > 5 sec'
        WHEN AVG_TIMER_WAIT / 1000000000.0 > 1000 THEN 'WARNING: avg > 1 sec'
        ELSE 'OK'
    END                                                        AS performance_flag
FROM performance_schema.events_statements_summary_by_digest
WHERE LAST_SEEN >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND DIGEST_TEXT IS NOT NULL
ORDER BY AVG_TIMER_WAIT DESC
LIMIT 25
"""
