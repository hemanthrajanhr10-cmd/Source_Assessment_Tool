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
    NULL::text                                         AS row_count,
    NULL::text                                         AS create_date,
    NULL::text                                         AS modify_date
FROM information_schema.tables t
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
    NULL::text      AS create_date,
    NULL::text      AS modify_date,
    view_definition AS definition
FROM information_schema.views
WHERE table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY table_schema, table_name
"""

STORED_PROCEDURES = """
SELECT
    routine_schema  AS schema_name,
    routine_name    AS procedure_name,
    NULL::text      AS create_date,
    NULL::text      AS modify_date,
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
    NULL::text      AS create_date,
    NULL::text      AS modify_date
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
    NULL::int                                             AS fill_factor
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
    t.table_schema  AS schema_name,
    t.table_name,
    NULL::bigint    AS current_rows,
    NULL::text      AS create_date,
    NULL::text      AS modify_date,
    NULL::int       AS age_days,
    NULL::float     AS avg_rows_per_day
FROM information_schema.tables t
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
    NULL::text      AS create_date,
    NULL::text      AS default_schema,
    NULL::text      AS server_login,
    NULL::text      AS roles
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
    CASE WHEN ssl_is_used()
         THEN 'SSL Active'
         ELSE 'No SSL at session level' END           AS encryption_state,
    NULL::float                                       AS percent_complete,
    NULL::text                                        AS key_algorithm,
    NULL::int                                         AS key_length
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
