"""
PostgreSQL assessment queries.
All queries produce the same column aliases as the SQL Server equivalents
so the same section keys and report builder work without changes.
"""

OVERVIEW = """
SELECT
    current_database()                                            AS database_name,
    current_user                                                  AS connected_user,
    version()                                                     AS sql_version,
    (SELECT COUNT(*) FROM information_schema.schemata
     WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast',
                                'pg_temp_1','pg_toast_temp_1'))   AS schema_count,
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
    pg_size_pretty(pg_database_size(current_database()))          AS total_size_mb
"""

SCHEMAS = """
SELECT
    schema_name,
    (SELECT COUNT(*) FROM information_schema.tables t
     WHERE t.table_schema = s.schema_name AND t.table_type = 'BASE TABLE') AS table_count,
    (SELECT COUNT(*) FROM information_schema.views v
     WHERE v.table_schema = s.schema_name)                                  AS view_count,
    (SELECT COUNT(*) FROM information_schema.routines r
     WHERE r.routine_schema = s.schema_name)                                AS proc_count
FROM information_schema.schemata s
WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast')
ORDER BY schema_name
"""

TABLES = """
SELECT
    t.table_schema                                    AS schema_name,
    t.table_name,
    (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_schema = t.table_schema
       AND c.table_name   = t.table_name)             AS column_count,
    pg_total_relation_size(
        quote_ident(t.table_schema)||'.'||quote_ident(t.table_name)
    ) / (1024*1024.0)                                 AS size_mb,
    NULL::text                                        AS row_count,
    NULL::text                                        AS create_date,
    NULL::text                                        AS modify_date
FROM information_schema.tables t
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY t.table_schema, t.table_name
"""

COLUMNS = """
SELECT
    c.table_schema    AS schema_name,
    c.table_name,
    c.ordinal_position AS column_id,
    c.column_name,
    c.data_type,
    c.character_maximum_length AS max_length,
    c.numeric_precision        AS precision,
    c.numeric_scale            AS scale,
    c.is_nullable,
    CASE WHEN c.column_default LIKE '%nextval%' THEN 'YES' ELSE 'NO' END AS is_identity,
    CASE WHEN kcu.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END       AS is_primary_key,
    'NO'                                                                  AS is_foreign_key,
    c.column_default                                                      AS default_value
FROM information_schema.columns c
LEFT JOIN (
    SELECT kcu.table_schema, kcu.table_name, kcu.column_name
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
) kcu ON kcu.table_schema = c.table_schema
      AND kcu.table_name   = c.table_name
      AND kcu.column_name  = c.column_name
WHERE c.table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
"""

VIEWS = """
SELECT
    table_schema  AS schema_name,
    table_name    AS view_name,
    NULL::text    AS create_date,
    NULL::text    AS modify_date,
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
    (SELECT COUNT(*) FROM information_schema.parameters p
     WHERE p.specific_schema = r.routine_schema
       AND p.specific_name   = r.specific_name) AS param_count
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
    schemaname    AS schema_name,
    tablename     AS table_name,
    indexname     AS index_name,
    'BTREE'       AS index_type,
    CASE WHEN ix.indisunique THEN 'YES' ELSE 'NO' END   AS is_unique,
    CASE WHEN ix.indisprimary THEN 'YES' ELSE 'NO' END  AS is_primary_key,
    'NO'          AS is_unique_constraint,
    indexdef      AS indexed_columns,
    NULL::int     AS fill_factor
FROM pg_indexes pi2
LEFT JOIN pg_class c  ON c.relname  = pi2.indexname
LEFT JOIN pg_index ix ON ix.indexrelid = c.oid
WHERE schemaname NOT IN ('information_schema','pg_catalog','pg_toast')
ORDER BY schemaname, tablename, indexname
"""

RELATIONSHIPS = """
SELECT
    tc.constraint_name  AS fk_name,
    ccu_from.table_schema AS parent_schema,
    ccu_from.table_name   AS parent_table,
    kcu.column_name       AS parent_column,
    ccu_to.table_schema   AS ref_schema,
    ccu_to.table_name     AS ref_table,
    ccu_to.column_name    AS ref_column,
    rc.delete_rule        AS on_delete,
    rc.update_rule        AS on_update
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.constraint_schema = kcu.constraint_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
 AND rc.constraint_schema = tc.constraint_schema
JOIN information_schema.constraint_column_usage ccu_from
  ON ccu_from.constraint_name = tc.constraint_name
 AND ccu_from.constraint_schema = tc.constraint_schema
JOIN information_schema.constraint_column_usage ccu_to
  ON ccu_to.constraint_name = rc.unique_constraint_name
 AND ccu_to.constraint_schema = rc.unique_constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY parent_schema, parent_table
"""

INDEX_COVERAGE = """
SELECT
    t.table_schema AS schema_name,
    t.table_name,
    COUNT(DISTINCT i.indexname) AS index_count,
    CASE
        WHEN COUNT(DISTINCT i.indexname) = 0 THEN 'No indexes'
        WHEN COUNT(DISTINCT i.indexname) = 1 THEN 'Minimal coverage'
        ELSE 'Good coverage'
    END AS coverage
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
    t.table_schema AS schema_name,
    t.table_name,
    NULL::bigint   AS current_rows,
    NULL::text     AS create_date,
    NULL::text     AS modify_date,
    NULL::int      AS age_days,
    NULL::float    AS avg_rows_per_day
FROM information_schema.tables t
WHERE t.table_type = 'BASE TABLE'
  AND t.table_schema NOT IN ('information_schema','pg_catalog')
ORDER BY t.table_schema, t.table_name
"""

# Null analysis handled dynamically in service; placeholder kept for symmetry
NULL_ANALYSIS_COLUMNS = """
SELECT column_name AS name, data_type
FROM information_schema.columns
WHERE table_schema || '.' || table_name = '{full_name}'
  AND is_nullable = 'YES'
ORDER BY ordinal_position
LIMIT 20
"""

# ── Security ──────────────────────────────────────────────────────────────────

DB_USERS_ROLES = """
SELECT
    rolname       AS principal_name,
    CASE WHEN rolsuper THEN 'SUPERUSER'
         WHEN rolcanlogin THEN 'LOGIN'
         ELSE 'GROUP' END AS principal_type,
    NULL::text    AS create_date,
    NULL::text    AS default_schema,
    NULL::text    AS server_login,
    NULL::text    AS roles
FROM pg_roles
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolname
"""

ORPHANED_USERS = """
SELECT
    u.usename    AS user_name,
    'LOGIN'      AS user_type,
    NULL::text   AS create_date,
    NULL::text   AS default_schema
FROM pg_user u
WHERE NOT EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname = u.usename AND r.rolcanlogin
)
LIMIT 0  -- PostgreSQL does not have orphaned users concept; return empty
"""

DB_OWNER_MEMBERS = """
SELECT
    m.rolname     AS member_name,
    'ROLE'        AS member_type,
    NULL::text    AS server_login,
    NULL::text    AS create_date
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE r.rolname = 'rds_superuser' OR r.rolsuper
ORDER BY m.rolname
"""

DYNAMIC_SQL_USAGE = """
SELECT
    'FUNCTION'    AS object_type,
    routine_schema AS schema_name,
    routine_name   AS object_name,
    'EXECUTE'      AS dynamic_sql_type
FROM information_schema.routines
WHERE routine_definition ILIKE '%EXECUTE%'
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
WHERE false  -- PostgreSQL has no CLR assemblies
"""

TDE_STATUS = """
SELECT
    current_database() AS database_name,
    'N/A - Use SSL/TLS at connection level' AS tde_status,
    NULL::text AS encryption_state,
    NULL::float AS percent_complete,
    NULL::text AS key_algorithm,
    NULL::int  AS key_length
"""

COLUMN_ENCRYPTION = """
SELECT
    NULL::text AS schema_name,
    NULL::text AS table_name,
    NULL::text AS column_name,
    NULL::text AS data_type,
    NULL::text AS encryption_key_name,
    NULL::text AS encryption_type
WHERE false  -- PostgreSQL column encryption uses pgcrypto/external
"""

PII_INDICATORS = """
SELECT
    c.table_schema AS schema_name,
    c.table_name,
    c.column_name,
    c.data_type,
    CASE
        WHEN c.column_name ILIKE ANY(ARRAY['%email%','%mail%'])                    THEN 'Email'
        WHEN c.column_name ILIKE ANY(ARRAY['%phone%','%mobile%','%tel%'])          THEN 'Phone'
        WHEN c.column_name ILIKE ANY(ARRAY['%ssn%','%social_security%','%nino%'])  THEN 'SSN/NI'
        WHEN c.column_name ILIKE ANY(ARRAY['%password%','%passwd%','%pwd%'])       THEN 'Password'
        WHEN c.column_name ILIKE ANY(ARRAY['%credit%','%card%','%cvv%'])           THEN 'Payment'
        WHEN c.column_name ILIKE ANY(ARRAY['%dob%','%birth%','%birthdate%'])       THEN 'DOB'
        WHEN c.column_name ILIKE ANY(ARRAY['%address%','%postcode%','%zipcode%'])  THEN 'Address'
        WHEN c.column_name ILIKE ANY(ARRAY['%passport%','%license%'])              THEN 'ID Document'
        WHEN c.column_name ILIKE ANY(ARRAY['%salary%','%income%','%wage%'])        THEN 'Financial'
        WHEN c.column_name ILIKE ANY(ARRAY['%ip_addr%','%ip_address%'])            THEN 'IP Address'
    END AS pii_category
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('information_schema','pg_catalog')
  AND (
    c.column_name ILIKE ANY(ARRAY[
      '%email%','%mail%','%phone%','%mobile%','%tel%','%ssn%','%social_security%',
      '%nino%','%password%','%passwd%','%pwd%','%credit%','%card%','%cvv%',
      '%dob%','%birth%','%birthdate%','%address%','%postcode%','%zipcode%',
      '%passport%','%license%','%salary%','%income%','%wage%','%ip_addr%','%ip_address%'
    ])
  )
ORDER BY c.table_schema, c.table_name, c.column_name
"""

# ── Feature usage ──────────────────────────────────────────────────────────────

SQL_AGENT_JOBS = """
SELECT
    NULL::text AS job_name,
    NULL::text AS status,
    NULL::text AS description,
    NULL::text AS date_created,
    NULL::text AS date_modified,
    NULL::int  AS failure_count,
    NULL::text AS last_run_status
WHERE false  -- PostgreSQL has no SQL Agent; use pg_cron or external schedulers
"""

LINKED_SERVERS = """
SELECT
    foreign_server_name  AS linked_server_name,
    foreign_data_wrapper_name AS product,
    NULL::text           AS provider,
    NULL::text           AS data_source,
    'NO'                 AS remote_login_enabled,
    'YES'                AS data_access_enabled,
    'NO'                 AS rpc_out_enabled,
    NULL::text           AS modify_date
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
WHERE false  -- PostgreSQL uses FDW for cross-db; not introspectable via SQL
"""

REPLICATION_STATUS = """
SELECT
    current_database() AS database_name,
    (SELECT COUNT(*) FROM pg_replication_slots) > 0  AS has_replicated_tables,
    (SELECT COUNT(*) FROM pg_replication_slots)      AS replicated_table_count,
    pg_is_in_recovery() = false                      AS is_publisher,
    pg_is_in_recovery()                              AS is_subscriber,
    false                                            AS is_merge_published
"""

SERVICE_BROKER = """
SELECT
    NULL::text AS database_name,
    NULL::text AS broker_status,
    NULL::int  AS user_queue_count,
    NULL::int  AS user_service_count,
    NULL::int  AS active_conversations
WHERE false  -- PostgreSQL has no Service Broker
"""

VERSION_FEATURES = """
SELECT
    inet_server_addr()::text  AS server_name,
    version()                 AS product_version,
    NULL::text                AS product_level,
    NULL::text                AS product_update_level,
    'PostgreSQL'              AS edition,
    'PostgreSQL'              AS engine_edition,
    false                     AS is_clustered,
    (SELECT COUNT(*) FROM pg_replication_slots) > 0 AS hadr_enabled,
    (SELECT COUNT(*) FROM pg_available_extensions WHERE name='pg_trgm') > 0 AS fulltext_installed,
    false AS clr_enabled,
    false AS xp_cmdshell_enabled,
    false AS ole_automation_enabled,
    false AS adhoc_distributed_queries
"""
