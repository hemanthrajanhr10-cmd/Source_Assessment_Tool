"""
All SQL Server metadata queries as module-level constants.
These are read-only, parameterless queries against system catalog views.
"""

OVERVIEW = """
SELECT
    DB_NAME()                                                          AS database_name,
    SUSER_SNAME()                                                      AS connected_user,
    @@VERSION                                                          AS sql_version,
    (SELECT COUNT(*) FROM sys.schemas
     WHERE name NOT IN ('sys','INFORMATION_SCHEMA','guest','db_owner','db_accessadmin',
                        'db_securityadmin','db_ddladmin','db_backupoperator',
                        'db_datareader','db_datawriter','db_denydatareader','db_denydatawriter')) AS schema_count,
    (SELECT COUNT(*) FROM sys.tables)                                  AS table_count,
    (SELECT COUNT(*) FROM sys.views)                                   AS view_count,
    (SELECT COUNT(*) FROM sys.procedures)                              AS proc_count,
    (SELECT COUNT(*) FROM sys.objects WHERE type IN ('FN','IF','TF')) AS func_count,
    CAST(SUM(a.total_pages) * 8 / 1024.0 AS DECIMAL(18,2))           AS total_size_mb
FROM sys.allocation_units a
"""

SCHEMAS = """
SELECT
    s.name                          AS schema_name,
    COUNT(DISTINCT t.object_id)     AS table_count,
    COUNT(DISTINCT v.object_id)     AS view_count,
    COUNT(DISTINCT p.object_id)     AS proc_count
FROM sys.schemas s
LEFT JOIN sys.tables     t ON t.schema_id = s.schema_id
LEFT JOIN sys.views      v ON v.schema_id = s.schema_id
LEFT JOIN sys.procedures p ON p.schema_id = s.schema_id
WHERE s.name NOT IN ('sys','INFORMATION_SCHEMA','guest','db_owner','db_accessadmin',
                     'db_securityadmin','db_ddladmin','db_backupoperator',
                     'db_datareader','db_datawriter','db_denydatareader','db_denydatawriter')
GROUP BY s.name
ORDER BY s.name
"""

TABLES = """
SELECT
    s.name                                                          AS schema_name,
    t.name                                                          AS table_name,
    COUNT(c.column_id)                                              AS column_count,
    CAST(p.rows AS BIGINT)                                          AS row_count,
    CAST(SUM(a.total_pages) * 8 / 1024.0 AS DECIMAL(18,2))        AS size_mb,
    t.create_date,
    t.modify_date
FROM sys.tables t
JOIN sys.schemas          s  ON s.schema_id = t.schema_id
JOIN sys.indexes          i  ON i.object_id = t.object_id AND i.index_id IN (0,1)
JOIN sys.partitions       p  ON p.object_id = t.object_id AND p.index_id = i.index_id
JOIN sys.allocation_units a  ON a.container_id = p.partition_id
JOIN sys.columns          c  ON c.object_id = t.object_id
GROUP BY s.name, t.name, p.rows, t.create_date, t.modify_date
ORDER BY s.name, t.name
"""

COLUMNS = """
SELECT
    s.name          AS schema_name,
    t.name          AS table_name,
    c.column_id,
    c.name          AS column_name,
    tp.name         AS data_type,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable,
    c.is_identity,
    CASE WHEN pk.column_id IS NOT NULL THEN 'YES' ELSE 'NO' END  AS is_primary_key,
    CASE WHEN fk.parent_column_id IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_foreign_key,
    dc.definition   AS default_value
FROM sys.columns c
JOIN sys.tables  t  ON t.object_id = c.object_id
JOIN sys.schemas s  ON s.schema_id = t.schema_id
JOIN sys.types   tp ON tp.user_type_id = c.user_type_id
LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.index_columns ic
    JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    WHERE i.is_primary_key = 1
) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
LEFT JOIN (
    SELECT DISTINCT fkc.parent_object_id, fkc.parent_column_id
    FROM sys.foreign_key_columns fkc
) fk ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
LEFT JOIN sys.default_constraints dc
       ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
ORDER BY s.name, t.name, c.column_id
"""

VIEWS = """
SELECT
    s.name          AS schema_name,
    v.name          AS view_name,
    v.create_date,
    v.modify_date,
    OBJECT_DEFINITION(v.object_id) AS definition
FROM sys.views  v
JOIN sys.schemas s ON s.schema_id = v.schema_id
ORDER BY s.name, v.name
"""

STORED_PROCEDURES = """
SELECT
    s.name  AS schema_name,
    p.name  AS procedure_name,
    p.create_date,
    p.modify_date,
    (SELECT COUNT(*) FROM sys.parameters pm WHERE pm.object_id = p.object_id) AS param_count
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id = p.schema_id
ORDER BY s.name, p.name
"""

FUNCTIONS = """
SELECT
    s.name      AS schema_name,
    o.name      AS function_name,
    o.type_desc AS function_type,
    o.create_date,
    o.modify_date
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('FN','IF','TF')
ORDER BY s.name, o.name
"""

INDEXES = """
SELECT
    s.name              AS schema_name,
    t.name              AS table_name,
    i.name              AS index_name,
    i.type_desc         AS index_type,
    i.is_unique,
    i.is_primary_key,
    i.is_unique_constraint,
    STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS indexed_columns,
    i.fill_factor
FROM sys.indexes i
JOIN sys.tables        t  ON t.object_id = i.object_id
JOIN sys.schemas       s  ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns       c  ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.type > 0
GROUP BY s.name, t.name, i.name, i.type_desc, i.is_unique,
         i.is_primary_key, i.is_unique_constraint, i.fill_factor
ORDER BY s.name, t.name, i.name
"""

RELATIONSHIPS = """
SELECT
    fk.name                           AS fk_name,
    ps.name                           AS parent_schema,
    pt.name                           AS parent_table,
    pc.name                           AS parent_column,
    rs.name                           AS ref_schema,
    rt.name                           AS ref_table,
    rc.name                           AS ref_column,
    fk.delete_referential_action_desc AS on_delete,
    fk.update_referential_action_desc AS on_update
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables  pt ON pt.object_id = fk.parent_object_id
JOIN sys.schemas ps ON ps.schema_id = pt.schema_id
JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id
                   AND pc.column_id = fkc.parent_column_id
JOIN sys.tables  rt ON rt.object_id = fk.referenced_object_id
JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id
                   AND rc.column_id = fkc.referenced_column_id
ORDER BY parent_schema, parent_table, fk_name
"""

INDEX_COVERAGE = """
SELECT
    s.name  AS schema_name,
    t.name  AS table_name,
    COUNT(DISTINCT i.index_id)                                          AS index_count,
    CASE WHEN COUNT(DISTINCT i.index_id) > 0 THEN 'Indexed' ELSE 'No Index' END AS coverage
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.indexes i ON i.object_id = t.object_id AND i.type > 0
GROUP BY s.name, t.name
ORDER BY coverage, s.name, t.name
"""

INSERTION_FREQUENCY = """
SELECT
    s.name      AS schema_name,
    t.name      AS table_name,
    p.rows      AS current_rows,
    t.create_date,
    t.modify_date,
    DATEDIFF(DAY, t.create_date, GETDATE()) AS age_days,
    CASE
        WHEN DATEDIFF(DAY, t.create_date, GETDATE()) > 0
        THEN CAST(p.rows AS FLOAT) / DATEDIFF(DAY, t.create_date, GETDATE())
        ELSE 0
    END AS avg_rows_per_day
FROM sys.tables t
JOIN sys.schemas  s ON s.schema_id = t.schema_id
JOIN sys.indexes  i ON i.object_id = t.object_id AND i.index_id IN (0,1)
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id = i.index_id
WHERE p.rows > 0
ORDER BY avg_rows_per_day DESC
"""

# Template used in null analysis (built dynamically per table)
NULL_ANALYSIS_COLUMNS = """
SELECT c.name, tp.name AS data_type
FROM sys.columns c
JOIN sys.types tp ON tp.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('{full_name}')
  AND c.is_nullable = 1
"""

# ─────────────────────── Security Assessment Queries ────────────────────────

DB_USERS_ROLES = """
SELECT
    dp.name                                                         AS principal_name,
    dp.type_desc                                                    AS principal_type,
    CONVERT(VARCHAR, dp.create_date, 120)                          AS create_date,
    ISNULL(dp.default_schema_name, '')                             AS default_schema,
    ISNULL(sp.name, 'No Server Login')                             AS server_login,
    ISNULL(
        (SELECT STRING_AGG(rp.name, ', ') WITHIN GROUP (ORDER BY rp.name)
         FROM sys.database_role_members drm2
         JOIN sys.database_principals rp ON rp.principal_id = drm2.role_principal_id
         WHERE drm2.member_principal_id = dp.principal_id),
        'None') AS roles
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE dp.type IN ('S', 'U', 'G', 'E', 'X')
ORDER BY dp.name
"""

ORPHANED_USERS = """
SELECT
    dp.name                               AS user_name,
    dp.type_desc                          AS user_type,
    CONVERT(VARCHAR, dp.create_date, 120) AS create_date,
    ISNULL(dp.default_schema_name, '')    AS default_schema
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE dp.type IN ('S', 'U')
  AND sp.sid IS NULL
  AND dp.name NOT IN ('dbo', 'guest', 'INFORMATION_SCHEMA', 'sys')
ORDER BY dp.name
"""

DB_OWNER_MEMBERS = """
SELECT
    dp.name                               AS member_name,
    dp.type_desc                          AS member_type,
    ISNULL(sp.name, 'No Server Login')    AS server_login,
    CONVERT(VARCHAR, dp.create_date, 120) AS create_date
FROM sys.database_role_members drm
JOIN sys.database_principals dp ON dp.principal_id = drm.member_principal_id
JOIN sys.database_principals rp ON rp.principal_id = drm.role_principal_id
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE rp.name = 'db_owner'
  AND dp.name != 'dbo'
ORDER BY dp.name
"""

DYNAMIC_SQL_USAGE = """
SELECT
    o.type_desc                AS object_type,
    s.name                     AS schema_name,
    o.name                     AS object_name,
    CASE
        WHEN m.definition LIKE '%sp_executesql%' THEN 'sp_executesql'
        WHEN m.definition LIKE '%EXEC%+%'
          OR m.definition LIKE '%EXECUTE%+%'  THEN 'Dynamic EXEC (string concat)'
        ELSE 'Dynamic SQL'
    END                        AS dynamic_sql_type
FROM sys.sql_modules m
JOIN sys.objects  o ON o.object_id = m.object_id
JOIN sys.schemas  s ON s.schema_id  = o.schema_id
WHERE o.type IN ('P', 'FN', 'IF', 'TF', 'TR')
  AND (
      m.definition LIKE '%sp_executesql%'
      OR m.definition LIKE '%EXEC%+%'
      OR m.definition LIKE '%EXECUTE%+%'
  )
ORDER BY o.type_desc, s.name, o.name
"""

CLR_ASSEMBLIES = """
SELECT
    a.name                                AS assembly_name,
    a.permission_set_desc                 AS permission_set,
    CONVERT(VARCHAR, a.create_date, 120)  AS create_date,
    CONVERT(VARCHAR, a.modify_date, 120)  AS modify_date,
    CASE a.is_visible WHEN 1 THEN 'Yes' ELSE 'No' END AS is_visible,
    (SELECT COUNT(*) FROM sys.objects o
     WHERE o.assembly_id = a.assembly_id) AS clr_object_count
FROM sys.assemblies a
WHERE a.is_user_defined = 1
ORDER BY a.name
"""

TDE_STATUS = """
SELECT
    d.name                                                                  AS database_name,
    CASE WHEN dek.database_id IS NOT NULL THEN 'Enabled' ELSE 'Not Enabled' END AS tde_status,
    ISNULL(dek.encryption_state_desc, 'N/A')                               AS encryption_state,
    ISNULL(CAST(dek.percent_complete AS VARCHAR(10)), 'N/A')               AS percent_complete,
    ISNULL(dek.key_algorithm, 'N/A')                                       AS key_algorithm,
    ISNULL(CAST(dek.key_length AS VARCHAR(10)), 'N/A')                     AS key_length
FROM sys.databases d
LEFT JOIN sys.dm_database_encryption_keys dek ON dek.database_id = d.database_id
WHERE d.database_id = DB_ID()
"""

COLUMN_ENCRYPTION = """
SELECT
    s.name                    AS schema_name,
    t.name                    AS table_name,
    c.name                    AS column_name,
    tp.name                   AS data_type,
    cek.name                  AS encryption_key_name,
    c.encryption_type_desc    AS encryption_type
FROM sys.columns c
JOIN sys.tables  t   ON t.object_id  = c.object_id
JOIN sys.schemas s   ON s.schema_id  = t.schema_id
JOIN sys.types   tp  ON tp.user_type_id = c.user_type_id
JOIN sys.column_encryption_keys cek
                     ON cek.column_encryption_key_id = c.column_encryption_key_id
WHERE c.column_encryption_key_id IS NOT NULL
ORDER BY s.name, t.name, c.name
"""

PII_INDICATORS = """
SELECT
    s.name  AS schema_name,
    t.name  AS table_name,
    c.name  AS column_name,
    tp.name AS data_type,
    CASE
        WHEN c.name LIKE '%ssn%'           OR c.name LIKE '%social_security%'              THEN 'SSN'
        WHEN c.name LIKE '%email%'         OR c.name LIKE '%e_mail%'                       THEN 'Email'
        WHEN c.name LIKE '%phone%'         OR c.name LIKE '%mobile%'
          OR c.name LIKE '%cell_phone%'                                                    THEN 'Phone'
        WHEN c.name LIKE '%dob%'           OR c.name LIKE '%birth_date%'
          OR c.name LIKE '%date_of_birth%'                                                 THEN 'Date of Birth'
        WHEN c.name LIKE '%passport%'                                                      THEN 'Passport'
        WHEN c.name LIKE '%credit_card%'   OR c.name LIKE '%card_number%'
          OR c.name LIKE '%cc_num%'                                                        THEN 'Credit Card'
        WHEN c.name LIKE '%address%'       OR c.name LIKE '%street%'                       THEN 'Address'
        WHEN c.name LIKE '%zip%'           OR c.name LIKE '%postal%'                       THEN 'Postal Code'
        WHEN c.name LIKE '%salary%'        OR c.name LIKE '%wage%'
          OR c.name LIKE '%income%'                                                        THEN 'Financial'
        WHEN c.name LIKE '%password%'      OR c.name LIKE '%pwd%'
          OR c.name LIKE '%secret%'        OR c.name LIKE '%token%'                        THEN 'Password/Secret'
        WHEN c.name LIKE '%national_id%'   OR c.name LIKE '%nationalid%'                   THEN 'National ID'
        WHEN c.name LIKE '%ip_address%'    OR c.name LIKE '%ipaddress%'                    THEN 'IP Address'
        WHEN c.name LIKE '%gender%'                                                        THEN 'Gender'
        WHEN c.name LIKE '%race%'          OR c.name LIKE '%ethnicity%'                    THEN 'Race/Ethnicity'
        ELSE 'Other PII'
    END AS pii_category
FROM sys.columns c
JOIN sys.tables  t  ON t.object_id  = c.object_id
JOIN sys.schemas s  ON s.schema_id  = t.schema_id
JOIN sys.types   tp ON tp.user_type_id = c.user_type_id
WHERE
    c.name LIKE '%ssn%'           OR c.name LIKE '%social_security%'
    OR c.name LIKE '%email%'      OR c.name LIKE '%e_mail%'
    OR c.name LIKE '%phone%'      OR c.name LIKE '%mobile%'      OR c.name LIKE '%cell_phone%'
    OR c.name LIKE '%dob%'        OR c.name LIKE '%birth_date%'  OR c.name LIKE '%date_of_birth%'
    OR c.name LIKE '%passport%'
    OR c.name LIKE '%credit_card%' OR c.name LIKE '%card_number%' OR c.name LIKE '%cc_num%'
    OR c.name LIKE '%address%'    OR c.name LIKE '%street%'
    OR c.name LIKE '%zip%'        OR c.name LIKE '%postal%'
    OR c.name LIKE '%salary%'     OR c.name LIKE '%wage%'        OR c.name LIKE '%income%'
    OR c.name LIKE '%password%'   OR c.name LIKE '%pwd%'
    OR c.name LIKE '%secret%'     OR c.name LIKE '%token%'
    OR c.name LIKE '%national_id%' OR c.name LIKE '%nationalid%'
    OR c.name LIKE '%ip_address%' OR c.name LIKE '%ipaddress%'
    OR c.name LIKE '%gender%'
    OR c.name LIKE '%race%'       OR c.name LIKE '%ethnicity%'
ORDER BY pii_category, s.name, t.name, c.name
"""

# ─────────────────────── Feature Usage & Risk Queries ───────────────────────

SQL_AGENT_JOBS = """
SELECT
    j.name                                                          AS job_name,
    CASE j.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END       AS status,
    ISNULL(j.description, '')                                       AS description,
    CONVERT(VARCHAR, j.date_created, 120)                           AS date_created,
    CONVERT(VARCHAR, j.date_modified, 120)                          AS date_modified,
    (SELECT COUNT(*)
     FROM msdb.dbo.sysjobhistory jh
     WHERE jh.job_id = j.job_id AND jh.run_status = 0
       AND jh.run_date >= CONVERT(INT, CONVERT(VARCHAR, DATEADD(DAY,-30,GETDATE()), 112))
    )                                                               AS failures_last_30_days,
    CASE jh_last.run_status
        WHEN 0 THEN 'Failed'
        WHEN 1 THEN 'Succeeded'
        WHEN 2 THEN 'Retry'
        WHEN 3 THEN 'Cancelled'
        ELSE 'Never Run / Unknown'
    END                                                             AS last_run_status
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobhistory jh_last
    ON jh_last.instance_id = (
        SELECT MAX(instance_id) FROM msdb.dbo.sysjobhistory
        WHERE job_id = j.job_id AND step_id = 0
    )
ORDER BY j.name
"""

LINKED_SERVERS = """
SELECT
    s.name                                                                  AS linked_server_name,
    ISNULL(s.product,     '')                                               AS product,
    ISNULL(s.provider,    '')                                               AS provider,
    ISNULL(s.data_source, '')                                               AS data_source,
    CASE s.is_remote_login_enabled WHEN 1 THEN 'Yes' ELSE 'No' END         AS remote_login_enabled,
    CASE s.is_data_access_enabled  WHEN 1 THEN 'Yes' ELSE 'No' END         AS data_access_enabled,
    CASE s.is_rpc_out_enabled      WHEN 1 THEN 'Yes' ELSE 'No' END         AS rpc_out_enabled,
    CONVERT(VARCHAR, s.modify_date, 120)                                    AS modify_date,
    (SELECT COUNT(*) FROM sys.linked_logins ll WHERE ll.server_id = s.server_id) AS login_mapping_count
FROM sys.servers s
WHERE s.is_linked = 1
ORDER BY s.name
"""

CROSS_DB_REFERENCES = """
SELECT DISTINCT
    o.type_desc                       AS object_type,
    s.name                            AS schema_name,
    o.name                            AS object_name,
    d.referenced_database_name        AS referenced_database,
    ISNULL(d.referenced_schema_name, '') AS referenced_schema,
    d.referenced_entity_name          AS referenced_entity
FROM sys.sql_expression_dependencies d
JOIN sys.objects o ON o.object_id = d.referencing_id
JOIN sys.schemas s ON s.schema_id  = o.schema_id
WHERE d.referenced_database_name IS NOT NULL
  AND d.referenced_database_name <> DB_NAME()
ORDER BY d.referenced_database_name, s.name, o.name
"""

REPLICATION_STATUS = """
SELECT
    DB_NAME() AS database_name,
    CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE is_replicated = 1)
         THEN 'Yes' ELSE 'No' END                                           AS has_replicated_tables,
    (SELECT COUNT(*) FROM sys.tables WHERE is_replicated = 1)               AS replicated_table_count,
    CASE DATABASEPROPERTYEX(DB_NAME(), 'IsPublished')
         WHEN 1 THEN 'Yes' ELSE 'No' END                                    AS is_publisher,
    CASE DATABASEPROPERTYEX(DB_NAME(), 'IsSubscribed')
         WHEN 1 THEN 'Yes' ELSE 'No' END                                    AS is_subscriber,
    CASE DATABASEPROPERTYEX(DB_NAME(), 'IsMergePublished')
         WHEN 1 THEN 'Yes' ELSE 'No' END                                    AS is_merge_published
"""

SERVICE_BROKER = """
SELECT
    DB_NAME() AS database_name,
    CASE d.is_broker_enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END      AS broker_status,
    (SELECT COUNT(*) FROM sys.service_queues)                                AS user_queue_count,
    (SELECT COUNT(*) FROM sys.services)                                      AS user_service_count,
    (SELECT COUNT(*) FROM sys.conversation_endpoints
     WHERE state NOT IN ('CD', 'ER'))                                        AS active_conversations
FROM sys.databases d
WHERE d.database_id = DB_ID()
"""

VERSION_FEATURES = """
SELECT
    @@SERVERNAME                                                             AS server_name,
    CAST(SERVERPROPERTY('ProductVersion')     AS VARCHAR(50))               AS product_version,
    CAST(SERVERPROPERTY('ProductLevel')       AS VARCHAR(50))               AS product_level,
    CAST(SERVERPROPERTY('ProductUpdateLevel') AS VARCHAR(50))               AS product_update_level,
    CAST(SERVERPROPERTY('Edition')            AS VARCHAR(100))              AS edition,
    CAST(SERVERPROPERTY('EngineEdition')      AS VARCHAR(10))               AS engine_edition,
    CASE SERVERPROPERTY('IsClustered')        WHEN 1 THEN 'Yes' ELSE 'No' END AS is_clustered,
    CASE SERVERPROPERTY('IsHadrEnabled')      WHEN 1 THEN 'Yes' ELSE 'No' END AS hadr_enabled,
    CASE SERVERPROPERTY('IsFullTextInstalled') WHEN 1 THEN 'Yes' ELSE 'No' END AS fulltext_installed,
    (SELECT CAST(value_in_use AS VARCHAR(20)) FROM sys.configurations WHERE name = 'clr enabled')               AS clr_enabled,
    (SELECT CAST(value_in_use AS VARCHAR(20)) FROM sys.configurations WHERE name = 'xp_cmdshell')              AS xp_cmdshell_enabled,
    (SELECT CAST(value_in_use AS VARCHAR(20)) FROM sys.configurations WHERE name = 'Ole Automation Procedures') AS ole_automation_enabled,
    (SELECT CAST(value_in_use AS VARCHAR(20)) FROM sys.configurations WHERE name = 'Ad Hoc Distributed Queries') AS adhoc_distributed_queries
"""

# ─────────────────────── New: Schema / Design Checks ────────────────────────
# Minimum required access level: db_datareader

TRUSTWORTHY_DATABASES = """
SELECT
    name                              AS database_name,
    CASE is_trustworthy_on
        WHEN 1 THEN 'ON - RISK'
        ELSE       'OFF - Safe'
    END                               AS trustworthy_status,
    CASE is_db_chaining_on
        WHEN 1 THEN 'Enabled - RISK'
        ELSE       'Disabled - Safe'
    END                               AS cross_db_chaining,
    state_desc,
    recovery_model_desc
FROM sys.databases
WHERE database_id > 4
ORDER BY is_trustworthy_on DESC, name
"""

DEPRECATED_DATA_TYPES = """
SELECT
    s.name   AS schema_name,
    t.name   AS table_name,
    c.name   AS column_name,
    tp.name  AS data_type,
    CASE tp.name
        WHEN 'text'        THEN 'DEPRECATED — use varchar(MAX)'
        WHEN 'ntext'       THEN 'DEPRECATED — use nvarchar(MAX)'
        WHEN 'image'       THEN 'DEPRECATED — use varbinary(MAX)'
        WHEN 'timestamp'   THEN 'DEPRECATED — use rowversion'
        WHEN 'sql_variant' THEN 'AVOID — limited driver support'
        WHEN 'money'       THEN 'CAUTION — rounding errors; use decimal(19,4)'
        WHEN 'float'       THEN 'CAUTION — imprecise; use decimal for finance'
        WHEN 'real'        THEN 'CAUTION — imprecise; use decimal for finance'
    END      AS recommendation
FROM sys.columns c
JOIN sys.tables  t  ON t.object_id  = c.object_id
JOIN sys.schemas s  ON s.schema_id  = t.schema_id
JOIN sys.types   tp ON tp.user_type_id = c.user_type_id
WHERE tp.name IN ('text','ntext','image','timestamp','sql_variant','money','float','real')
  AND t.is_ms_shipped = 0
ORDER BY tp.name, s.name, t.name, c.name
"""

MISSING_PRIMARY_KEYS = """
SELECT
    s.name   AS schema_name,
    t.name   AS table_name,
    p.rows   AS row_count,
    'No primary key constraint defined' AS finding
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.is_ms_shipped = 0
  AND NOT EXISTS (
      SELECT 1 FROM sys.indexes i
      WHERE i.object_id = t.object_id AND i.is_primary_key = 1
  )
ORDER BY p.rows DESC, s.name, t.name
"""

HEAP_TABLES = """
SELECT
    s.name                                                            AS schema_name,
    t.name                                                            AS table_name,
    p.rows                                                            AS row_count,
    CAST(SUM(a.total_pages) * 8 / 1024.0 AS DECIMAL(18,2))          AS size_mb,
    'Heap: no clustered index — every query requires a full scan'     AS finding
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id = 0
JOIN sys.allocation_units a ON a.container_id = p.partition_id
WHERE t.is_ms_shipped = 0
GROUP BY s.name, t.name, p.rows
ORDER BY p.rows DESC, s.name, t.name
"""

UNTRUSTED_CONSTRAINTS = """
SELECT
    'FOREIGN KEY'         AS constraint_type,
    s.name                AS schema_name,
    OBJECT_NAME(fk.parent_object_id) AS table_name,
    fk.name               AS constraint_name,
    CASE fk.is_not_trusted WHEN 1 THEN 'Not Trusted' ELSE 'Trusted' END AS trust_status,
    CASE fk.is_disabled    WHEN 1 THEN 'Disabled'    ELSE 'Enabled'  END AS enabled_status,
    'Optimizer ignores untrusted FK — data integrity not enforced'   AS finding
FROM sys.foreign_keys fk
JOIN sys.schemas s ON s.schema_id = OBJECTPROPERTY(fk.parent_object_id, 'SchemaId')
WHERE fk.is_not_trusted = 1
UNION ALL
SELECT
    'CHECK CONSTRAINT',
    s.name,
    OBJECT_NAME(cc.parent_object_id),
    cc.name,
    CASE cc.is_not_trusted WHEN 1 THEN 'Not Trusted' ELSE 'Trusted' END,
    CASE cc.is_disabled    WHEN 1 THEN 'Disabled'    ELSE 'Enabled'  END,
    'Optimizer ignores untrusted CHECK constraint'
FROM sys.check_constraints cc
JOIN sys.schemas s ON s.schema_id = OBJECTPROPERTY(cc.parent_object_id, 'SchemaId')
WHERE cc.is_not_trusted = 1
ORDER BY constraint_type, table_name
"""

SP_NAMING_VIOLATIONS = """
SELECT
    s.name  AS schema_name,
    p.name  AS procedure_name,
    'sp_ prefix causes SQL Server to search master DB first — collision & perf risk' AS finding
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id = p.schema_id
WHERE p.name LIKE 'sp[_]%' AND s.name <> 'sys'
ORDER BY s.name, p.name
"""

DUPLICATE_INDEXES = """
SELECT
    s.name                                                AS schema_name,
    t.name                                                AS table_name,
    i1.name                                               AS index1_name,
    i2.name                                               AS index2_name,
    i1.type_desc                                          AS index_type,
    (
        SELECT STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal)
        FROM sys.index_columns ic
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE ic.object_id = i1.object_id AND ic.index_id = i1.index_id
          AND ic.is_included_column = 0
    )                                                     AS shared_key_columns,
    'Duplicate leading key columns — consider consolidating' AS finding
FROM sys.indexes i1
JOIN sys.indexes i2
    ON i2.object_id = i1.object_id AND i2.index_id > i1.index_id
JOIN sys.tables t ON t.object_id = i1.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE i1.type > 0 AND i2.type > 0
  AND i1.is_primary_key = 0 AND i2.is_primary_key = 0
  AND t.is_ms_shipped = 0
  AND (
      SELECT STRING_AGG(CAST(ic.column_id AS VARCHAR), ',') WITHIN GROUP (ORDER BY ic.key_ordinal)
      FROM sys.index_columns ic
      WHERE ic.object_id = i1.object_id AND ic.index_id = i1.index_id AND ic.is_included_column = 0
  ) = (
      SELECT STRING_AGG(CAST(ic.column_id AS VARCHAR), ',') WITHIN GROUP (ORDER BY ic.key_ordinal)
      FROM sys.index_columns ic
      WHERE ic.object_id = i2.object_id AND ic.index_id = i2.index_id AND ic.is_included_column = 0
  )
ORDER BY s.name, t.name
"""

DATABASE_OPTIONS_AUDIT = """
SELECT
    name                  AS database_name,
    recovery_model_desc,
    page_verify_option_desc,
    compatibility_level,
    collation_name,
    state_desc,
    CASE is_auto_close_on   WHEN 1 THEN 'RISK: AUTO_CLOSE ON'  ELSE 'OK' END  AS auto_close,
    CASE is_auto_shrink_on  WHEN 1 THEN 'RISK: AUTO_SHRINK ON' ELSE 'OK' END  AS auto_shrink,
    CASE page_verify_option_desc
         WHEN 'CHECKSUM' THEN 'OK'
         ELSE 'RISK: not CHECKSUM'
    END                   AS page_verify_status,
    CASE is_auto_update_stats_on WHEN 1 THEN 'Enabled' ELSE 'RISK: Disabled' END AS auto_update_stats,
    CASE is_auto_create_stats_on WHEN 1 THEN 'Enabled' ELSE 'RISK: Disabled' END AS auto_create_stats,
    CASE is_read_only WHEN 1 THEN 'Read-Only' ELSE 'Read-Write' END AS access_mode
FROM sys.databases
WHERE database_id = DB_ID()
"""

OBJECT_PERMISSIONS = """
SELECT
    dp.state_desc           AS permission_state,
    dp.permission_name,
    dp.class_desc           AS object_class,
    ISNULL(OBJECT_NAME(dp.major_id), DB_NAME())  AS object_name,
    ISNULL(SCHEMA_NAME(o.schema_id), '')          AS schema_name,
    grantee.name            AS grantee,
    grantee.type_desc       AS grantee_type
FROM sys.database_permissions dp
JOIN sys.database_principals grantee ON grantee.principal_id = dp.grantee_principal_id
LEFT JOIN sys.objects o ON o.object_id = dp.major_id
WHERE dp.class IN (0, 1)
  AND grantee.name NOT IN ('public','dbo','INFORMATION_SCHEMA','sys',
                            'db_owner','db_accessadmin','db_securityadmin',
                            'db_ddladmin','db_backupoperator','db_datareader',
                            'db_datawriter','db_denydatareader','db_denydatawriter')
  AND dp.permission_name NOT IN ('CONNECT')
ORDER BY dp.class_desc, ISNULL(OBJECT_NAME(dp.major_id), DB_NAME()), grantee.name
"""

# ─────────────────────── New: Performance Checks ────────────────────────────
# Minimum required access level: view_database_state

MISSING_INDEXES = """
SELECT TOP 50
    SCHEMA_NAME(t.schema_id)                                              AS schema_name,
    t.name                                                                AS table_name,
    ISNULL(mid.equality_columns,   '')                                    AS equality_columns,
    ISNULL(mid.inequality_columns, '')                                    AS inequality_columns,
    ISNULL(mid.included_columns,   '')                                    AS included_columns,
    CAST(
        migs.avg_total_user_cost * migs.avg_user_impact
        * (migs.user_seeks + migs.user_scans)
    AS DECIMAL(18,2))                                                     AS improvement_score,
    migs.user_seeks,
    migs.user_scans,
    CAST(migs.avg_user_impact AS DECIMAL(5,2))                            AS avg_impact_pct,
    CONVERT(VARCHAR, migs.last_user_seek, 120)                            AS last_user_seek
FROM sys.dm_db_missing_index_groups  mig
JOIN sys.dm_db_missing_index_group_stats migs
     ON migs.group_handle = mig.index_group_handle
JOIN sys.dm_db_missing_index_details   mid
     ON mid.index_handle   = mig.index_handle
JOIN sys.tables t ON t.object_id = mid.object_id
ORDER BY improvement_score DESC
"""

INDEX_USAGE_STATS = """
SELECT
    SCHEMA_NAME(t.schema_id)                    AS schema_name,
    t.name                                       AS table_name,
    i.name                                       AS index_name,
    i.type_desc,
    ISNULL(ius.user_seeks,   0)                  AS user_seeks,
    ISNULL(ius.user_scans,   0)                  AS user_scans,
    ISNULL(ius.user_lookups, 0)                  AS user_lookups,
    ISNULL(ius.user_updates, 0)                  AS user_updates,
    CONVERT(VARCHAR, ius.last_user_seek,   120)  AS last_user_seek,
    CONVERT(VARCHAR, ius.last_user_update, 120)  AS last_user_update,
    CASE
        WHEN ius.user_seeks IS NULL AND ius.user_scans IS NULL THEN 'Never Used'
        WHEN ISNULL(ius.user_seeks,0) + ISNULL(ius.user_scans,0) = 0 THEN 'Unused (writes only)'
        WHEN ISNULL(ius.user_updates,0) > (ISNULL(ius.user_seeks,0)+ISNULL(ius.user_scans,0)) * 10
             THEN 'Write-heavy (consider dropping)'
        ELSE 'Active'
    END                                          AS index_status
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
LEFT JOIN sys.dm_db_index_usage_stats ius
    ON ius.object_id = i.object_id
   AND ius.index_id  = i.index_id
   AND ius.database_id = DB_ID()
WHERE i.type > 0
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0
  AND t.is_ms_shipped = 0
ORDER BY user_updates DESC, index_status, schema_name, table_name
"""

FRAGMENTATION_REPORT = """
SELECT TOP 100
    SCHEMA_NAME(t.schema_id)                      AS schema_name,
    t.name                                         AS table_name,
    i.name                                         AS index_name,
    i.type_desc,
    CAST(ips.avg_fragmentation_in_percent AS DECIMAL(5,2)) AS fragmentation_pct,
    ips.page_count,
    CASE
        WHEN ips.avg_fragmentation_in_percent > 30 THEN 'REBUILD recommended'
        WHEN ips.avg_fragmentation_in_percent > 10 THEN 'REORGANIZE recommended'
        ELSE 'OK'
    END                                            AS recommendation
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
JOIN sys.indexes i ON i.object_id = ips.object_id AND i.index_id = ips.index_id
JOIN sys.tables  t ON t.object_id = i.object_id
WHERE ips.page_count > 100
  AND i.type > 0
  AND t.is_ms_shipped = 0
ORDER BY ips.avg_fragmentation_in_percent DESC
"""

STATISTICS_HEALTH = """
SELECT TOP 100
    SCHEMA_NAME(t.schema_id)                               AS schema_name,
    t.name                                                  AS table_name,
    s.name                                                  AS stat_name,
    CONVERT(VARCHAR, sp.last_updated, 120)                  AS last_updated,
    sp.rows,
    sp.rows_sampled,
    CAST(100.0 * sp.rows_sampled / NULLIF(sp.rows,0) AS DECIMAL(5,2)) AS sample_pct,
    sp.modification_counter,
    CASE
        WHEN sp.modification_counter > sp.rows * 0.20 THEN 'STALE — update needed'
        WHEN sp.last_updated < DATEADD(DAY,-30,GETDATE()) THEN 'OLD — review'
        ELSE 'OK'
    END                                                     AS status
FROM sys.stats s
JOIN sys.tables t ON t.object_id = s.object_id
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE t.is_ms_shipped = 0
ORDER BY sp.modification_counter DESC
"""

# ─────────────────────── New: Reliability / Config Checks ───────────────────
# Minimum required access level: sysadmin

BACKUP_HISTORY = """
SELECT
    bs.database_name,
    MAX(CASE WHEN bs.type = 'D' THEN CONVERT(VARCHAR, bs.backup_finish_date, 120) END) AS last_full_backup,
    MAX(CASE WHEN bs.type = 'I' THEN CONVERT(VARCHAR, bs.backup_finish_date, 120) END) AS last_diff_backup,
    MAX(CASE WHEN bs.type = 'L' THEN CONVERT(VARCHAR, bs.backup_finish_date, 120) END) AS last_log_backup,
    DATEDIFF(HOUR,
        MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END),
        GETDATE())                                AS hours_since_full_backup,
    CASE d.recovery_model_desc
        WHEN 'FULL' THEN DATEDIFF(HOUR,
            MAX(CASE WHEN bs.type = 'L' THEN bs.backup_finish_date END),
            GETDATE())
        ELSE NULL
    END                                           AS hours_since_log_backup,
    d.recovery_model_desc,
    CASE
        WHEN MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END) IS NULL
             THEN 'CRITICAL: No full backup found'
        WHEN DATEDIFF(HOUR, MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END), GETDATE()) > 168
             THEN 'WARNING: Full backup older than 7 days'
        ELSE 'OK'
    END                                           AS backup_status
FROM msdb.dbo.backupset bs
JOIN sys.databases d ON d.name = bs.database_name
WHERE bs.database_name = DB_NAME()
GROUP BY bs.database_name, d.recovery_model_desc
"""

SERVER_CONFIGURATIONS = """
SELECT
    name              AS config_name,
    CAST(value         AS BIGINT)        AS configured_value,
    CAST(value_in_use  AS BIGINT)        AS running_value,
    CAST(minimum AS BIGINT) AS min_value,
    CAST(maximum AS BIGINT) AS max_value,
    description,
    CASE
        WHEN name = 'max server memory (MB)'
             AND CAST(value_in_use AS BIGINT) = 2147483647  THEN 'WARNING: not capped — may starve OS'
        WHEN name = 'cost threshold for parallelism'
             AND CAST(value_in_use AS INT) < 25             THEN 'WARNING: default 5 is too low; set 25-50'
        WHEN name = 'optimize for ad hoc workloads'
             AND CAST(value_in_use AS INT) = 0              THEN 'RECOMMEND: enable to reduce plan cache bloat'
        WHEN name = 'max degree of parallelism'
             AND CAST(value_in_use AS INT) = 0              THEN 'RECOMMEND: cap MAXDOP per CPU/NUMA topology'
        WHEN name = 'xp_cmdshell'
             AND CAST(value_in_use AS INT) = 1              THEN 'SECURITY RISK: xp_cmdshell enabled'
        WHEN name = 'Ole Automation Procedures'
             AND CAST(value_in_use AS INT) = 1              THEN 'SECURITY RISK: OLE Automation enabled'
        WHEN name = 'Ad Hoc Distributed Queries'
             AND CAST(value_in_use AS INT) = 1              THEN 'RISK: Ad Hoc Distributed Queries enabled'
        ELSE 'OK'
    END               AS recommendation
FROM sys.configurations
WHERE name IN (
    'max server memory (MB)', 'min server memory (MB)',
    'max degree of parallelism', 'cost threshold for parallelism',
    'optimize for ad hoc workloads', 'remote admin connections',
    'clr enabled', 'xp_cmdshell', 'Ole Automation Procedures',
    'Ad Hoc Distributed Queries', 'Database Mail XPs',
    'backup compression default', 'lightweight pooling',
    'priority boost', 'fill factor (%)',
    'blocked process threshold (s)', 'max worker threads'
)
ORDER BY name
"""

WEAK_SQL_LOGINS = """
SELECT
    l.name                                                AS login_name,
    l.type_desc,
    CASE l.is_disabled WHEN 1 THEN 'Disabled' ELSE 'Enabled' END AS login_status,
    CASE l.is_policy_checked    WHEN 1 THEN 'Yes' ELSE 'NO — RISK' END AS password_policy,
    CASE l.is_expiration_checked WHEN 1 THEN 'Yes' ELSE 'NO — RISK' END AS expiration_policy,
    CONVERT(VARCHAR, LOGINPROPERTY(l.name, 'PasswordLastSetTime'), 120) AS password_last_set,
    CAST(LOGINPROPERTY(l.name, 'BadPasswordCount') AS INT)              AS bad_password_count,
    CAST(LOGINPROPERTY(l.name, 'DaysUntilExpiration') AS INT)           AS days_until_expiration,
    CASE
        WHEN l.is_policy_checked = 0       THEN 'RISK: Password policy not enforced'
        WHEN l.is_expiration_checked = 0   THEN 'RISK: Password expiry not enforced'
        WHEN LOGINPROPERTY(l.name, 'PasswordLastSetTime') IS NULL THEN 'RISK: Password never set'
        ELSE 'OK'
    END                                                   AS assessment
FROM sys.sql_logins l
WHERE l.type = 'S'
ORDER BY l.is_policy_checked, l.name
"""

SERVER_PERMISSIONS = """
SELECT
    r.name    AS server_role,
    m.name    AS member_name,
    m.type_desc,
    CASE m.is_disabled WHEN 1 THEN 'Disabled' ELSE 'Enabled' END AS login_status,
    CONVERT(VARCHAR, m.create_date, 120) AS member_since
FROM sys.server_role_members rm
JOIN sys.server_principals r ON r.principal_id = rm.role_principal_id
JOIN sys.server_principals m ON m.principal_id = rm.member_principal_id
WHERE r.name IN (
    'sysadmin','securityadmin','serveradmin',
    'setupadmin','processadmin','diskadmin','bulkadmin'
)
ORDER BY r.name, m.name
"""

DEPRECATED_FEATURES_IN_USE = """
SELECT
    instance_name   AS deprecated_feature,
    cntr_value      AS usage_count_since_restart
FROM sys.dm_os_performance_counters
WHERE object_name LIKE '%Deprecated Features%'
  AND cntr_value > 0
ORDER BY cntr_value DESC
"""

# ═══════════════════════════════════════════════════════════════════════════════
# SQL SERVER ENGINE — EXTENDED ASSESSMENT QUERIES
# Added based on real-world assessment findings (SSIS, SSAS, scheduling, etc.)
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────── SSIS Package Assessment ────────────────────────────

SSIS_CATALOG_PACKAGES = """
SELECT
    f.name                                                  AS folder_name,
    p.name                                                  AS project_name,
    pk.name                                                 AS package_name,
    ISNULL(pk.description, '')                              AS description,
    CONVERT(VARCHAR, pk.last_deployed_time, 120)            AS last_deployed,
    CASE pk.entry_type
        WHEN 1 THEN 'Assembly'
        WHEN 2 THEN 'File (dtsx)'
        ELSE 'Unknown'
    END                                                     AS entry_type,
    pk.package_format_version
FROM SSISDB.catalog.packages  pk
JOIN SSISDB.catalog.projects   p  ON p.project_id  = pk.project_id
JOIN SSISDB.catalog.folders    f  ON f.folder_id   = p.folder_id
ORDER BY f.name, p.name, pk.name
"""

SSIS_EXECUTION_HISTORY = """
SELECT TOP 200
    e.folder_name,
    e.project_name,
    e.package_name,
    CASE e.status
        WHEN 1 THEN 'Created'
        WHEN 2 THEN 'Running'
        WHEN 3 THEN 'Cancelled'
        WHEN 4 THEN 'Failed'
        WHEN 5 THEN 'Pending'
        WHEN 6 THEN 'Ended Unexpectedly'
        WHEN 7 THEN 'Succeeded'
        WHEN 8 THEN 'Stopping'
        WHEN 9 THEN 'Completed'
        ELSE 'Unknown'
    END                                                     AS status,
    CONVERT(VARCHAR, e.start_time, 120)                     AS start_time,
    CONVERT(VARCHAR, e.end_time,   120)                     AS end_time,
    DATEDIFF(SECOND, e.start_time, ISNULL(e.end_time, GETDATE())) AS duration_sec,
    e.executed_as_name
FROM SSISDB.catalog.executions e
WHERE e.start_time >= DATEADD(DAY, -30, GETDATE())
ORDER BY e.start_time DESC
"""

SSIS_MSDB_PACKAGES = """
SELECT
    ISNULL(sf.foldername, '(root)')                         AS folder_name,
    sp.name                                                 AS package_name,
    CONVERT(VARCHAR, sp.createdate, 120)                    AS create_date,
    CASE sp.packagetype
        WHEN 0 THEN 'SSIS Package (default)'
        WHEN 1 THEN 'Configuration Wizard'
        WHEN 2 THEN 'DTSDesigner80'
        WHEN 3 THEN 'DTSPackageV100'
        WHEN 5 THEN 'SSIS Designer'
        WHEN 6 THEN 'Replication'
        ELSE CAST(sp.packagetype AS VARCHAR)
    END                                                     AS package_type,
    sp.vermajor,
    sp.verminor
FROM msdb.dbo.sysssispackages        sp
LEFT JOIN msdb.dbo.sysssispackagefolders sf ON sf.folderid = sp.folderid
ORDER BY sf.foldername, sp.name
"""

# ─────────────────────── SQL Agent — Schedules & Steps ──────────────────────

SQL_AGENT_JOB_SCHEDULES = """
SELECT
    j.name                                                  AS job_name,
    CASE j.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS job_status,
    s.name                                                  AS schedule_name,
    CASE s.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS schedule_status,
    CASE s.freq_type
        WHEN 1   THEN 'Once'
        WHEN 4   THEN 'Daily'
        WHEN 8   THEN 'Weekly'
        WHEN 16  THEN 'Monthly (Day)'
        WHEN 32  THEN 'Monthly (Relative)'
        WHEN 64  THEN 'Agent Start'
        WHEN 128 THEN 'CPU Idle'
        ELSE 'Unknown'
    END                                                     AS frequency_type,
    s.freq_interval,
    CASE s.freq_subday_type
        WHEN 1 THEN 'Once at start time'
        WHEN 2 THEN 'Every ' + CAST(s.freq_subday_interval AS VARCHAR) + ' second(s)'
        WHEN 4 THEN 'Every ' + CAST(s.freq_subday_interval AS VARCHAR) + ' minute(s)'
        WHEN 8 THEN 'Every ' + CAST(s.freq_subday_interval AS VARCHAR) + ' hour(s)'
        ELSE 'Once'
    END                                                     AS intraday_frequency,
    RIGHT('000000' + CAST(s.active_start_time AS VARCHAR), 6) AS active_start_time,
    RIGHT('000000' + CAST(s.active_end_time   AS VARCHAR), 6) AS active_end_time,
    CAST(js.next_run_date AS VARCHAR)                       AS next_run_date
FROM msdb.dbo.sysjobs          j
JOIN msdb.dbo.sysjobschedules  js ON js.job_id      = j.job_id
JOIN msdb.dbo.sysschedules     s  ON s.schedule_id  = js.schedule_id
ORDER BY j.name, s.name
"""

SQL_AGENT_JOB_STEPS = """
SELECT
    j.name                                                  AS job_name,
    CASE j.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS job_status,
    js.step_id,
    js.step_name,
    CASE js.subsystem
        WHEN 'TSQL'            THEN 'T-SQL Script'
        WHEN 'SSIS'            THEN 'SSIS Package'
        WHEN 'CmdExec'         THEN 'OS Command'
        WHEN 'PowerShell'      THEN 'PowerShell'
        WHEN 'ANALYSISQUERY'   THEN 'SSAS MDX Query'
        WHEN 'ANALYSISCOMMAND' THEN 'SSAS Command (Process Cube)'
        WHEN 'ActiveScripting' THEN 'ActiveX Script'
        WHEN 'Distribution'    THEN 'Replication Distributor'
        WHEN 'LogReader'       THEN 'Replication Log Reader'
        WHEN 'Snapshot'        THEN 'Replication Snapshot'
        ELSE js.subsystem
    END                                                     AS step_type,
    ISNULL(js.database_name, '')                            AS database_name,
    js.retry_attempts,
    js.retry_interval                                       AS retry_interval_min,
    CASE js.on_success_action
        WHEN 1 THEN 'Quit — success'
        WHEN 2 THEN 'Quit — failure'
        WHEN 3 THEN 'Go to next step'
        WHEN 4 THEN 'Go to step ' + CAST(js.on_success_step_id AS VARCHAR)
        ELSE 'Unknown'
    END                                                     AS on_success,
    CASE js.on_fail_action
        WHEN 1 THEN 'Quit — success'
        WHEN 2 THEN 'Quit — failure'
        WHEN 3 THEN 'Go to next step'
        WHEN 4 THEN 'Go to step ' + CAST(js.on_fail_step_id AS VARCHAR)
        ELSE 'Unknown'
    END                                                     AS on_fail
FROM msdb.dbo.sysjobs      j
JOIN msdb.dbo.sysjobsteps  js ON js.job_id = j.job_id
ORDER BY j.name, js.step_id
"""

# ─────────────────────── Database Files & Growth ────────────────────────────

DATABASE_FILES = """
SELECT
    name                                                    AS file_name,
    physical_name,
    type_desc                                               AS file_type,
    CAST(size * 8.0 / 1024         AS DECIMAL(18,2))       AS size_mb,
    CASE max_size
        WHEN -1 THEN 'Unlimited'
        WHEN  0 THEN 'Fixed (no max)'
        ELSE CAST(CAST(max_size * 8.0 / 1024 AS BIGINT) AS VARCHAR) + ' MB'
    END                                                     AS max_size,
    CASE
        WHEN is_percent_growth = 1
            THEN CAST(growth AS VARCHAR) + '% (proportional)'
        WHEN growth = 0
            THEN '0 — RISK: auto-growth disabled'
        ELSE CAST(CAST(growth * 8.0 / 1024 AS DECIMAL(18,2)) AS VARCHAR) + ' MB'
    END                                                     AS auto_growth,
    state_desc                                              AS file_state,
    CASE
        WHEN growth = 0
            THEN 'RISK: Auto-growth disabled — manual intervention required'
        WHEN is_percent_growth = 1 AND growth >= 10
            THEN 'CAUTION: Large % growth events — set fixed MB instead'
        WHEN max_size = -1
            THEN 'OK — unlimited max, monitor disk space'
        ELSE 'OK'
    END                                                     AS recommendation
FROM sys.database_files
ORDER BY type_desc, name
"""

# ─────────────────────── Object Complexity Analysis ─────────────────────────

SP_COMPLEXITY = """
SELECT
    s.name                                                  AS schema_name,
    p.name                                                  AS procedure_name,
    CONVERT(VARCHAR, p.create_date, 120)                    AS create_date,
    CONVERT(VARCHAR, p.modify_date, 120)                    AS modify_date,
    (SELECT COUNT(*) FROM sys.parameters pm
     WHERE pm.object_id = p.object_id)                      AS param_count,
    LEN(m.definition)                                       AS char_length,
    LEN(m.definition) - LEN(REPLACE(m.definition, CHAR(10), '')) AS line_count,
    CASE WHEN m.definition LIKE '%CURSOR%'
         THEN 'Yes' ELSE 'No' END                           AS uses_cursor,
    CASE WHEN m.definition LIKE '%CREATE TABLE #%'
          OR m.definition LIKE '%SELECT%INTO #%'
         THEN 'Yes' ELSE 'No' END                           AS uses_temp_table,
    CASE WHEN m.definition LIKE '%sp_executesql%'
          OR m.definition LIKE '%EXEC (%'
          OR m.definition LIKE '%EXECUTE (%'
         THEN 'Yes' ELSE 'No' END                           AS uses_dynamic_sql,
    CASE WHEN m.definition LIKE '%BEGIN TRY%'
         THEN 'Yes' ELSE 'No' END                           AS has_error_handling,
    CASE WHEN UPPER(m.definition) LIKE '%TRANSACTION%'
         THEN 'Yes' ELSE 'No' END                           AS uses_transactions,
    CASE
        WHEN LEN(m.definition) > 10000 THEN 'HIGH — refactor candidate'
        WHEN LEN(m.definition) >  3000 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                     AS complexity_level
FROM sys.procedures  p
JOIN sys.schemas     s ON s.schema_id  = p.schema_id
JOIN sys.sql_modules m ON m.object_id  = p.object_id
ORDER BY LEN(m.definition) DESC
"""

VIEW_COMPLEXITY = """
SELECT
    s.name                                                  AS schema_name,
    v.name                                                  AS view_name,
    CONVERT(VARCHAR, v.create_date, 120)                    AS create_date,
    CONVERT(VARCHAR, v.modify_date, 120)                    AS modify_date,
    LEN(m.definition)                                       AS char_length,
    LEN(m.definition) - LEN(REPLACE(m.definition, CHAR(10), '')) AS line_count,
    (LEN(UPPER(m.definition)) - LEN(REPLACE(UPPER(m.definition), 'JOIN', ''))) / 4
                                                            AS join_count,
    (LEN(UPPER(m.definition)) - LEN(REPLACE(UPPER(m.definition), 'SELECT', '')) - 6) / 6
                                                            AS subquery_count,
    CASE WHEN UPPER(m.definition) LIKE '%UNION%'
         THEN 'Yes' ELSE 'No' END                           AS has_union,
    CASE WHEN UPPER(m.definition) LIKE '%WITH%AS%SELECT%'
         THEN 'Yes' ELSE 'No' END                           AS has_cte,
    CASE
        WHEN LEN(m.definition) > 5000 THEN 'HIGH — consider materializing'
        WHEN LEN(m.definition) > 1500 THEN 'MEDIUM'
        ELSE 'LOW'
    END                                                     AS complexity_level
FROM sys.views     v
JOIN sys.schemas   s ON s.schema_id = v.schema_id
JOIN sys.sql_modules m ON m.object_id = v.object_id
ORDER BY LEN(m.definition) DESC
"""

# ─────────────────────── Schema / ETL Pattern Classification ────────────────

SCHEMA_CLASSIFICATION = """
SELECT
    s.name                                                  AS schema_name,
    COUNT(DISTINCT t.object_id)                             AS table_count,
    COUNT(DISTINCT v.object_id)                             AS view_count,
    COUNT(DISTINCT p.object_id)                             AS proc_count,
    CASE
        WHEN s.name IN ('stg','staging','stgsf','stg_sf','raw','bronze','landing')
            THEN 'Staging / Landing'
        WHEN s.name IN ('etl','ctrl','control','pipeline','meta','metadata')
            THEN 'ETL Control'
        WHEN s.name IN ('lkp','lookup','ref','reference','dim','config')
            THEN 'Lookup / Reference'
        WHEN s.name IN ('dbo','reporting','rpt','fact','mart','gold','silver')
            THEN 'Business / Reporting'
        WHEN s.name IN ('error','err','log','audit','trace','errlog')
            THEN 'Error / Audit'
        WHEN s.name IN ('bi','dwh','dw','warehouse','ods','datamart')
            THEN 'Data Warehouse'
        ELSE 'Other — review'
    END                                                     AS schema_classification,
    CASE
        WHEN s.name IN ('stg','staging','stgsf','stg_sf','raw','bronze','landing')
            THEN 'Transient staging — migrate pipelines to Fabric Bronze/Silver'
        WHEN s.name IN ('etl','ctrl','control','pipeline','meta','metadata')
            THEN 'ETL orchestration — replace with Fabric Data Pipelines'
        WHEN s.name IN ('lkp','lookup','ref','reference','dim','config')
            THEN 'Reference data — move to Fabric Gold layer'
        WHEN s.name IN ('dbo','reporting','rpt','fact','mart','gold','silver')
            THEN 'Core business logic — migrate to Fabric Gold Warehouse'
        WHEN s.name IN ('error','err','log','audit','trace','errlog')
            THEN 'Operational logs — replace with Fabric Monitor Hub'
        WHEN s.name IN ('bi','dwh','dw','warehouse','ods','datamart')
            THEN 'Data warehouse layer — migrate to Fabric Lakehouse'
        ELSE 'Review and classify before migration planning'
    END                                                     AS migration_recommendation
FROM sys.schemas s
LEFT JOIN sys.tables     t ON t.schema_id = s.schema_id AND t.is_ms_shipped = 0
LEFT JOIN sys.views      v ON v.schema_id = s.schema_id
LEFT JOIN sys.procedures p ON p.schema_id = s.schema_id
WHERE s.name NOT IN (
    'sys','INFORMATION_SCHEMA','guest','db_owner','db_accessadmin',
    'db_securityadmin','db_ddladmin','db_backupoperator',
    'db_datareader','db_datawriter','db_denydatareader','db_denydatawriter'
)
GROUP BY s.name
ORDER BY schema_classification, s.name
"""

# ─────────────────────── SSAS Detection via Linked Servers ──────────────────

SSAS_LINKED_SERVERS = """
SELECT
    s.name                                                  AS linked_server_name,
    ISNULL(s.product,     '')                               AS product,
    ISNULL(s.provider,    '')                               AS provider,
    ISNULL(s.data_source, '')                               AS data_source,
    CASE s.is_remote_login_enabled WHEN 1 THEN 'Yes' ELSE 'No' END
                                                            AS remote_login_enabled,
    CONVERT(VARCHAR, s.modify_date, 120)                    AS modify_date,
    'SSAS / OLAP linked server — cube processing or MDX queries routed here' AS finding
FROM sys.servers s
WHERE s.is_linked = 1
  AND (
      s.provider LIKE '%MSOLAP%'
      OR s.product LIKE '%Analysis Services%'
      OR s.product LIKE '%SSAS%'
  )
ORDER BY s.name
"""

# ─────────────────────── Performance — Wait Statistics ──────────────────────

WAIT_STATISTICS = """
SELECT TOP 25
    wait_type,
    CAST(wait_time_ms / 1000.0     AS DECIMAL(18,2))        AS total_wait_sec,
    CAST(max_wait_time_ms / 1000.0 AS DECIMAL(18,2))        AS max_wait_sec,
    waiting_tasks_count,
    CAST(
        100.0 * wait_time_ms / NULLIF(SUM(wait_time_ms) OVER(), 0)
    AS DECIMAL(5,2))                                         AS pct_total_wait,
    CASE
        WHEN wait_type LIKE 'LCK_%'
            THEN 'Locking — blocking / deadlock pressure'
        WHEN wait_type IN ('PAGEIOLATCH_SH','PAGEIOLATCH_EX','PAGEIOLATCH_UP')
            THEN 'I/O — disk read bottleneck'
        WHEN wait_type = 'RESOURCE_SEMAPHORE'
            THEN 'Memory — query memory grant queuing'
        WHEN wait_type IN ('CXPACKET','CXCONSUMER')
            THEN 'Parallelism — skewed parallel plans (tune MAXDOP)'
        WHEN wait_type = 'SOS_SCHEDULER_YIELD'
            THEN 'CPU — high CPU pressure'
        WHEN wait_type IN ('ASYNC_IO_COMPLETION','IO_COMPLETION')
            THEN 'I/O — async I/O backlog'
        WHEN wait_type = 'WRITELOG'
            THEN 'Log — transaction log write latency (VLF or slow disk)'
        WHEN wait_type = 'NETWORK_IO'
            THEN 'Network — client consuming results slowly'
        WHEN wait_type = 'OLEDB'
            THEN 'Linked Server / SSAS OLEDB calls — review linked server usage'
        ELSE 'Other — review'
    END                                                      AS interpretation
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN (
    'SLEEP_TASK','WAIT_XTP_OFFLINE_CKPT_NEW_LOG','DISPATCHER_QUEUE_SEMAPHORE',
    'CLR_AUTO_EVENT','CLR_MANUAL_EVENT','DBMIRROR_EVENTS_QUEUE',
    'SQLTRACE_BUFFER_FLUSH','SLEEP_DBSTARTUP','SLEEP_DCOMSTARTUP',
    'SLEEP_MASTERDBREADY','SLEEP_MASTERMDREADY','SLEEP_MASTERUPGRADED',
    'SLEEP_MSDBSTARTUP','SLEEP_SYSTEMTASK','SLEEP_TEMPDBSTARTUP',
    'SNI_HTTP_ACCEPT','SP_SERVER_DIAGNOSTICS_SLEEP','WAITFOR',
    'XE_DISPATCHER_WAIT','XE_TIMER_EVENT','BROKER_TO_FLUSH',
    'HADR_WORK_QUEUE','ONDEMAND_TASK_MANAGER','REQUEST_FOR_DEADLOCK_SEARCH',
    'RESOURCE_QUEUE','SERVER_IDLE_CHECK','BROKER_EVENTHANDLER',
    'CHECKPOINT_QUEUE','SQLTRACE_INCREMENTAL_FLUSH_SLEEP'
)
  AND wait_time_ms > 0
ORDER BY wait_time_ms DESC
"""

# ─────────────────────── Performance — Query Store Top Queries ───────────────

QUERY_STORE_TOP_QUERIES = """
SELECT TOP 25
    qsq.query_id,
    SUBSTRING(qt.query_sql_text, 1, 500)                    AS query_text,
    CAST(AVG(qrs.avg_duration)        / 1000.0 AS DECIMAL(18,2)) AS avg_duration_ms,
    CAST(MAX(qrs.max_duration)        / 1000.0 AS DECIMAL(18,2)) AS max_duration_ms,
    CAST(AVG(qrs.avg_cpu_time)        / 1000.0 AS DECIMAL(18,2)) AS avg_cpu_ms,
    CAST(AVG(qrs.avg_logical_io_reads) AS BIGINT)           AS avg_logical_reads,
    SUM(qrs.count_executions)                               AS total_executions,
    CONVERT(VARCHAR, MAX(qrs.last_execution_time), 120)     AS last_executed,
    CASE
        WHEN AVG(qrs.avg_duration) > 5000000 THEN 'CRITICAL: avg > 5 sec'
        WHEN AVG(qrs.avg_duration) > 1000000 THEN 'WARNING: avg > 1 sec'
        ELSE 'OK'
    END                                                     AS performance_flag
FROM sys.query_store_query          qsq
JOIN sys.query_store_query_text     qt  ON qt.query_text_id = qsq.query_text_id
JOIN sys.query_store_plan           qsp ON qsp.query_id     = qsq.query_id
JOIN sys.query_store_runtime_stats  qrs ON qrs.plan_id      = qsp.plan_id
WHERE qrs.last_execution_time >= DATEADD(DAY, -7, GETDATE())
  AND qt.query_sql_text NOT LIKE '%sys.%'
GROUP BY qsq.query_id, qt.query_sql_text
ORDER BY AVG(qrs.avg_duration) DESC
"""
