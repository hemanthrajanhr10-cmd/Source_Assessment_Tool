"""
PostgreSQL assessment queries.
Compatible with PostgreSQL 11+ on any cloud platform:
  - Azure Database for PostgreSQL (Single & Flexible Server)
  - AWS RDS PostgreSQL / Aurora PostgreSQL
  - GCP Cloud SQL for PostgreSQL
  - Supabase, Neon, on-premises PostgreSQL

All queries produce the same column aliases as the SQL Server equivalents
so the same section keys and report builder work without changes.
"""

# ── Core metadata ─────────────────────────────────────────────────────────────

OVERVIEW = """
SELECT
    current_database()                                              AS database_name,
    current_user                                                    AS connected_user,
    version()                                                       AS sql_version,
    (SELECT COUNT(*) FROM information_schema.schemata
     WHERE schema_name NOT IN (
         'information_schema','pg_catalog','pg_toast',
         'pg_temp_1','pg_toast_temp_1'))                           AS schema_count,
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT IN ('information_schema','pg_catalog')) AS table_count,
    (SELECT COUNT(*) FROM information_schema.views
     WHERE table_schema NOT IN ('information_schema','pg_catalog')) AS view_count,
    (SELECT COUNT(*) FROM information_schema.routines
     WHERE routine_type = 'PROCEDURE'
       AND routine_schema NOT IN ('information_schema','pg_catalog')) AS proc_count,
    (SELECT COUNT(*) FROM information_schema.routines
     WHERE routine_type = 'FUNCTION'
       AND routine_schema NOT IN ('information_schema','pg_catalog')) AS func_count,
    ROUND(pg_database_size(current_database()) / (1024.0 * 1024.0), 2) AS total_size_mb
"""

SCHEMAS = """
SELECT
    schema_name,
    (SELECT COUNT(*) FROM information_schema.tables t
     WHERE t.table_schema = s.schema_name
       AND t.table_type = 'BASE TABLE') AS table_count,
    (SELECT COUNT(*) FROM information_schema.views v
     WHERE v.table_schema = s.schema_name)      AS view_count,
    (SELECT COUNT(*) FROM information_schema.routines r
     WHERE r.routine_schema = s.schema_name)    AS proc_count
FROM information_schema.schemata s
WHERE schema_name NOT IN (
    'information_schema','pg_catalog','pg_toast',
    'pg_temp_1','pg_toast_temp_1')
ORDER BY schema_name
"""

TABLES = """
SELECT
    t.table_schema                                     AS schema_name,
    t.table_name,
    (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_schema = t.table_schema
       AND c.table_name   = t.table_name)              AS column_count,
    COALESCE(
        ROUND(
            pg_total_relation_size(
                (quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass
            ) / (1024.0 * 1024.0), 4
        ), 0
    )                                                  AS size_mb,
    COALESCE(s.n_live_tup::text, '0')                  AS row_count,
    'N/A'                                              AS create_date,
    TO_CHAR(
        COALESCE(s.last_analyze, s.last_autoanalyze),
        'YYYY-MM-DD HH24:MI:SS'
    )                                                  AS modify_date
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables s
  ON s.schemaname = t.table_schema
 AND s.relname    = t.table_name
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY t.table_schema, t.table_name
"""

COLUMNS = """
SELECT
    c.table_schema                                                         AS schema_name,
    c.table_name,
    c.ordinal_position                                                     AS column_id,
    c.column_name,
    c.data_type,
    c.character_maximum_length                                             AS max_length,
    c.numeric_precision                                                    AS precision,
    c.numeric_scale                                                        AS scale,
    c.is_nullable,
    CASE WHEN c.column_default LIKE '%nextval%' THEN 'YES' ELSE 'NO' END  AS is_identity,
    CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END         AS is_primary_key,
    CASE WHEN fk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END         AS is_foreign_key,
    c.column_default                                                       AS default_value
FROM information_schema.columns c
LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name   = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
) pk ON pk.table_schema = c.table_schema
     AND pk.table_name   = c.table_name
     AND pk.column_name  = c.column_name
LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name   = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
) fk ON fk.table_schema = c.table_schema
     AND fk.table_name   = c.table_name
     AND fk.column_name  = c.column_name
WHERE c.table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
"""

VIEWS = """
SELECT
    table_schema    AS schema_name,
    table_name      AS view_name,
    'N/A'           AS create_date,
    'N/A'           AS modify_date,
    view_definition AS definition
FROM information_schema.views
WHERE table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY table_schema, table_name
"""

STORED_PROCEDURES = """
SELECT
    routine_schema  AS schema_name,
    routine_name    AS procedure_name,
    'N/A'           AS create_date,
    'N/A'           AS modify_date,
    COALESCE(
        (SELECT COUNT(*) FROM information_schema.parameters p
         WHERE p.specific_schema = r.routine_schema
           AND p.specific_name   = r.specific_name), 0
    )               AS param_count
FROM information_schema.routines r
WHERE routine_type = 'PROCEDURE'
  AND routine_schema NOT IN ('information_schema','pg_catalog')
ORDER BY routine_schema, routine_name
"""

FUNCTIONS = """
SELECT
    routine_schema  AS schema_name,
    routine_name    AS function_name,
    data_type       AS function_type,
    'N/A'           AS create_date,
    'N/A'           AS modify_date
FROM information_schema.routines
WHERE routine_type = 'FUNCTION'
  AND routine_schema NOT IN ('information_schema','pg_catalog')
ORDER BY routine_schema, routine_name
"""

INDEXES = """
SELECT
    pi2.schemaname                                         AS schema_name,
    pi2.tablename                                          AS table_name,
    pi2.indexname                                          AS index_name,
    COALESCE(am.amname, 'BTREE')                          AS index_type,
    CASE WHEN ix.indisunique   THEN 'YES' ELSE 'NO' END   AS is_unique,
    CASE WHEN ix.indisprimary  THEN 'YES' ELSE 'NO' END   AS is_primary_key,
    CASE WHEN ix.indisunique AND NOT ix.indisprimary
         THEN 'YES' ELSE 'NO' END                         AS is_unique_constraint,
    pi2.indexdef                                          AS indexed_columns,
    COALESCE(c.relfillfactor, 0)                          AS fill_factor
FROM pg_indexes pi2
LEFT JOIN pg_class      c   ON c.relname    = pi2.indexname
                            AND c.relkind   = 'i'
LEFT JOIN pg_index      ix  ON ix.indexrelid = c.oid
LEFT JOIN pg_am         am  ON am.oid        = c.relam
WHERE pi2.schemaname NOT IN ('information_schema','pg_catalog','pg_toast')
ORDER BY pi2.schemaname, pi2.tablename, pi2.indexname
"""

RELATIONSHIPS = """
SELECT
    tc.constraint_name              AS fk_name,
    kcu.table_schema                AS parent_schema,
    kcu.table_name                  AS parent_table,
    kcu.column_name                 AS parent_column,
    ccu.table_schema                AS ref_schema,
    ccu.table_name                  AS ref_table,
    ccu.column_name                 AS ref_column,
    rc.delete_rule                  AS on_delete,
    rc.update_rule                  AS on_update
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = tc.constraint_name
 AND kcu.constraint_schema = tc.constraint_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name    = tc.constraint_name
 AND rc.constraint_schema  = tc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = rc.unique_constraint_name
 AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.constraint_schema NOT IN ('information_schema','pg_catalog')
ORDER BY kcu.table_schema, kcu.table_name
"""

INDEX_COVERAGE = """
SELECT
    t.table_schema               AS schema_name,
    t.table_name,
    COUNT(DISTINCT i.indexname)  AS index_count,
    CASE
        WHEN COUNT(DISTINCT i.indexname) = 0 THEN 'No indexes'
        WHEN COUNT(DISTINCT i.indexname) = 1 THEN 'Minimal coverage'
        ELSE 'Good coverage'
    END                          AS coverage
FROM information_schema.tables t
LEFT JOIN pg_indexes i
  ON i.schemaname = t.table_schema
 AND i.tablename  = t.table_name
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
GROUP BY t.table_schema, t.table_name
ORDER BY t.table_schema, t.table_name
"""

INSERTION_FREQUENCY = """
SELECT
    t.table_schema                                       AS schema_name,
    t.table_name,
    COALESCE(s.n_live_tup, 0)                            AS current_rows,
    'N/A'                                                AS create_date,
    TO_CHAR(
        COALESCE(s.last_analyze, s.last_autoanalyze),
        'YYYY-MM-DD HH24:MI:SS'
    )                                                    AS modify_date,
    0                                                    AS age_days,
    0.0                                                  AS avg_rows_per_day
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables s
  ON s.schemaname = t.table_schema
 AND s.relname    = t.table_name
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY t.table_schema, t.table_name
"""

# Null analysis — dynamically built in assessment_service using parameterised queries
NULL_ANALYSIS_COLUMNS = "PARAMETERISED"

# ── Security ─────────────────────────────────────────────────────────────────

DB_USERS_ROLES = """
SELECT
    rolname         AS principal_name,
    CASE
        WHEN rolsuper    THEN 'SUPERUSER'
        WHEN rolcanlogin THEN 'LOGIN'
        ELSE 'GROUP'
    END             AS principal_type,
    'N/A'           AS create_date,
    'public'        AS default_schema,
    rolname         AS server_login,
    COALESCE(
        (SELECT string_agg(r2.rolname, ', ' ORDER BY r2.rolname)
         FROM pg_auth_members am2
         JOIN pg_roles r2 ON r2.oid = am2.roleid
         WHERE am2.member = pg_roles.oid),
        'None'
    )               AS roles
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
  AND rolname NOT IN (
      'rds_ad','rdsadmin','rds_superuser',
      'azure_pg_admin','azuresu','replication',
      'azure_superuser','pg_monitor','pg_read_all_settings',
      'pg_read_all_stats','pg_stat_scan_tables','pg_signal_backend')
ORDER BY rolname
"""

ORPHANED_USERS = """
SELECT
    NULL::text AS user_name,
    NULL::text AS user_type,
    NULL::text AS create_date,
    NULL::text AS default_schema
WHERE false
"""

DB_OWNER_MEMBERS = """
SELECT
    m.rolname       AS member_name,
    'ROLE'          AS member_type,
    NULL::text      AS server_login,
    NULL::text      AS create_date
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE r.rolsuper = true
   OR r.rolname IN ('rds_superuser','azure_pg_admin','pg_read_all_data','cloudsqlsuperuser')
ORDER BY m.rolname
"""

DYNAMIC_SQL_USAGE = """
SELECT
    routine_type    AS object_type,
    routine_schema  AS schema_name,
    routine_name    AS object_name,
    'EXECUTE'       AS dynamic_sql_type
FROM information_schema.routines
WHERE (routine_definition ILIKE '%EXECUTE%'
    OR routine_definition ILIKE '%FORMAT%'
    OR routine_definition ILIKE '%PERFORM%')
  AND routine_schema NOT IN ('information_schema','pg_catalog')
ORDER BY routine_schema, routine_name
"""

CLR_ASSEMBLIES = """
SELECT
    NULL::text AS assembly_name,
    NULL::text AS permission_set,
    NULL::text AS create_date,
    NULL::text AS modify_date,
    NULL::text AS is_visible,
    NULL::int  AS clr_object_count
WHERE false
"""

TDE_STATUS = """
SELECT
    current_database()                                AS database_name,
    'N/A - Use SSL/TLS at connection level'           AS tde_status,
    CASE WHEN (SELECT count(*) FROM pg_stat_ssl WHERE pid = pg_backend_pid()) > 0
         THEN 'SSL Active'
         ELSE 'No SSL at session level' END           AS encryption_state,
    0::float                                          AS percent_complete,
    'N/A'                                             AS key_algorithm,
    0::int                                            AS key_length
"""

COLUMN_ENCRYPTION = """
SELECT
    NULL::text AS schema_name,
    NULL::text AS table_name,
    NULL::text AS column_name,
    NULL::text AS data_type,
    NULL::text AS encryption_key_name,
    NULL::text AS encryption_type
WHERE false
"""

PII_INDICATORS = """
SELECT
    c.table_schema  AS schema_name,
    c.table_name,
    c.column_name,
    c.data_type,
    CASE
        WHEN c.column_name ILIKE ANY(ARRAY['%email%','%mail%'])
                                                              THEN 'Email'
        WHEN c.column_name ILIKE ANY(ARRAY['%phone%','%mobile%','%tel%'])
                                                              THEN 'Phone'
        WHEN c.column_name ILIKE ANY(ARRAY['%ssn%','%social_security%','%nino%'])
                                                              THEN 'SSN/NI'
        WHEN c.column_name ILIKE ANY(ARRAY['%password%','%passwd%','%pwd%'])
                                                              THEN 'Password'
        WHEN c.column_name ILIKE ANY(ARRAY['%credit%','%card%','%cvv%'])
                                                              THEN 'Payment'
        WHEN c.column_name ILIKE ANY(ARRAY['%dob%','%birth%','%birthdate%'])
                                                              THEN 'DOB'
        WHEN c.column_name ILIKE ANY(ARRAY['%address%','%postcode%','%zipcode%'])
                                                              THEN 'Address'
        WHEN c.column_name ILIKE ANY(ARRAY['%passport%','%license%','%licence%'])
                                                              THEN 'ID Document'
        WHEN c.column_name ILIKE ANY(ARRAY['%salary%','%income%','%wage%'])
                                                              THEN 'Financial'
        WHEN c.column_name ILIKE ANY(ARRAY['%ip_addr%','%ip_address%','%ipaddr%'])
                                                              THEN 'IP Address'
    END AS pii_category
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('information_schema','pg_catalog')
  AND c.column_name ILIKE ANY(ARRAY[
      '%email%','%mail%','%phone%','%mobile%','%tel%',
      '%ssn%','%social_security%','%nino%',
      '%password%','%passwd%','%pwd%',
      '%credit%','%card%','%cvv%',
      '%dob%','%birth%','%birthdate%',
      '%address%','%postcode%','%zipcode%',
      '%passport%','%license%','%licence%',
      '%salary%','%income%','%wage%',
      '%ip_addr%','%ip_address%','%ipaddr%'
  ])
ORDER BY c.table_schema, c.table_name, c.column_name
"""

# ── Feature usage ─────────────────────────────────────────────────────────────

SQL_AGENT_JOBS = """
SELECT
    NULL::text AS job_name,
    NULL::text AS status,
    NULL::text AS description,
    NULL::text AS date_created,
    NULL::text AS date_modified,
    NULL::int  AS failure_count,
    NULL::text AS last_run_status
WHERE false
"""

LINKED_SERVERS = """
SELECT
    foreign_server_name       AS linked_server_name,
    foreign_data_wrapper_name AS product,
    NULL::text                AS provider,
    NULL::text                AS data_source,
    'NO'                      AS remote_login_enabled,
    'YES'                     AS data_access_enabled,
    'NO'                      AS rpc_out_enabled,
    NULL::text                AS modify_date
FROM information_schema.foreign_servers
ORDER BY foreign_server_name
"""

CROSS_DB_REFERENCES = """
SELECT
    NULL::text AS object_type,
    NULL::text AS schema_name,
    NULL::text AS object_name,
    NULL::text AS referenced_database,
    NULL::text AS referenced_schema,
    NULL::text AS referenced_entity
WHERE false
"""

REPLICATION_STATUS = """
SELECT
    current_database()                              AS database_name,
    (SELECT COUNT(*) FROM pg_replication_slots) > 0 AS has_replicated_tables,
    (SELECT COUNT(*) FROM pg_replication_slots)     AS replicated_table_count,
    (NOT pg_is_in_recovery())                       AS is_publisher,
    pg_is_in_recovery()                             AS is_subscriber,
    false                                           AS is_merge_published
"""

SERVICE_BROKER = """
SELECT
    NULL::text AS database_name,
    NULL::text AS broker_status,
    NULL::int  AS user_queue_count,
    NULL::int  AS user_service_count,
    NULL::int  AS active_conversations
WHERE false
"""

VERSION_FEATURES = """
SELECT
    COALESCE(
        current_setting('listen_addresses', true),
        'N/A'
    )                                                         AS server_name,
    version()                                                 AS product_version,
    NULL::text                                                AS product_level,
    NULL::text                                                AS product_update_level,
    'PostgreSQL'                                              AS edition,
    'PostgreSQL'                                              AS engine_edition,
    false                                                     AS is_clustered,
    (SELECT COUNT(*) FROM pg_replication_slots) > 0          AS hadr_enabled,
    EXISTS(
        SELECT 1 FROM pg_available_extensions
        WHERE name IN ('pg_trgm','fuzzystrmatch')
    )                                                         AS fulltext_installed,
    false                                                     AS clr_enabled,
    false                                                     AS xp_cmdshell_enabled,
    false                                                     AS ole_automation_enabled,
    false                                                     AS adhoc_distributed_queries
"""

# ── Schema / Design checks ────────────────────────────────────────────────────

TRUSTWORTHY_DATABASES = """
SELECT
    datname                                                   AS database_name,
    CASE WHEN datistemplate THEN 'Template DB — RISK' ELSE 'Regular DB — OK' END AS trustworthy_status,
    CASE WHEN NOT datallowconn THEN 'Connections Blocked' ELSE 'Connections Allowed' END AS cross_db_chaining,
    'ONLINE'                                                  AS state_desc,
    'N/A'                                                     AS recovery_model_desc
FROM pg_database
WHERE datname = current_database()
"""

DEPRECATED_DATA_TYPES = """
SELECT
    c.table_schema                                            AS schema_name,
    c.table_name,
    c.column_name,
    c.data_type,
    CASE c.data_type
        WHEN 'money'
            THEN 'CAUTION — rounding errors; use numeric(19,4)'
        WHEN 'character'
            THEN 'CAUTION — fixed char pads with spaces; use varchar'
        WHEN 'timestamp without time zone'
            THEN 'CAUTION — no timezone info; use timestamptz'
        WHEN 'xml'
            THEN 'CAUTION — limited driver support; consider jsonb'
        ELSE 'REVIEW'
    END                                                       AS recommendation
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('information_schema','pg_catalog')
  AND c.data_type IN (
      'money','character','timestamp without time zone','xml'
  )
ORDER BY c.data_type, c.table_schema, c.table_name, c.column_name
"""

MISSING_PRIMARY_KEYS = """
SELECT
    t.table_schema                                            AS schema_name,
    t.table_name,
    NULL::bigint                                              AS row_count,
    'No primary key constraint defined'                       AS finding
FROM information_schema.tables t
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
  AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      WHERE tc.table_schema    = t.table_schema
        AND tc.table_name      = t.table_name
        AND tc.constraint_type = 'PRIMARY KEY'
  )
ORDER BY t.table_schema, t.table_name
"""

HEAP_TABLES = """
SELECT
    t.table_schema                                            AS schema_name,
    t.table_name,
    NULL::bigint                                              AS row_count,
    NULL::numeric                                             AS size_mb,
    'No indexes defined — every query requires a full sequential scan' AS finding
FROM information_schema.tables t
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
  AND NOT EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname = t.table_schema
        AND i.tablename  = t.table_name
  )
ORDER BY t.table_schema, t.table_name
"""

UNTRUSTED_CONSTRAINTS = """
SELECT
    CASE con.contype WHEN 'f' THEN 'FOREIGN KEY' ELSE 'CHECK CONSTRAINT' END AS constraint_type,
    n.nspname                                                 AS schema_name,
    c.relname                                                 AS table_name,
    con.conname                                               AS constraint_name,
    CASE WHEN con.convalidated THEN 'Validated' ELSE 'Not Validated — RISK' END AS trust_status,
    'Enabled'                                                 AS enabled_status,
    CASE WHEN NOT con.convalidated
         THEN 'NOT VALID — optimizer ignores this constraint; data integrity not guaranteed'
         ELSE 'OK'
    END                                                       AS finding
FROM pg_constraint con
JOIN pg_class     c   ON c.oid       = con.conrelid
JOIN pg_namespace n   ON n.oid       = c.relnamespace
WHERE con.contype IN ('f','c')
  AND NOT con.convalidated
  AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
ORDER BY constraint_type, schema_name, table_name
"""

SP_NAMING_VIOLATIONS = """
SELECT
    routine_schema                                            AS schema_name,
    routine_name                                              AS procedure_name,
    CASE
        WHEN routine_name LIKE 'sp_%'
            THEN 'sp_ prefix — no special meaning in PostgreSQL; causes confusion'
        WHEN routine_name LIKE 'proc_%'
            THEN 'proc_ prefix — redundant with routine_type'
        WHEN routine_name ~ '[A-Z]'
            THEN 'Mixed-case name — PostgreSQL folds unquoted names to lowercase'
        ELSE 'Non-standard naming'
    END                                                       AS finding
FROM information_schema.routines
WHERE routine_type IN ('PROCEDURE','FUNCTION')
  AND routine_schema NOT IN ('information_schema','pg_catalog')
  AND (routine_name LIKE 'sp_%'
    OR routine_name LIKE 'proc_%'
    OR routine_name ~ '[A-Z]')
ORDER BY routine_schema, routine_name
"""

DUPLICATE_INDEXES = """
SELECT
    pi1.schemaname                                            AS schema_name,
    pi1.tablename                                             AS table_name,
    pi1.indexname                                             AS index1_name,
    pi2.indexname                                             AS index2_name,
    'BTREE'                                                   AS index_type,
    pi1.indexdef                                              AS shared_key_columns,
    'Duplicate index definition — consider consolidating'     AS finding
FROM pg_indexes pi1
JOIN pg_indexes pi2
  ON  pi2.tablename  = pi1.tablename
 AND  pi2.schemaname = pi1.schemaname
 AND  pi2.indexname  > pi1.indexname
 AND  pi2.indexdef   = pi1.indexdef
WHERE pi1.schemaname NOT IN ('information_schema','pg_catalog','pg_toast')
ORDER BY pi1.schemaname, pi1.tablename
"""

DATABASE_OPTIONS_AUDIT = """
SELECT
    current_database()                                        AS database_name,
    current_setting('server_version', true)                   AS recovery_model_desc,
    current_setting('default_transaction_isolation', true)    AS page_verify_option_desc,
    current_setting('server_version_num', true)               AS compatibility_level,
    pg_encoding_to_char(encoding)                             AS collation_name,
    'ONLINE'                                                  AS state_desc,
    CASE WHEN current_setting('autovacuum', true) = 'on'
         THEN 'OK — autovacuum enabled'
         ELSE 'RISK: autovacuum disabled — tables will bloat' END AS auto_close,
    CASE WHEN current_setting('track_counts', true) = 'on'
         THEN 'OK — stat tracking enabled'
         ELSE 'RISK: track_counts off — autovacuum cannot function' END AS auto_shrink,
    current_setting('wal_level', true)                        AS page_verify_status,
    CASE WHEN current_setting('autovacuum', true) = 'on'
         THEN 'Enabled' ELSE 'RISK: Disabled' END             AS auto_update_stats,
    CASE WHEN current_setting('autovacuum', true) = 'on'
         THEN 'Enabled' ELSE 'RISK: Disabled' END             AS auto_create_stats,
    CASE WHEN current_setting('default_transaction_read_only', true) = 'on'
         THEN 'Read-Only' ELSE 'Read-Write' END               AS access_mode
FROM pg_database
WHERE datname = current_database()
"""

OBJECT_PERMISSIONS = """
SELECT
    privilege_type                                            AS permission_state,
    privilege_type                                            AS permission_name,
    'TABLE'                                                   AS object_class,
    table_name                                                AS object_name,
    table_schema                                              AS schema_name,
    grantee,
    'USER/ROLE'                                               AS grantee_type
FROM information_schema.role_table_grants
WHERE table_schema NOT IN ('information_schema','pg_catalog')
  AND grantee NOT IN ('PUBLIC')
ORDER BY table_schema, table_name, grantee
"""

# ── Performance checks ────────────────────────────────────────────────────────

MISSING_INDEXES = """
SELECT
    schemaname                                                AS schema_name,
    relname                                                   AS table_name,
    'N/A'                                                     AS equality_columns,
    'N/A'                                                     AS inequality_columns,
    'N/A'                                                     AS included_columns,
    seq_scan                                                  AS improvement_score,
    seq_scan                                                  AS user_seeks,
    seq_tup_read                                              AS user_scans,
    0::numeric                                                AS avg_impact_pct,
    'N/A'                                                     AS last_user_seek
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND schemaname NOT IN ('information_schema','pg_catalog')
ORDER BY seq_scan DESC
LIMIT 50
"""

INDEX_USAGE_STATS = """
SELECT
    schemaname                                                AS schema_name,
    relname                                                   AS table_name,
    indexrelname                                              AS index_name,
    'BTREE'                                                   AS type_desc,
    idx_scan                                                  AS user_seeks,
    0::bigint                                                 AS user_scans,
    0::bigint                                                 AS user_lookups,
    idx_tup_read + idx_tup_fetch                              AS user_updates,
    'N/A'                                                     AS last_user_seek,
    'N/A'                                                     AS last_user_update,
    CASE
        WHEN idx_scan = 0                        THEN 'Never Used'
        WHEN idx_scan < 100                      THEN 'Rarely Used'
        ELSE                                          'Active'
    END                                                       AS index_status
FROM pg_stat_user_indexes
WHERE schemaname NOT IN ('information_schema','pg_catalog')
ORDER BY idx_scan
"""

FRAGMENTATION_REPORT = """
SELECT
    schemaname                                                AS schema_name,
    relname                                                   AS table_name,
    'heap'                                                    AS index_name,
    'heap'                                                    AS type_desc,
    ROUND(
        100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2
    )                                                         AS fragmentation_pct,
    n_live_tup                                                AS page_count,
    CASE
        WHEN n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) > 0.30
            THEN 'VACUUM recommended (>30% dead tuples)'
        WHEN n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) > 0.10
            THEN 'Consider VACUUM (10-30% dead tuples)'
        ELSE 'OK'
    END                                                       AS recommendation
FROM pg_stat_user_tables
WHERE n_live_tup + n_dead_tup > 100
  AND schemaname NOT IN ('information_schema','pg_catalog')
ORDER BY (n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0)) DESC NULLS LAST
LIMIT 100
"""

STATISTICS_HEALTH = """
SELECT
    schemaname                                                AS schema_name,
    relname                                                   AS table_name,
    'table_stats'                                             AS stat_name,
    TO_CHAR(COALESCE(last_analyze, last_autoanalyze), 'YYYY-MM-DD HH24:MI:SS') AS last_updated,
    n_live_tup                                                AS rows,
    n_live_tup                                                AS rows_sampled,
    100.0                                                     AS sample_pct,
    n_mod_since_analyze                                       AS modification_counter,
    CASE
        WHEN last_analyze IS NULL AND last_autoanalyze IS NULL
            THEN 'STALE — never analyzed'
        WHEN COALESCE(last_analyze, last_autoanalyze) < NOW() - INTERVAL '30 days'
            THEN 'OLD — not analyzed in 30+ days'
        WHEN n_mod_since_analyze > n_live_tup * 0.20
            THEN 'STALE — >20% rows modified since last analyze'
        ELSE 'OK'
    END                                                       AS status
FROM pg_stat_user_tables
WHERE schemaname NOT IN ('information_schema','pg_catalog')
ORDER BY n_mod_since_analyze DESC NULLS LAST
LIMIT 100
"""

# ── Reliability / config checks ───────────────────────────────────────────────

BACKUP_HISTORY = """
SELECT
    current_database()                                        AS database_name,
    TO_CHAR(last_archived_time, 'YYYY-MM-DD HH24:MI:SS')     AS last_full_backup,
    'N/A (WAL archiving — no differential backups)'           AS last_diff_backup,
    'N/A (continuous WAL streaming)'                          AS last_log_backup,
    ROUND(EXTRACT(EPOCH FROM (NOW() - last_archived_time)) / 3600.0, 1) AS hours_since_full_backup,
    0::numeric                                                AS hours_since_log_backup,
    CASE WHEN archiver_enabled THEN 'WAL Archiving' ELSE 'NOARCHIVELOG' END AS recovery_model_desc,
    CASE
        WHEN NOT archiver_enabled
            THEN 'CAUTION: WAL archiving disabled — no point-in-time recovery'
        WHEN last_archived_time IS NULL
            THEN 'WARNING: No WAL files archived yet'
        WHEN NOW() - last_archived_time > INTERVAL '1 day'
            THEN 'WARNING: Last WAL archive > 1 day ago'
        ELSE 'OK — WAL archiving active'
    END                                                       AS backup_status
FROM pg_stat_archiver
"""

SERVER_CONFIGURATIONS = """
SELECT
    name                                                      AS config_name,
    setting                                                   AS configured_value,
    setting                                                   AS running_value,
    min_val                                                   AS min_value,
    max_val                                                   AS max_value,
    short_desc                                                AS description,
    CASE
        WHEN name = 'max_connections'         AND setting::int > 500
            THEN 'WARNING: High max_connections — consider PgBouncer'
        WHEN name = 'shared_buffers'          AND setting::int < 131072
            THEN 'RECOMMEND: shared_buffers should be ~25% of RAM'
        WHEN name = 'autovacuum'              AND setting = 'off'
            THEN 'RISK: autovacuum disabled — table bloat will accumulate'
        WHEN name = 'log_min_duration_statement' AND (setting = '-1' OR setting::int > 5000)
            THEN 'RECOMMEND: enable slow query logging (e.g., 1000 ms)'
        WHEN name = 'wal_level'              AND setting = 'minimal'
            THEN 'CAUTION: minimal WAL — replication and PITR limited'
        WHEN name = 'idle_in_transaction_session_timeout' AND setting = '0'
            THEN 'RECOMMEND: set a timeout to release idle-in-transaction locks'
        ELSE 'OK'
    END                                                       AS recommendation
FROM pg_settings
WHERE name IN (
    'max_connections','shared_buffers','effective_cache_size','work_mem',
    'maintenance_work_mem','autovacuum','log_min_duration_statement',
    'wal_level','archive_mode','max_wal_size','checkpoint_completion_target',
    'default_statistics_target','track_counts','track_activities',
    'log_lock_waits','deadlock_timeout',
    'idle_in_transaction_session_timeout','lock_timeout','statement_timeout'
)
ORDER BY name
"""

WEAK_SQL_LOGINS = """
SELECT
    usename                                                   AS login_name,
    CASE WHEN usesuper THEN 'SUPERUSER' ELSE 'USER' END       AS type_desc,
    CASE WHEN valuntil IS NULL OR valuntil > NOW()
         THEN 'Enabled' ELSE 'Expired' END                    AS login_status,
    'N/A (requires superuser)'                                AS password_policy,
    CASE WHEN valuntil IS NULL THEN 'NO — RISK' ELSE 'Yes' END AS expiration_policy,
    'N/A'                                                     AS password_last_set,
    0::int                                                    AS bad_password_count,
    CASE WHEN valuntil IS NOT NULL
         THEN EXTRACT(DAY FROM (valuntil - NOW()))::int
         ELSE NULL
    END                                                       AS days_until_expiration,
    CASE
        WHEN valuntil IS NULL
            THEN 'RISK: No password expiry configured'
        WHEN valuntil < NOW()
            THEN 'RISK: Password has expired'
        ELSE 'OK'
    END                                                       AS assessment
FROM pg_user
WHERE usename NOT LIKE 'pg_%'
  AND usename NOT IN ('rdsadmin','azure_superuser','cloudsqlsuperuser','azuresu','cloudsqladmin')
ORDER BY usename
"""

SERVER_PERMISSIONS = """
SELECT
    CASE
        WHEN rolsuper       THEN 'superuser'
        WHEN rolcreaterole  THEN 'createrole'
        WHEN rolcreatedb    THEN 'createdb'
        WHEN rolbypassrls   THEN 'bypassrls'
        ELSE 'member'
    END                                                       AS server_role,
    rolname                                                   AS member_name,
    CASE WHEN rolcanlogin THEN 'LOGIN' ELSE 'NOLOGIN' END     AS type_desc,
    CASE WHEN rolcanlogin THEN 'Enabled' ELSE 'No Login' END  AS login_status,
    'N/A'                                                     AS member_since
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
  AND rolname NOT IN (
      'rds_ad','rdsadmin','rds_superuser','azure_pg_admin',
      'azuresu','replication','azure_superuser','cloudsqlsuperuser'
  )
  AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)
ORDER BY rolsuper DESC, rolcreaterole DESC, rolname
"""

DEPRECATED_FEATURES_IN_USE = """
SELECT
    data_type                                                 AS deprecated_feature,
    COUNT(*)                                                  AS usage_count_since_restart
FROM information_schema.columns
WHERE table_schema NOT IN ('information_schema','pg_catalog')
  AND data_type IN (
      'money','character','timestamp without time zone','xml'
  )
GROUP BY data_type
ORDER BY COUNT(*) DESC
"""

# ── Schema / ETL classification ───────────────────────────────────────────────

SCHEMA_CLASSIFICATION = """
SELECT
    s.schema_name,
    (SELECT COUNT(*) FROM information_schema.tables t
     WHERE t.table_schema = s.schema_name AND t.table_type = 'BASE TABLE') AS table_count,
    (SELECT COUNT(*) FROM information_schema.views v
     WHERE v.table_schema = s.schema_name)                   AS view_count,
    (SELECT COUNT(*) FROM information_schema.routines r
     WHERE r.routine_schema = s.schema_name)                 AS proc_count,
    CASE
        WHEN s.schema_name IN ('stg','staging','raw','bronze','landing')
            THEN 'Staging / Landing'
        WHEN s.schema_name IN ('etl','ctrl','control','pipeline','meta','metadata')
            THEN 'ETL Control'
        WHEN s.schema_name IN ('lkp','lookup','ref','reference','dim','config')
            THEN 'Lookup / Reference'
        WHEN s.schema_name IN ('public','reporting','rpt','fact','mart','gold','silver')
            THEN 'Business / Reporting'
        WHEN s.schema_name IN ('error','err','log','audit','trace')
            THEN 'Error / Audit'
        WHEN s.schema_name IN ('bi','dwh','dw','warehouse','ods','datamart')
            THEN 'Data Warehouse'
        ELSE 'Other — review'
    END                                                       AS schema_classification,
    CASE
        WHEN s.schema_name IN ('stg','staging','raw','bronze','landing')
            THEN 'Transient staging — migrate pipelines to Fabric Bronze/Silver'
        WHEN s.schema_name IN ('etl','ctrl','control','pipeline','meta','metadata')
            THEN 'ETL orchestration — replace with Fabric Data Pipelines'
        WHEN s.schema_name IN ('lkp','lookup','ref','reference','dim','config')
            THEN 'Reference data — move to Fabric Gold layer'
        WHEN s.schema_name IN ('public','reporting','rpt','fact','mart','gold','silver')
            THEN 'Core business logic — migrate to Fabric Gold Warehouse'
        WHEN s.schema_name IN ('error','err','log','audit','trace')
            THEN 'Operational logs — replace with Fabric Monitor Hub'
        WHEN s.schema_name IN ('bi','dwh','dw','warehouse','ods','datamart')
            THEN 'Data warehouse layer — migrate to Fabric Lakehouse'
        ELSE 'Review and classify before migration planning'
    END                                                       AS migration_recommendation
FROM information_schema.schemata s
WHERE s.schema_name NOT IN (
    'information_schema','pg_catalog','pg_toast',
    'pg_temp_1','pg_toast_temp_1'
)
ORDER BY schema_classification, s.schema_name
"""

SP_COMPLEXITY = """
SELECT
    routine_schema                                            AS schema_name,
    routine_name                                              AS procedure_name,
    'N/A'                                                     AS create_date,
    'N/A'                                                     AS modify_date,
    COALESCE(
        (SELECT COUNT(*) FROM information_schema.parameters p
         WHERE p.specific_schema = r.routine_schema
           AND p.specific_name   = r.specific_name), 0
    )                                                         AS param_count,
    COALESCE(LENGTH(routine_definition), 0)                  AS char_length,
    COALESCE(
        ARRAY_LENGTH(STRING_TO_ARRAY(routine_definition, E'\n'), 1), 0
    )                                                         AS line_count,
    CASE WHEN routine_definition ILIKE '%CURSOR%'   THEN 'Yes' ELSE 'No' END AS uses_cursor,
    CASE WHEN routine_definition ILIKE '%TEMP%'
          OR  routine_definition ILIKE '%TEMPORARY%' THEN 'Yes' ELSE 'No' END AS uses_temp_table,
    CASE WHEN routine_definition ILIKE '%EXECUTE%'
          OR  routine_definition ILIKE '%FORMAT(%'   THEN 'Yes' ELSE 'No' END AS uses_dynamic_sql,
    CASE WHEN routine_definition ILIKE '%EXCEPTION%' THEN 'Yes' ELSE 'No' END AS has_error_handling,
    CASE WHEN routine_definition ILIKE '%COMMIT%'
          OR  routine_definition ILIKE '%ROLLBACK%'  THEN 'Yes' ELSE 'No' END AS uses_transactions,
    CASE
        WHEN LENGTH(COALESCE(routine_definition, '')) > 10000 THEN 'HIGH — refactor candidate'
        WHEN LENGTH(COALESCE(routine_definition, '')) >  3000 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                       AS complexity_level
FROM information_schema.routines r
WHERE routine_type IN ('PROCEDURE','FUNCTION')
  AND routine_schema NOT IN ('information_schema','pg_catalog')
ORDER BY char_length DESC
"""

VIEW_COMPLEXITY = """
SELECT
    table_schema                                              AS schema_name,
    table_name                                                AS view_name,
    'N/A'                                                     AS create_date,
    'N/A'                                                     AS modify_date,
    COALESCE(LENGTH(view_definition), 0)                     AS char_length,
    COALESCE(
        ARRAY_LENGTH(STRING_TO_ARRAY(view_definition, E'\n'), 1), 0
    )                                                         AS line_count,
    (LENGTH(UPPER(COALESCE(view_definition,''))) -
     LENGTH(REPLACE(UPPER(COALESCE(view_definition,'')), 'JOIN', ''))) / 4 AS join_count,
    GREATEST(
        (LENGTH(UPPER(COALESCE(view_definition,''))) -
         LENGTH(REPLACE(UPPER(COALESCE(view_definition,'')), 'SELECT', ''))
        ) / 6 - 1, 0
    )                                                         AS subquery_count,
    CASE WHEN UPPER(COALESCE(view_definition,'')) LIKE '%UNION%'
         THEN 'Yes' ELSE 'No' END                            AS has_union,
    CASE WHEN UPPER(COALESCE(view_definition,'')) LIKE '%WITH%AS%(%'
          OR  UPPER(COALESCE(view_definition,'')) LIKE '%WITH%AS%SELECT%'
         THEN 'Yes' ELSE 'No' END                            AS has_cte,
    CASE
        WHEN LENGTH(COALESCE(view_definition,'')) > 5000 THEN 'HIGH — consider materializing'
        WHEN LENGTH(COALESCE(view_definition,'')) > 1500 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                       AS complexity_level
FROM information_schema.views
WHERE table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY char_length DESC
"""

DATABASE_FILES = """
SELECT
    current_database()                                        AS file_name,
    'N/A (managed by host OS)'                               AS physical_name,
    'DATABASE'                                                AS file_type,
    ROUND(pg_database_size(current_database()) / (1024.0*1024.0), 2) AS size_mb,
    'Unlimited'                                               AS max_size,
    'Managed by PostgreSQL'                                   AS auto_growth,
    'ONLINE'                                                  AS file_state,
    'OK — PostgreSQL manages file allocation automatically'   AS recommendation
"""

# ── SQL Server-only stubs (return empty result set with correct columns) ──────

SSIS_CATALOG_PACKAGES = """
SELECT NULL::text AS folder_name, NULL::text AS project_name,
       NULL::text AS package_name, NULL::text AS description,
       NULL::text AS last_deployed, NULL::text AS entry_type,
       NULL::int  AS package_format_version
WHERE false
"""

SSIS_EXECUTION_HISTORY = """
SELECT NULL::text AS folder_name, NULL::text AS project_name,
       NULL::text AS package_name, NULL::text AS status,
       NULL::text AS start_time,   NULL::text AS end_time,
       NULL::int  AS duration_sec, NULL::text AS executed_as_name
WHERE false
"""

SSIS_MSDB_PACKAGES = """
SELECT NULL::text AS folder_name, NULL::text AS package_name,
       NULL::text AS create_date,  NULL::text AS package_type,
       NULL::int  AS vermajor,     NULL::int  AS verminor
WHERE false
"""

SQL_AGENT_JOB_SCHEDULES = """
SELECT NULL::text AS job_name,      NULL::text AS job_status,
       NULL::text AS schedule_name, NULL::text AS schedule_status,
       NULL::text AS frequency_type,NULL::int  AS freq_interval,
       NULL::text AS intraday_frequency,
       NULL::text AS active_start_time, NULL::text AS active_end_time,
       NULL::text AS next_run_date
WHERE false
"""

SQL_AGENT_JOB_STEPS = """
SELECT NULL::text AS job_name,  NULL::text AS job_status,
       NULL::int  AS step_id,   NULL::text AS step_name,
       NULL::text AS step_type, NULL::text AS database_name,
       NULL::int  AS retry_attempts, NULL::int AS retry_interval_min,
       NULL::text AS on_success, NULL::text AS on_fail
WHERE false
"""

SSAS_LINKED_SERVERS = """
SELECT NULL::text AS linked_server_name, NULL::text AS product,
       NULL::text AS provider,            NULL::text AS data_source,
       NULL::text AS remote_login_enabled,NULL::text AS modify_date,
       NULL::text AS finding
WHERE false
"""

# ── Performance — wait stats & query store ─────────────────────────────────────

WAIT_STATISTICS = """
SELECT
    COALESCE(wait_event_type, 'CPU') || ': ' || COALESCE(wait_event, 'running') AS wait_type,
    COUNT(*)                                                  AS total_wait_sec,
    0::numeric                                                AS max_wait_sec,
    COUNT(*)                                                  AS waiting_tasks_count,
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER(), 0), 2) AS pct_total_wait,
    CASE wait_event_type
        WHEN 'Lock'    THEN 'Locking — blocking / deadlock pressure'
        WHEN 'IO'      THEN 'I/O — disk read bottleneck'
        WHEN 'IPC'     THEN 'IPC — inter-process communication waits'
        WHEN 'Timeout' THEN 'Timeout — lock or statement timeout'
        WHEN 'LWLock'  THEN 'Lightweight lock — shared memory contention'
        WHEN 'Client'  THEN 'Network — client consuming results slowly'
        ELSE 'Other — review'
    END                                                       AS interpretation
FROM pg_stat_activity
WHERE state != 'idle'
  AND wait_event IS NOT NULL
GROUP BY wait_event_type, wait_event
ORDER BY COUNT(*) DESC
LIMIT 25
"""

QUERY_STORE_TOP_QUERIES = """
SELECT
    queryid::text                                             AS query_id,
    LEFT(query, 500)                                          AS query_text,
    ROUND(mean_exec_time::numeric, 2)                         AS avg_duration_ms,
    ROUND(max_exec_time::numeric,  2)                         AS max_duration_ms,
    ROUND(mean_exec_time::numeric, 2)                         AS avg_cpu_ms,
    ROUND((shared_blks_hit + shared_blks_read)::numeric, 0)  AS avg_logical_reads,
    calls                                                     AS total_executions,
    'N/A'                                                     AS last_executed,
    CASE
        WHEN mean_exec_time > 5000 THEN 'CRITICAL: avg > 5 sec'
        WHEN mean_exec_time > 1000 THEN 'WARNING: avg > 1 sec'
        ELSE 'OK'
    END                                                       AS performance_flag
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 25
"""
