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
