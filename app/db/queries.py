"""
All SQL Server metadata queries as module-level constants.
These are read-only, parameterless queries against system catalog views.
"""

OVERVIEW = """
SELECT
    DB_NAME()                                                          AS database_name,
    SUSER_SNAME()                                                      AS connected_user,
    @@VERSION                                                          AS sql_version,
    (SELECT COUNT(*) FROM sys.schemas WHERE principal_id = 1)         AS schema_count,
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
WHERE s.principal_id = 1
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
    COUNT(ao.object_id)                   AS clr_object_count
FROM sys.assemblies a
LEFT JOIN sys.assembly_objects ao ON ao.assembly_id = a.assembly_id
WHERE a.is_user_defined = 1
GROUP BY a.name, a.permission_set_desc, a.create_date, a.modify_date, a.is_visible
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
    j.name                                AS job_name,
    CASE j.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS status,
    ISNULL(j.description, '')             AS description,
    CONVERT(VARCHAR, j.date_created, 120) AS date_created,
    CONVERT(VARCHAR, j.date_modified, 120) AS date_modified,
    (SELECT COUNT(*)
     FROM msdb.dbo.sysjobhistory h
     WHERE h.job_id = j.job_id AND h.step_id = 0 AND h.run_status = 0) AS failure_count,
    ISNULL(
        (SELECT TOP 1
             CASE h.run_status
                 WHEN 0 THEN 'Failed'
                 WHEN 1 THEN 'Succeeded'
                 WHEN 2 THEN 'Retry'
                 WHEN 3 THEN 'Cancelled'
                 ELSE 'Unknown'
             END
         FROM msdb.dbo.sysjobhistory h
         WHERE h.job_id = j.job_id AND h.step_id = 0
         ORDER BY h.run_date DESC, h.run_time DESC),
    'Never Run') AS last_run_status
FROM msdb.dbo.sysjobs j
ORDER BY j.name
"""

LINKED_SERVERS = """
SELECT
    s.name                                                                   AS linked_server_name,
    ISNULL(s.product, '')                                                    AS product,
    ISNULL(s.provider, '')                                                   AS provider,
    ISNULL(s.data_source, '')                                                AS data_source,
    CASE s.is_remote_login_enabled WHEN 1 THEN 'Yes' ELSE 'No' END          AS remote_login_enabled,
    CASE s.is_data_access_enabled  WHEN 1 THEN 'Yes' ELSE 'No' END          AS data_access_enabled,
    CASE s.is_rpc_out_enabled      WHEN 1 THEN 'Yes' ELSE 'No' END          AS rpc_out_enabled,
    CONVERT(VARCHAR, s.modify_date, 120)                                     AS modify_date
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
    (SELECT COUNT(*) FROM sys.service_queues WHERE is_ms_shipped = 0)       AS user_queue_count,
    (SELECT COUNT(*) FROM sys.services      WHERE is_ms_shipped = 0)        AS user_service_count,
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
    (SELECT value_in_use FROM sys.configurations WHERE name = 'clr enabled')              AS clr_enabled,
    (SELECT value_in_use FROM sys.configurations WHERE name = 'xp_cmdshell')             AS xp_cmdshell_enabled,
    (SELECT value_in_use FROM sys.configurations WHERE name = 'Ole Automation Procedures') AS ole_automation_enabled,
    (SELECT value_in_use FROM sys.configurations WHERE name = 'Ad Hoc Distributed Queries') AS adhoc_distributed_queries
"""
