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
    TABLE_SCHEMA    AS schema_name,
    TABLE_NAME      AS view_name,
    NULL            AS create_date,
    NULL            AS modify_date,
    VIEW_DEFINITION AS definition
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_SCHEMA, TABLE_NAME
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
    NULL                                                       AS fill_factor
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
    NULL                                                       AS create_date,
    NULL                                                       AS default_schema,
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
    NULL                                                       AS create_date
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
    NULL                                                       AS encryption_state,
    NULL                                                       AS percent_complete,
    NULL                                                       AS key_algorithm,
    NULL                                                       AS key_length
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
