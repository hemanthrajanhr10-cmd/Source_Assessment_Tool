"""
Oracle assessment queries.
Compatible with Oracle Database 12c+ on any platform:
  - Oracle Cloud Infrastructure (OCI) — Autonomous Database, Base Database
  - AWS RDS for Oracle
  - On-premises Oracle 12c / 19c / 21c / 23c

Uses ALL_* views (accessible without DBA role).
V$* views are attempted and fail gracefully via _safe_fetch.
Column aliases are unquoted uppercase; _cursor_rows_to_dicts lowercases them.

Connection note: params.database is used as the Oracle service name in the DSN.
Assessment scope: SYS_CONTEXT('USERENV','SESSION_USER') — the connected user's schema.
"""

_SYS = (
    "'SYS','SYSTEM','OUTLN','DBSNMP','APPQOSSYS','CTXSYS','DVSYS','EXFSYS',"
    "'LBACSYS','MDSYS','OJVMSYS','ORDDATA','ORDSYS','WMSYS','XDB','RDSADMIN',"
    "'AUDSYS','GGSYS','GSMADMIN_INTERNAL','GSMCATUSER','GSMUSER','DBSFWUSER',"
    "'REMOTE_SCHEDULER_AGENT','SYSBACKUP','SYSDG','SYSKM','SYSRAC','XS$NULL',"
    "'ANONYMOUS','DVF','FLOWS_FILES','ORACLE_OCM','MDDATA','OWBSYS','OWBSYS_AUDIT',"
    "'PERFSTAT','SQLTUNE','TRACESVR','TSMSYS'"
)

# ── Core metadata ──────────────────────────────────────────────────────────────

OVERVIEW = f"""
SELECT
    SYS_CONTEXT('USERENV','DB_NAME')                                    AS database_name,
    SYS_CONTEXT('USERENV','SESSION_USER')                               AS connected_user,
    (SELECT version FROM product_component_version
     WHERE product LIKE 'Oracle%' AND ROWNUM = 1)                       AS sql_version,
    (SELECT COUNT(*) FROM all_users
     WHERE username NOT IN ({_SYS}))                                    AS schema_count,
    (SELECT COUNT(*) FROM all_tables
     WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER'))               AS table_count,
    (SELECT COUNT(*) FROM all_views
     WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER'))               AS view_count,
    (SELECT COUNT(*) FROM all_objects
     WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
       AND object_type = 'PROCEDURE'
       AND status = 'VALID')                                            AS proc_count,
    (SELECT COUNT(*) FROM all_objects
     WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
       AND object_type = 'FUNCTION'
       AND status = 'VALID')                                            AS func_count,
    ROUND(NVL((SELECT SUM(bytes) / (1024*1024) FROM user_segments), 0), 2) AS total_size_mb
FROM dual
"""

SCHEMAS = f"""
SELECT
    username          AS schema_name,
    account_status,
    TO_CHAR(created, 'YYYY-MM-DD') AS created
FROM all_users
WHERE username NOT IN ({_SYS})
ORDER BY username
"""

TABLES = """
SELECT
    owner                                       AS schema_name,
    table_name,
    NVL(num_rows, 0)                            AS row_count,
    ROUND(NVL(blocks * 8192, 0) / (1024*1024), 4) AS size_mb,
    TO_CHAR(last_analyzed, 'YYYY-MM-DD')        AS last_analyzed,
    partitioned,
    row_movement
FROM all_tables
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY table_name
"""

COLUMNS = """
SELECT
    atc.owner                                           AS schema_name,
    atc.table_name,
    atc.column_name,
    atc.data_type,
    atc.data_length                                     AS max_length,
    CASE WHEN atc.nullable = 'Y' THEN 1 ELSE 0 END     AS is_nullable,
    CASE WHEN atc.identity_column = 'YES' THEN 1 ELSE 0 END AS is_identity,
    CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END  AS is_primary_key,
    CASE WHEN fk.column_name IS NOT NULL THEN 1 ELSE 0 END  AS is_foreign_key,
    atc.data_default                                    AS default_value,
    atc.column_id                                       AS ordinal_position
FROM all_tab_columns atc
LEFT JOIN (
    SELECT col.owner, col.table_name, col.column_name
    FROM   all_cons_columns col
    JOIN   all_constraints  con ON con.constraint_name = col.constraint_name
                                AND con.owner = col.owner
    WHERE  con.constraint_type = 'P'
) pk ON pk.owner = atc.owner
     AND pk.table_name = atc.table_name
     AND pk.column_name = atc.column_name
LEFT JOIN (
    SELECT col.owner, col.table_name, col.column_name
    FROM   all_cons_columns col
    JOIN   all_constraints  con ON con.constraint_name = col.constraint_name
                                AND con.owner = col.owner
    WHERE  con.constraint_type = 'R'
) fk ON fk.owner = atc.owner
     AND fk.table_name = atc.table_name
     AND fk.column_name = atc.column_name
WHERE atc.owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY atc.table_name, atc.column_id
"""

VIEWS = """
SELECT
    owner           AS schema_name,
    view_name,
    DBMS_METADATA.GET_DDL('VIEW', view_name, owner) AS view_definition
FROM all_views
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY view_name
"""

# Fallback if DBMS_METADATA is not accessible (views text may be LONG type)
VIEWS = """
SELECT
    owner     AS schema_name,
    view_name,
    text_length
FROM all_views
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY view_name
"""

STORED_PROCEDURES = """
SELECT
    owner           AS schema_name,
    object_name     AS procedure_name,
    object_type,
    status,
    TO_CHAR(last_ddl_time, 'YYYY-MM-DD') AS create_date
FROM all_objects
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND object_type = 'PROCEDURE'
  AND status = 'VALID'
ORDER BY object_name
"""

FUNCTIONS = """
SELECT
    owner           AS schema_name,
    object_name     AS function_name,
    object_type,
    status,
    TO_CHAR(last_ddl_time, 'YYYY-MM-DD') AS create_date
FROM all_objects
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND object_type = 'FUNCTION'
  AND status = 'VALID'
ORDER BY object_name
"""

INDEXES = """
SELECT
    ai.owner            AS schema_name,
    ai.index_name,
    ai.table_name,
    ai.index_type,
    ai.uniqueness,
    ai.status,
    ai.partitioned,
    (SELECT LISTAGG(aic.column_name, ', ')
            WITHIN GROUP (ORDER BY aic.column_position)
     FROM all_ind_columns aic
     WHERE aic.index_owner = ai.owner
       AND aic.index_name  = ai.index_name) AS key_columns
FROM all_indexes ai
WHERE ai.owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY ai.table_name, ai.index_name
"""

RELATIONSHIPS = """
SELECT
    ac.owner                                    AS schema_name,
    ac.constraint_name,
    ac.table_name,
    acc.column_name,
    ac.r_owner                                  AS ref_schema,
    rc.table_name                               AS ref_table,
    rcc.column_name                             AS ref_column,
    ac.delete_rule
FROM  all_constraints  ac
JOIN  all_cons_columns acc ON acc.constraint_name = ac.constraint_name
                           AND acc.owner           = ac.owner
JOIN  all_constraints  rc  ON rc.constraint_name  = ac.r_constraint_name
                           AND rc.owner            = ac.r_owner
JOIN  all_cons_columns rcc ON rcc.constraint_name  = rc.constraint_name
                           AND rcc.owner            = rc.owner
                           AND rcc.position         = acc.position
WHERE ac.owner           = SYS_CONTEXT('USERENV','SESSION_USER')
  AND ac.constraint_type = 'R'
ORDER BY ac.table_name, ac.constraint_name
"""

INDEX_COVERAGE = """
SELECT
    t.owner       AS schema_name,
    t.table_name,
    NVL(t.num_rows, 0)                                          AS row_count,
    CASE WHEN pk.table_name IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_primary_key,
    CASE WHEN ix.table_name IS NOT NULL THEN 'Yes' ELSE 'No' END AS has_index
FROM all_tables t
LEFT JOIN (
    SELECT owner, table_name
    FROM   all_constraints
    WHERE  constraint_type = 'P'
) pk ON pk.owner = t.owner AND pk.table_name = t.table_name
LEFT JOIN (
    SELECT table_owner AS owner, table_name
    FROM   all_indexes
    GROUP BY table_owner, table_name
) ix ON ix.owner = t.owner AND ix.table_name = t.table_name
WHERE t.owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND pk.table_name IS NULL
ORDER BY t.num_rows DESC NULLS LAST
"""

INSERTION_FREQUENCY = """
SELECT
    table_owner     AS schema_name,
    table_name,
    NVL(inserts, 0) AS inserts,
    NVL(updates, 0) AS updates,
    NVL(deletes, 0) AS deletes,
    TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI:SS') AS last_modified,
    truncated
FROM all_tab_modifications
WHERE table_owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY inserts DESC NULLS LAST
FETCH FIRST 100 ROWS ONLY
"""

# ── Security assessment ────────────────────────────────────────────────────────

DB_USERS_ROLES = """
SELECT
    grantee     AS username,
    granted_role AS role_name,
    admin_option,
    default_role
FROM user_role_privs
UNION ALL
SELECT
    SYS_CONTEXT('USERENV','SESSION_USER') AS username,
    privilege               AS role_name,
    'NO'                    AS admin_option,
    'YES'                   AS default_role
FROM session_privs
ORDER BY 1, 2
"""

# Oracle does not have "orphaned users" (logins without DB users) like SQL Server
ORPHANED_USERS = """
SELECT NULL AS username, NULL AS reason FROM dual WHERE 1=0
"""

DB_OWNER_MEMBERS = """
SELECT
    granted_role,
    admin_option,
    default_role
FROM user_role_privs
WHERE granted_role IN ('DBA','SYSDBA','SYSOPER','IMP_FULL_DATABASE','EXP_FULL_DATABASE')
ORDER BY granted_role
"""

DYNAMIC_SQL_USAGE = """
SELECT
    owner       AS schema_name,
    name        AS object_name,
    type        AS object_type,
    COUNT(*)    AS occurrences
FROM all_source
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND (UPPER(text) LIKE '%EXECUTE IMMEDIATE%'
       OR UPPER(text) LIKE '%DBMS_SQL%')
GROUP BY owner, name, type
ORDER BY occurrences DESC
"""

# Oracle Java stored procedures (equivalent to CLR assemblies)
CLR_ASSEMBLIES = """
SELECT
    owner       AS schema_name,
    object_name,
    object_type,
    status,
    TO_CHAR(last_ddl_time, 'YYYY-MM-DD') AS create_date
FROM all_objects
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND object_type LIKE 'JAVA%'
ORDER BY object_name
"""

# v$encryption_wallet requires SELECT_CATALOG_ROLE; fails gracefully via _safe_fetch
TDE_STATUS = """
SELECT
    wrl_type,
    status,
    wallet_type,
    CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END AS tde_enabled
FROM v$encryption_wallet
"""

COLUMN_ENCRYPTION = """
SELECT
    owner           AS schema_name,
    table_name,
    column_name,
    encryption_alg,
    salt
FROM all_encrypted_columns
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY table_name, column_name
"""

PII_INDICATORS = """
SELECT
    owner       AS schema_name,
    table_name,
    column_name,
    data_type,
    CASE
        WHEN REGEXP_LIKE(UPPER(column_name), 'SSN|SOCIAL.?SEC|PASSPORT|NATL.?ID|TAX.?ID|NIN|NINO')
            THEN 'Government ID'
        WHEN REGEXP_LIKE(UPPER(column_name), 'E.?MAIL')
            THEN 'Email'
        WHEN REGEXP_LIKE(UPPER(column_name), 'PHONE|MOBILE|CELL.?NUM|CONTACT.?NUM')
            THEN 'Phone'
        WHEN REGEXP_LIKE(UPPER(column_name), 'CREDIT.?CARD|CARD.?NUM|CVV|CVC|PAN')
            THEN 'Payment'
        WHEN REGEXP_LIKE(UPPER(column_name), 'BIRTH.?DATE|DOB|DATE.?OF.?BIRTH')
            THEN 'Date of Birth'
        WHEN REGEXP_LIKE(UPPER(column_name), 'ADDRESS|STREET|CITY|ZIP|POSTAL')
            THEN 'Address'
        WHEN REGEXP_LIKE(UPPER(column_name), 'SALARY|INCOME|WAGE|COMPENSAT|ACCOUNT.?NUM|BANK')
            THEN 'Financial'
        WHEN REGEXP_LIKE(UPPER(column_name), 'PASSWORD|PASSWD|SECRET|TOKEN|API.?KEY')
            THEN 'Credential'
        WHEN REGEXP_LIKE(UPPER(column_name), 'FIRST.?NAME|LAST.?NAME|FULL.?NAME|SURNAME')
            THEN 'Name'
        ELSE 'Other PII'
    END AS pii_type
FROM all_tab_columns
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND REGEXP_LIKE(UPPER(column_name),
    'SSN|SOCIAL.?SEC|PASSPORT|TAX.?ID|E.?MAIL|PHONE|MOBILE|CREDIT.?CARD|CARD.?NUM|CVV|'||
    'BIRTH.?DATE|DOB|ADDRESS|STREET|ZIP|POSTAL|SALARY|INCOME|WAGE|PASSWORD|PASSWD|'||
    'SECRET|TOKEN|API.?KEY|FIRST.?NAME|LAST.?NAME|FULL.?NAME|SURNAME|ACCOUNT.?NUM|BANK')
ORDER BY table_name, column_name
"""

# ── Feature usage & risks ──────────────────────────────────────────────────────

SQL_AGENT_JOBS = """
SELECT
    owner           AS schema_name,
    job_name,
    job_type,
    state,
    enabled,
    run_count,
    failure_count,
    TO_CHAR(last_start_date, 'YYYY-MM-DD HH24:MI:SS') AS last_start_date,
    TO_CHAR(next_run_date,   'YYYY-MM-DD HH24:MI:SS') AS next_run_date,
    comments
FROM all_scheduler_jobs
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY job_name
"""

LINKED_SERVERS = """
SELECT
    owner       AS schema_name,
    db_link,
    username,
    host,
    TO_CHAR(created, 'YYYY-MM-DD') AS created
FROM all_db_links
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
   OR owner = 'PUBLIC'
ORDER BY db_link
"""

CROSS_DB_REFERENCES = """
SELECT
    owner       AS schema_name,
    name        AS object_name,
    type        AS object_type,
    COUNT(*)    AS db_link_refs
FROM all_source
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND UPPER(text) LIKE '%@%'
  AND type IN ('PROCEDURE','FUNCTION','PACKAGE','PACKAGE BODY','TRIGGER','VIEW')
GROUP BY owner, name, type
ORDER BY db_link_refs DESC
"""

REPLICATION_STATUS = """
SELECT
    log_owner                   AS schema_name,
    master                      AS master_table,
    log_table,
    primary_key,
    rowids,
    filter_columns,
    TO_CHAR(current_snapshots,  'YYYY-MM-DD') AS snapshot_date
FROM all_mview_logs
WHERE log_owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY master
"""

# Oracle Advanced Queuing (equivalent to Service Broker)
SERVICE_BROKER = """
SELECT
    owner           AS schema_name,
    name            AS queue_name,
    queue_type,
    enqueue_enabled,
    dequeue_enabled,
    retention
FROM all_queues
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY name
"""

# v$version may need SELECT_CATALOG_ROLE; fails gracefully via _safe_fetch
VERSION_FEATURES = """
SELECT
    banner      AS feature,
    NULL        AS notes
FROM v$version
WHERE ROWNUM <= 10
"""

# ── Null analysis ──────────────────────────────────────────────────────────────
# Sentinel: assessment_service.py uses parameterised cursor.execute(sql, (owner, table))
NULL_ANALYSIS_COLUMNS = "PARAMETERISED"

# ── Schema / Design checks ─────────────────────────────────────────────────────

TRUSTWORTHY_DATABASES = """
SELECT
    name                                                       AS database_name,
    'N/A — Oracle uses Database Vault for privileged access control' AS trustworthy_status,
    CASE is_pdb WHEN 'YES' THEN 'PDB — isolated container' ELSE 'CDB or non-CDB' END AS cross_db_chaining,
    open_mode                                                  AS state_desc,
    log_mode                                                   AS recovery_model_desc
FROM v$database
"""

DEPRECATED_DATA_TYPES = """
SELECT
    owner                                                      AS schema_name,
    table_name,
    column_name,
    data_type,
    CASE data_type
        WHEN 'LONG'     THEN 'DEPRECATED — use CLOB; LONG columns are limited and unsupported in many contexts'
        WHEN 'LONG RAW' THEN 'DEPRECATED — use BLOB'
        WHEN 'RAW'      THEN 'CAUTION — use BLOB or VARCHAR2 hex encoding'
        WHEN 'FLOAT'    THEN 'CAUTION — imprecise; use NUMBER(p,s) for financial data'
        WHEN 'XMLTYPE'  THEN 'CAUTION — limited driver support; consider CLOB/JSON'
        WHEN 'ROWID'    THEN 'AVOID — physical ROWID can change after table rebuild'
        WHEN 'UROWID'   THEN 'CAUTION — universal ROWID; verify portability requirements'
        ELSE 'REVIEW'
    END                                                        AS recommendation
FROM all_tab_columns
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND data_type IN ('LONG','LONG RAW','RAW','FLOAT','XMLTYPE','ROWID','UROWID')
ORDER BY data_type, table_name, column_name
"""

MISSING_PRIMARY_KEYS = """
SELECT
    t.owner                                                    AS schema_name,
    t.table_name,
    NVL(t.num_rows, 0)                                         AS row_count,
    'No primary key constraint defined'                        AS finding
FROM all_tables t
WHERE t.owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND NOT EXISTS (
      SELECT 1 FROM all_constraints c
      WHERE c.owner           = t.owner
        AND c.table_name      = t.table_name
        AND c.constraint_type = 'P'
  )
ORDER BY t.num_rows DESC NULLS LAST, t.table_name
FETCH FIRST 100 ROWS ONLY
"""

HEAP_TABLES = """
SELECT
    owner                                                      AS schema_name,
    table_name,
    NVL(num_rows, 0)                                           AS row_count,
    ROUND(NVL(blocks * 8192, 0) / (1024*1024), 4)             AS size_mb,
    CASE iot_type
        WHEN 'IOT'          THEN 'Index-Organized Table (IOT) — clustered by primary key'
        WHEN 'IOT_OVERFLOW' THEN 'IOT overflow segment'
        ELSE 'Heap-organized table without primary key — full scans possible'
    END                                                        AS finding
FROM all_tables
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND (iot_type IS NOT NULL
       OR NOT EXISTS (
           SELECT 1 FROM all_constraints c
           WHERE c.owner           = all_tables.owner
             AND c.table_name      = all_tables.table_name
             AND c.constraint_type = 'P'
       ))
ORDER BY num_rows DESC NULLS LAST
FETCH FIRST 100 ROWS ONLY
"""

UNTRUSTED_CONSTRAINTS = """
SELECT
    CASE constraint_type
        WHEN 'R' THEN 'FOREIGN KEY'
        WHEN 'C' THEN 'CHECK CONSTRAINT'
        ELSE constraint_type
    END                                                        AS constraint_type,
    owner                                                      AS schema_name,
    table_name,
    constraint_name,
    CASE status
        WHEN 'DISABLED'     THEN 'Disabled — RISK'
        WHEN 'ENABLED'      THEN 'Enabled'
        ELSE status
    END                                                        AS trust_status,
    CASE validated
        WHEN 'NOT VALIDATED' THEN 'Not Validated — RISK'
        ELSE                      'Validated'
    END                                                        AS enabled_status,
    CASE
        WHEN status    = 'DISABLED'       THEN 'DISABLED — not enforced; optimizer ignores'
        WHEN validated = 'NOT VALIDATED'  THEN 'NOT VALIDATED — optimizer ignores; data integrity not guaranteed'
        ELSE 'OK'
    END                                                        AS finding
FROM all_constraints
WHERE owner           = SYS_CONTEXT('USERENV','SESSION_USER')
  AND constraint_type IN ('R','C')
  AND (status = 'DISABLED' OR validated = 'NOT VALIDATED')
ORDER BY constraint_type, table_name, constraint_name
"""

SP_NAMING_VIOLATIONS = """
SELECT
    owner                                                      AS schema_name,
    object_name                                                AS procedure_name,
    CASE
        WHEN object_name LIKE 'SP_%'
            THEN 'SP_ prefix — redundant naming convention in Oracle'
        WHEN object_name LIKE 'PROC_%'
            THEN 'PROC_ prefix — redundant with object_type'
        WHEN REGEXP_LIKE(object_name, '^[a-z]')
            THEN 'Lowercase start — Oracle conventionally uses uppercase; unquoted names fold to upper'
        ELSE 'Non-standard naming pattern'
    END                                                        AS finding
FROM all_objects
WHERE owner       = SYS_CONTEXT('USERENV','SESSION_USER')
  AND object_type = 'PROCEDURE'
  AND status      = 'VALID'
  AND (object_name LIKE 'SP_%'
    OR object_name LIKE 'PROC_%'
    OR REGEXP_LIKE(object_name, '^[a-z]'))
ORDER BY owner, object_name
"""

DUPLICATE_INDEXES = """
SELECT
    ai1.owner                                                  AS schema_name,
    ai1.table_name,
    ai1.index_name                                             AS index1_name,
    ai2.index_name                                             AS index2_name,
    ai1.index_type,
    (SELECT LISTAGG(aic.column_name, ', ')
            WITHIN GROUP (ORDER BY aic.column_position)
     FROM all_ind_columns aic
     WHERE aic.index_owner = ai1.owner
       AND aic.index_name  = ai1.index_name)                   AS shared_key_columns,
    'Duplicate leading key columns — consider consolidating'   AS finding
FROM all_indexes ai1
JOIN all_indexes ai2
  ON  ai2.owner       = ai1.owner
 AND  ai2.table_name  = ai1.table_name
 AND  ai2.index_name  > ai1.index_name
WHERE ai1.owner      = SYS_CONTEXT('USERENV','SESSION_USER')
  AND ai1.uniqueness = 'NONUNIQUE'
  AND ai2.uniqueness = 'NONUNIQUE'
  AND (SELECT LISTAGG(column_name, ',') WITHIN GROUP (ORDER BY column_position)
       FROM all_ind_columns
       WHERE index_owner = ai1.owner AND index_name = ai1.index_name
      ) = (
       SELECT LISTAGG(column_name, ',') WITHIN GROUP (ORDER BY column_position)
       FROM all_ind_columns
       WHERE index_owner = ai2.owner AND index_name = ai2.index_name
      )
ORDER BY ai1.owner, ai1.table_name
FETCH FIRST 100 ROWS ONLY
"""

DATABASE_OPTIONS_AUDIT = """
SELECT
    name                                                       AS database_name,
    log_mode                                                   AS recovery_model_desc,
    db_unique_name                                             AS page_verify_option_desc,
    TO_CHAR(created, 'YYYY-MM-DD')                             AS compatibility_level,
    characterset                                               AS collation_name,
    open_mode                                                  AS state_desc,
    CASE log_mode
         WHEN 'ARCHIVELOG' THEN 'OK — ARCHIVELOG enabled (PITR possible)'
         ELSE                   'RISK: NOARCHIVELOG — no point-in-time recovery'
    END                                                        AS auto_close,
    'N/A — Oracle manages space automatically'                 AS auto_shrink,
    CASE flashback_on
         WHEN 'YES' THEN 'OK — Flashback Database enabled'
         ELSE             'Flashback Database not enabled'
    END                                                        AS page_verify_status,
    'Automatic — Oracle manages statistics'                    AS auto_update_stats,
    'Automatic — Oracle manages statistics'                    AS auto_create_stats,
    open_mode                                                  AS access_mode
FROM v$database
"""

OBJECT_PERMISSIONS = """
SELECT
    privilege                                                  AS permission_state,
    privilege                                                  AS permission_name,
    type                                                       AS object_class,
    table_name                                                 AS object_name,
    owner                                                      AS schema_name,
    grantee,
    'USER/ROLE'                                                AS grantee_type
FROM all_tab_privs
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND grantee NOT IN ('PUBLIC','SYS','SYSTEM')
ORDER BY table_name, grantee
"""

# ── Performance checks ─────────────────────────────────────────────────────────

MISSING_INDEXES = """
SELECT
    t.owner                                                    AS schema_name,
    t.table_name,
    'N/A'                                                      AS equality_columns,
    'N/A'                                                      AS inequality_columns,
    'N/A'                                                      AS included_columns,
    CASE WHEN pk.constraint_name IS NULL THEN 100 ELSE 0 END   AS improvement_score,
    0                                                          AS user_seeks,
    NVL(t.num_rows, 0)                                         AS user_scans,
    0                                                          AS avg_impact_pct,
    TO_CHAR(t.last_analyzed, 'YYYY-MM-DD HH24:MI:SS')          AS last_user_seek
FROM all_tables t
LEFT JOIN all_constraints pk
  ON  pk.owner           = t.owner
 AND  pk.table_name      = t.table_name
 AND  pk.constraint_type = 'P'
LEFT JOIN all_indexes ai
  ON  ai.owner      = t.owner
 AND  ai.table_name = t.table_name
WHERE t.owner           = SYS_CONTEXT('USERENV','SESSION_USER')
  AND pk.constraint_name IS NULL
  AND ai.index_name      IS NULL
ORDER BY t.num_rows DESC NULLS LAST
FETCH FIRST 50 ROWS ONLY
"""

INDEX_USAGE_STATS = """
SELECT
    i.owner                                                    AS schema_name,
    i.table_name,
    i.index_name,
    i.index_type                                               AS type_desc,
    u.used                                                     AS user_seeks,
    0                                                          AS user_scans,
    0                                                          AS user_lookups,
    0                                                          AS user_updates,
    TO_CHAR(u.start_monitoring, 'YYYY-MM-DD HH24:MI:SS')      AS last_user_seek,
    TO_CHAR(u.end_monitoring,   'YYYY-MM-DD HH24:MI:SS')      AS last_user_update,
    CASE u.used
        WHEN 'YES' THEN 'Active'
        WHEN 'NO'  THEN 'Never Used'
        ELSE            'Monitoring not enabled'
    END                                                        AS index_status
FROM all_indexes i
LEFT JOIN v$object_usage u ON u.name = i.index_name
WHERE i.owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY i.table_name, i.index_name
FETCH FIRST 100 ROWS ONLY
"""

FRAGMENTATION_REPORT = """
SELECT
    s.owner                                                    AS schema_name,
    s.segment_name                                             AS table_name,
    'TABLE'                                                    AS index_name,
    s.segment_type                                             AS type_desc,
    ROUND(
        100.0 * (s.bytes - NVL(t.avg_row_len, 0) * NVL(t.num_rows, 0))
        / NULLIF(s.bytes, 0), 2
    )                                                          AS fragmentation_pct,
    s.blocks                                                   AS page_count,
    CASE
        WHEN s.bytes > 0
         AND 100.0 * (s.bytes - NVL(t.avg_row_len,0) * NVL(t.num_rows,0)) / s.bytes > 30
            THEN 'REBUILD / MOVE TABLE recommended (>30% estimated waste)'
        WHEN s.bytes > 0
         AND 100.0 * (s.bytes - NVL(t.avg_row_len,0) * NVL(t.num_rows,0)) / s.bytes > 10
            THEN 'Consider ALTER TABLE ... SHRINK SPACE (10-30%)'
        ELSE 'OK'
    END                                                        AS recommendation
FROM user_segments s
JOIN all_tables t
  ON  t.owner      = s.owner
 AND  t.table_name = s.segment_name
WHERE s.owner        = SYS_CONTEXT('USERENV','SESSION_USER')
  AND s.segment_type = 'TABLE'
  AND s.blocks       > 100
ORDER BY s.bytes DESC NULLS LAST
FETCH FIRST 100 ROWS ONLY
"""

STATISTICS_HEALTH = """
SELECT
    owner                                                      AS schema_name,
    table_name,
    'table_stats'                                              AS stat_name,
    TO_CHAR(last_analyzed, 'YYYY-MM-DD HH24:MI:SS')            AS last_updated,
    NVL(num_rows, 0)                                           AS rows,
    NVL(sample_size, 0)                                        AS rows_sampled,
    CASE
        WHEN num_rows > 0 AND sample_size > 0
        THEN ROUND(100.0 * sample_size / num_rows, 2)
        ELSE 0
    END                                                        AS sample_pct,
    0                                                          AS modification_counter,
    CASE
        WHEN last_analyzed IS NULL
            THEN 'STALE — never analyzed; run DBMS_STATS.GATHER_TABLE_STATS'
        WHEN last_analyzed < SYSDATE - 30
            THEN 'OLD — not analyzed in 30+ days'
        WHEN sample_size < num_rows * 0.10 AND NVL(num_rows, 0) > 10000
            THEN 'LOW SAMPLE — statistics may be inaccurate for large table'
        ELSE 'OK'
    END                                                        AS status
FROM all_tables
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY last_analyzed ASC NULLS FIRST
FETCH FIRST 100 ROWS ONLY
"""

# ── Reliability / config checks ────────────────────────────────────────────────

BACKUP_HISTORY = """
SELECT
    name                                                       AS database_name,
    TO_CHAR(
        (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type = 'D'),
        'YYYY-MM-DD HH24:MI:SS')                               AS last_full_backup,
    TO_CHAR(
        (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type = 'I'),
        'YYYY-MM-DD HH24:MI:SS')                               AS last_diff_backup,
    TO_CHAR(
        (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type = 'L'),
        'YYYY-MM-DD HH24:MI:SS')                               AS last_log_backup,
    ROUND(
        (SYSDATE - (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type='D')) * 24, 1
    )                                                          AS hours_since_full_backup,
    ROUND(
        (SYSDATE - (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type='L')) * 24, 1
    )                                                          AS hours_since_log_backup,
    log_mode                                                   AS recovery_model_desc,
    CASE
        WHEN (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type = 'D') IS NULL
            THEN 'CRITICAL: No RMAN full backup found'
        WHEN SYSDATE - (SELECT MAX(completion_time) FROM v$backup_set WHERE backup_type = 'D') > 7
            THEN 'WARNING: Full backup older than 7 days'
        ELSE 'OK'
    END                                                        AS backup_status
FROM v$database
"""

SERVER_CONFIGURATIONS = """
SELECT
    name                                                       AS config_name,
    value                                                      AS configured_value,
    value                                                      AS running_value,
    minimum                                                    AS min_value,
    maximum                                                    AS max_value,
    description,
    CASE
        WHEN name = 'sga_target'            AND value = '0'
            THEN 'RECOMMEND: set SGA_TARGET for auto-tuning'
        WHEN name = 'pga_aggregate_target'  AND value = '0'
            THEN 'RECOMMEND: set PGA_AGGREGATE_TARGET'
        WHEN name = 'optimizer_mode'        AND value != 'ALL_ROWS'
            THEN 'REVIEW: non-default optimizer mode'
        WHEN name = 'audit_trail'           AND value = 'NONE'
            THEN 'RISK: Auditing disabled — compliance may require AUDIT_TRAIL=DB'
        WHEN name = 'remote_login_passwordfile' AND value = 'NONE'
            THEN 'CAUTION: Password file authentication disabled'
        ELSE 'OK'
    END                                                        AS recommendation
FROM v$parameter
WHERE name IN (
    'db_cache_size','sga_target','pga_aggregate_target','shared_pool_size',
    'log_buffer','db_block_size','audit_trail',
    'optimizer_mode','cursor_sharing','open_cursors','session_cached_cursors',
    'undo_management','undo_tablespace','undo_retention',
    'parallel_max_servers','parallel_min_servers',
    'remote_login_passwordfile','os_authent_prefix'
)
ORDER BY name
"""

WEAK_SQL_LOGINS = """
SELECT
    username                                                   AS login_name,
    account_status                                             AS type_desc,
    CASE WHEN account_status LIKE '%LOCKED%' THEN 'Disabled' ELSE 'Enabled' END AS login_status,
    profile                                                    AS password_policy,
    TO_CHAR(expiry_date, 'YYYY-MM-DD')                         AS expiration_policy,
    TO_CHAR(password_change_date, 'YYYY-MM-DD')                AS password_last_set,
    lcount                                                     AS bad_password_count,
    TRUNC(expiry_date - SYSDATE)                               AS days_until_expiration,
    CASE
        WHEN account_status LIKE '%EXPIRED%'
            THEN 'RISK: Password expired'
        WHEN expiry_date IS NULL
            THEN 'RISK: No expiry — password never expires'
        WHEN profile = 'DEFAULT'
            THEN 'CAUTION: Using DEFAULT profile — verify password policy settings'
        ELSE 'OK'
    END                                                        AS assessment
FROM dba_users
WHERE username NOT IN (
    'SYS','SYSTEM','OUTLN','DBSNMP','APPQOSSYS','AUDSYS','GGSYS',
    'RDSADMIN','CTXSYS','DVSYS','EXFSYS','LBACSYS','MDSYS','OJVMSYS',
    'ORDDATA','ORDSYS','WMSYS','XDB','ANONYMOUS','GSMADMIN_INTERNAL',
    'GSMCATUSER','GSMUSER','DBSFWUSER','REMOTE_SCHEDULER_AGENT',
    'SYSBACKUP','SYSDG','SYSKM','SYSRAC','XS$NULL'
)
ORDER BY account_status, username
"""

SERVER_PERMISSIONS = """
SELECT
    granted_role                                               AS server_role,
    grantee                                                    AS member_name,
    'ROLE'                                                     AS type_desc,
    CASE admin_option WHEN 'YES' THEN 'Admin' ELSE 'Enabled' END AS login_status,
    'N/A'                                                      AS member_since
FROM user_role_privs
WHERE granted_role IN (
    'DBA','SYSDBA','SYSOPER','RESOURCE','CONNECT',
    'IMP_FULL_DATABASE','EXP_FULL_DATABASE',
    'SELECT_CATALOG_ROLE','EXECUTE_CATALOG_ROLE'
)
UNION ALL
SELECT
    privilege                                                  AS server_role,
    SYS_CONTEXT('USERENV','SESSION_USER')                      AS member_name,
    'SYSTEM PRIV'                                              AS type_desc,
    CASE admin_option WHEN 'YES' THEN 'Admin' ELSE 'Enabled' END AS login_status,
    'N/A'                                                      AS member_since
FROM user_sys_privs
WHERE privilege IN (
    'CREATE SESSION','CREATE ANY TABLE','DROP ANY TABLE',
    'ALTER ANY TABLE','UNLIMITED TABLESPACE','BECOME USER'
)
ORDER BY server_role, member_name
"""

DEPRECATED_FEATURES_IN_USE = """
SELECT
    data_type                                                  AS deprecated_feature,
    COUNT(*)                                                   AS usage_count_since_restart
FROM all_tab_columns
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND data_type IN ('LONG','LONG RAW','RAW','FLOAT','XMLTYPE','ROWID','UROWID')
GROUP BY data_type
ORDER BY COUNT(*) DESC
"""

# ── Schema / ETL classification ────────────────────────────────────────────────

SCHEMA_CLASSIFICATION = """
SELECT
    u.username                                                 AS schema_name,
    (SELECT COUNT(*) FROM all_tables t
     WHERE t.owner = u.username)                               AS table_count,
    (SELECT COUNT(*) FROM all_views v
     WHERE v.owner = u.username)                               AS view_count,
    (SELECT COUNT(*) FROM all_objects o
     WHERE o.owner = u.username AND o.object_type = 'PROCEDURE') AS proc_count,
    CASE
        WHEN u.username IN ('STG','STAGING','RAW','BRONZE','LANDING')
            THEN 'Staging / Landing'
        WHEN u.username IN ('ETL','CTRL','CONTROL','PIPELINE','META','METADATA')
            THEN 'ETL Control'
        WHEN u.username IN ('LKP','LOOKUP','REF','REFERENCE','DIM','CONFIG')
            THEN 'Lookup / Reference'
        WHEN u.username IN ('APP','REPORTING','RPT','FACT','MART','GOLD','SILVER')
            THEN 'Business / Reporting'
        WHEN u.username IN ('ERR','ERROR','LOG','AUDIT','TRACE')
            THEN 'Error / Audit'
        WHEN u.username IN ('BI','DWH','DW','WAREHOUSE','ODS','DATAMART')
            THEN 'Data Warehouse'
        ELSE 'Other — review'
    END                                                        AS schema_classification,
    CASE
        WHEN u.username IN ('STG','STAGING','RAW','BRONZE','LANDING')
            THEN 'Transient staging — migrate pipelines to Fabric Bronze/Silver'
        WHEN u.username IN ('ETL','CTRL','CONTROL','PIPELINE','META','METADATA')
            THEN 'ETL orchestration — replace with Fabric Data Pipelines'
        WHEN u.username IN ('LKP','LOOKUP','REF','REFERENCE','DIM','CONFIG')
            THEN 'Reference data — move to Fabric Gold layer'
        WHEN u.username IN ('APP','REPORTING','RPT','FACT','MART','GOLD','SILVER')
            THEN 'Core business logic — migrate to Fabric Gold Warehouse'
        WHEN u.username IN ('ERR','ERROR','LOG','AUDIT','TRACE')
            THEN 'Operational logs — replace with Fabric Monitor Hub'
        WHEN u.username IN ('BI','DWH','DW','WAREHOUSE','ODS','DATAMART')
            THEN 'Data warehouse layer — migrate to Fabric Lakehouse'
        ELSE 'Review and classify before migration planning'
    END                                                        AS migration_recommendation
FROM all_users u
WHERE u.username NOT IN (
    'SYS','SYSTEM','OUTLN','DBSNMP','APPQOSSYS','AUDSYS','GGSYS',
    'CTXSYS','DVSYS','EXFSYS','LBACSYS','MDSYS','OJVMSYS',
    'ORDDATA','ORDSYS','WMSYS','XDB','ANONYMOUS','PUBLIC',
    'GSMADMIN_INTERNAL','GSMCATUSER','GSMUSER','DBSFWUSER'
)
ORDER BY schema_classification, u.username
"""

SP_COMPLEXITY = """
SELECT
    s.owner                                                    AS schema_name,
    s.name                                                     AS procedure_name,
    TO_CHAR(o.last_ddl_time, 'YYYY-MM-DD')                     AS create_date,
    TO_CHAR(o.last_ddl_time, 'YYYY-MM-DD')                     AS modify_date,
    (SELECT COUNT(*) FROM all_arguments a
     WHERE a.owner = s.owner AND a.object_name = s.name)       AS param_count,
    SUM(LENGTH(s.text))                                        AS char_length,
    COUNT(*)                                                   AS line_count,
    MAX(CASE WHEN UPPER(s.text) LIKE '%CURSOR%'                THEN 'Yes' ELSE 'No' END) AS uses_cursor,
    MAX(CASE WHEN UPPER(s.text) LIKE '%GLOBAL TEMPORARY%'
              OR  UPPER(s.text) LIKE '%CREATE%TEMP%'           THEN 'Yes' ELSE 'No' END) AS uses_temp_table,
    MAX(CASE WHEN UPPER(s.text) LIKE '%EXECUTE IMMEDIATE%'
              OR  UPPER(s.text) LIKE '%DBMS_SQL%'              THEN 'Yes' ELSE 'No' END) AS uses_dynamic_sql,
    MAX(CASE WHEN UPPER(s.text) LIKE '%EXCEPTION%'             THEN 'Yes' ELSE 'No' END) AS has_error_handling,
    MAX(CASE WHEN UPPER(s.text) LIKE '%COMMIT%'
              OR  UPPER(s.text) LIKE '%ROLLBACK%'              THEN 'Yes' ELSE 'No' END) AS uses_transactions,
    CASE
        WHEN SUM(LENGTH(s.text)) > 10000 THEN 'HIGH — refactor candidate'
        WHEN SUM(LENGTH(s.text)) >  3000 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                        AS complexity_level
FROM all_source s
JOIN all_objects o
  ON  o.owner       = s.owner
 AND  o.object_name = s.name
 AND  o.object_type = 'PROCEDURE'
WHERE s.owner = SYS_CONTEXT('USERENV','SESSION_USER')
  AND s.type  = 'PROCEDURE'
GROUP BY s.owner, s.name, o.last_ddl_time
ORDER BY SUM(LENGTH(s.text)) DESC
FETCH FIRST 100 ROWS ONLY
"""

VIEW_COMPLEXITY = """
SELECT
    v.owner                                                    AS schema_name,
    v.view_name,
    TO_CHAR(o.created,      'YYYY-MM-DD')                      AS create_date,
    TO_CHAR(o.last_ddl_time,'YYYY-MM-DD')                      AS modify_date,
    v.text_length                                              AS char_length,
    0                                                          AS line_count,
    0                                                          AS join_count,
    0                                                          AS subquery_count,
    'N/A'                                                      AS has_union,
    'N/A'                                                      AS has_cte,
    CASE
        WHEN v.text_length > 5000 THEN 'HIGH — consider materializing as Materialized View'
        WHEN v.text_length > 1500 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                        AS complexity_level
FROM all_views v
LEFT JOIN all_objects o
  ON  o.owner       = v.owner
 AND  o.object_name = v.view_name
 AND  o.object_type = 'VIEW'
WHERE v.owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY v.text_length DESC NULLS LAST
FETCH FIRST 100 ROWS ONLY
"""

DATABASE_FILES = """
SELECT
    tablespace_name                                            AS file_name,
    'Managed by Oracle'                                        AS physical_name,
    'TABLESPACE'                                               AS file_type,
    ROUND(SUM(bytes) / (1024 * 1024), 2)                      AS size_mb,
    'See DBA_DATA_FILES for per-file max size'                 AS max_size,
    'Auto'                                                     AS auto_growth,
    'ONLINE'                                                   AS file_state,
    'Check DBA_DATA_FILES for detailed file-level information (requires DBA role)' AS recommendation
FROM user_segments
GROUP BY tablespace_name
ORDER BY SUM(bytes) DESC
"""

# ── Oracle Scheduler — job schedules & steps (Oracle equivalent of SQL Agent) ─

SQL_AGENT_JOB_SCHEDULES = """
SELECT
    job_name,
    CASE enabled WHEN 'TRUE' THEN 'Enabled' ELSE 'Disabled' END AS job_status,
    COALESCE(schedule_name, 'Inline schedule')                 AS schedule_name,
    'Enabled'                                                  AS schedule_status,
    COALESCE(repeat_interval, 'Once / manual')                 AS frequency_type,
    NULL                                                       AS freq_interval,
    COALESCE(repeat_interval, 'N/A')                           AS intraday_frequency,
    TO_CHAR(start_date, 'HH24MISS')                            AS active_start_time,
    TO_CHAR(end_date,   'HH24MISS')                            AS active_end_time,
    TO_CHAR(next_run_date, 'YYYYMMDD')                         AS next_run_date
FROM all_scheduler_jobs
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY job_name
"""

SQL_AGENT_JOB_STEPS = """
SELECT
    job_name,
    CASE enabled WHEN 'TRUE' THEN 'Enabled' ELSE 'Disabled' END AS job_status,
    NULL                                                       AS step_id,
    job_action                                                 AS step_name,
    job_type                                                   AS step_type,
    owner                                                      AS database_name,
    0                                                          AS retry_attempts,
    0                                                          AS retry_interval_min,
    'Quit — success'                                           AS on_success,
    'Quit — failure'                                           AS on_fail
FROM all_scheduler_jobs
WHERE owner = SYS_CONTEXT('USERENV','SESSION_USER')
ORDER BY job_name
"""

# ── SQL Server-only stubs ──────────────────────────────────────────────────────

SSIS_CATALOG_PACKAGES = """
SELECT NULL AS folder_name, NULL AS project_name, NULL AS package_name,
       NULL AS description,  NULL AS last_deployed, NULL AS entry_type,
       NULL AS package_format_version FROM dual WHERE 1=0
"""

SSIS_EXECUTION_HISTORY = """
SELECT NULL AS folder_name, NULL AS project_name, NULL AS package_name,
       NULL AS status,       NULL AS start_time,   NULL AS end_time,
       NULL AS duration_sec, NULL AS executed_as_name FROM dual WHERE 1=0
"""

SSIS_MSDB_PACKAGES = """
SELECT NULL AS folder_name, NULL AS package_name, NULL AS create_date,
       NULL AS package_type, NULL AS vermajor,    NULL AS verminor
FROM dual WHERE 1=0
"""

SSAS_LINKED_SERVERS = """
SELECT NULL AS linked_server_name, NULL AS product,
       NULL AS provider,            NULL AS data_source,
       NULL AS remote_login_enabled,NULL AS modify_date,
       NULL AS finding FROM dual WHERE 1=0
"""

# ── Performance — wait stats & query store ────────────────────────────────────

WAIT_STATISTICS = """
SELECT
    event                                                      AS wait_type,
    ROUND(time_waited / 100.0, 2)                              AS total_wait_sec,
    ROUND(max_wait    / 100.0, 2)                              AS max_wait_sec,
    total_waits                                                AS waiting_tasks_count,
    ROUND(100.0 * time_waited / NULLIF(SUM(time_waited) OVER(), 0), 2) AS pct_total_wait,
    CASE
        WHEN event LIKE '%db file%' OR event LIKE '%direct%read%'
            THEN 'I/O — disk read bottleneck'
        WHEN event LIKE '%enq%' OR event LIKE '%TM%' OR event LIKE '%TX%'
            THEN 'Locking — blocking / deadlock pressure'
        WHEN event LIKE '%CPU%' OR event LIKE '%resmgr%'
            THEN 'CPU — high CPU pressure'
        WHEN event LIKE '%buffer%'
            THEN 'Memory — buffer cache pressure'
        WHEN event LIKE '%log%' OR event LIKE '%redo%'
            THEN 'Log — redo log write latency'
        WHEN event LIKE '%SQL*Net%' OR event LIKE '%Net%'
            THEN 'Network — client consuming results slowly'
        ELSE 'Other — review'
    END                                                        AS interpretation
FROM v$system_event
WHERE total_waits > 0
  AND event NOT IN (
      'smon timer','pmon timer','rdbms ipc message','dispatcher timer',
      'Streams AQ: qmn slave idle wait','queue messages','pipe get',
      'virtual circuit status','jobq slave wait','Space Manager: slave idle wait'
  )
ORDER BY time_waited DESC
FETCH FIRST 25 ROWS ONLY
"""

QUERY_STORE_TOP_QUERIES = """
SELECT
    sql_id                                                     AS query_id,
    SUBSTR(sql_text, 1, 500)                                   AS query_text,
    ROUND(elapsed_time / NULLIF(executions, 0) / 1000.0, 2)   AS avg_duration_ms,
    ROUND(elapsed_time / 1000.0, 2)                            AS max_duration_ms,
    ROUND(cpu_time / NULLIF(executions, 0) / 1000.0, 2)       AS avg_cpu_ms,
    ROUND(buffer_gets / NULLIF(executions, 0), 0)              AS avg_logical_reads,
    executions                                                 AS total_executions,
    TO_CHAR(last_active_time, 'YYYY-MM-DD HH24:MI:SS')         AS last_executed,
    CASE
        WHEN elapsed_time / NULLIF(executions, 0) > 5000000 THEN 'CRITICAL: avg > 5 sec'
        WHEN elapsed_time / NULLIF(executions, 0) > 1000000 THEN 'WARNING: avg > 1 sec'
        ELSE 'OK'
    END                                                        AS performance_flag
FROM v$sql
WHERE executions > 0
  AND last_active_time >= SYSDATE - 7
  AND parsing_schema_name = SYS_CONTEXT('USERENV','SESSION_USER')
  AND sql_text NOT LIKE '%v$sql%'
ORDER BY elapsed_time / NULLIF(executions, 0) DESC NULLS LAST
FETCH FIRST 25 ROWS ONLY
"""
