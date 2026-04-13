#!/usr/bin/env python3
"""
SAT Gateway Agent — Source Assessment Tool
==========================================
Runs on any Windows machine inside the client's network.
Polls the SAT server for pending jobs, connects to the client's SQL Server locally,
runs the full assessment, and posts results back to the cloud.

Usage:
    Set environment variables, then run:
        python agent.py

Environment variables:
    SAT_SERVER_URL  - URL of your SAT Azure Web App (e.g. https://sat-app.azurewebsites.net)
    GATEWAY_KEY     - The gateway key from the SAT portal
    POLL_INTERVAL   - Seconds between polls (default: 5)
"""

import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime, date
from decimal import Decimal
from typing import Any

# ── Dependency check ──────────────────────────────────────────────────────────
try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found. Run: pip install requests")
    sys.exit(1)

try:
    import pymssql
except ImportError:
    print("ERROR: 'pymssql' library not found. Run: pip install pymssql")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
# Service Bus mode (recommended — works through VPNs)
SERVICE_BUS_CONNECTION_STRING = os.environ.get("SERVICE_BUS_CONNECTION_STRING", "")
SERVICE_BUS_JOBS_QUEUE = os.environ.get("SERVICE_BUS_JOBS_QUEUE", "sat-jobs")
SERVICE_BUS_RESULTS_QUEUE = os.environ.get("SERVICE_BUS_RESULTS_QUEUE", "sat-results")

# Legacy HTTP polling mode (fallback if Service Bus not configured)
SAT_SERVER_URL = os.environ.get("SAT_SERVER_URL", "").rstrip("/")
GATEWAY_KEY = os.environ.get("GATEWAY_KEY", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))

# ── Embedded SQL Queries ───────────────────────────────────────────────────────

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
SELECT s.name AS schema_name, COUNT(DISTINCT t.object_id) AS table_count,
       COUNT(DISTINCT v.object_id) AS view_count, COUNT(DISTINCT p.object_id) AS proc_count
FROM sys.schemas s
LEFT JOIN sys.tables     t ON t.schema_id = s.schema_id
LEFT JOIN sys.views      v ON v.schema_id = s.schema_id
LEFT JOIN sys.procedures p ON p.schema_id = s.schema_id
WHERE s.principal_id = 1
GROUP BY s.name ORDER BY s.name
"""

TABLES = """
SELECT s.name AS schema_name, t.name AS table_name, COUNT(c.column_id) AS column_count,
       CAST(p.rows AS BIGINT) AS row_count,
       CAST(SUM(a.total_pages) * 8 / 1024.0 AS DECIMAL(18,2)) AS size_mb,
       t.create_date, t.modify_date
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = t.object_id AND i.index_id IN (0,1)
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id = i.index_id
JOIN sys.allocation_units a ON a.container_id = p.partition_id
JOIN sys.columns c ON c.object_id = t.object_id
GROUP BY s.name, t.name, p.rows, t.create_date, t.modify_date
ORDER BY s.name, t.name
"""

COLUMNS = """
SELECT s.name AS schema_name, t.name AS table_name, c.column_id, c.name AS column_name,
       tp.name AS data_type, c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
       CASE WHEN pk.column_id IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary_key,
       CASE WHEN fk.parent_column_id IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_foreign_key,
       dc.definition AS default_value
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.types tp ON tp.user_type_id = c.user_type_id
LEFT JOIN (SELECT ic.object_id, ic.column_id FROM sys.index_columns ic
           JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
           WHERE i.is_primary_key = 1) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
LEFT JOIN (SELECT DISTINCT fkc.parent_object_id, fkc.parent_column_id FROM sys.foreign_key_columns fkc)
           fk ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
ORDER BY s.name, t.name, c.column_id
"""

VIEWS = """
SELECT s.name AS schema_name, v.name AS view_name, v.create_date, v.modify_date,
       OBJECT_DEFINITION(v.object_id) AS definition
FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
ORDER BY s.name, v.name
"""

STORED_PROCEDURES = """
SELECT s.name AS schema_name, p.name AS procedure_name, p.create_date, p.modify_date,
       (SELECT COUNT(*) FROM sys.parameters pm WHERE pm.object_id = p.object_id) AS param_count
FROM sys.procedures p JOIN sys.schemas s ON s.schema_id = p.schema_id
ORDER BY s.name, p.name
"""

FUNCTIONS = """
SELECT s.name AS schema_name, o.name AS function_name, o.type_desc AS function_type,
       o.create_date, o.modify_date
FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('FN','IF','TF') ORDER BY s.name, o.name
"""

INDEXES = """
SELECT s.name AS schema_name, t.name AS table_name, i.name AS index_name, i.type_desc AS index_type,
       i.is_unique, i.is_primary_key, i.is_unique_constraint,
       STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS indexed_columns, i.fill_factor
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.type > 0
GROUP BY s.name, t.name, i.name, i.type_desc, i.is_unique, i.is_primary_key, i.is_unique_constraint, i.fill_factor
ORDER BY s.name, t.name, i.name
"""

RELATIONSHIPS = """
SELECT fk.name AS fk_name, ps.name AS parent_schema, pt.name AS parent_table,
       pc.name AS parent_column, rs.name AS ref_schema, rt.name AS ref_table,
       rc.name AS ref_column, fk.delete_referential_action_desc AS on_delete,
       fk.update_referential_action_desc AS on_update
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
JOIN sys.schemas ps ON ps.schema_id = pt.schema_id
JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
ORDER BY parent_schema, parent_table, fk_name
"""

INDEX_COVERAGE = """
SELECT s.name AS schema_name, t.name AS table_name,
       COUNT(DISTINCT i.index_id) AS index_count,
       CASE WHEN COUNT(DISTINCT i.index_id) > 0 THEN 'Indexed' ELSE 'No Index' END AS coverage
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.indexes i ON i.object_id = t.object_id AND i.type > 0
GROUP BY s.name, t.name ORDER BY coverage, s.name, t.name
"""

INSERTION_FREQUENCY = """
SELECT s.name AS schema_name, t.name AS table_name, p.rows AS current_rows,
       t.create_date, t.modify_date,
       DATEDIFF(DAY, t.create_date, GETDATE()) AS age_days,
       CASE WHEN DATEDIFF(DAY, t.create_date, GETDATE()) > 0
            THEN CAST(p.rows AS FLOAT) / DATEDIFF(DAY, t.create_date, GETDATE())
            ELSE 0 END AS avg_rows_per_day
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = t.object_id AND i.index_id IN (0,1)
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id = i.index_id
WHERE p.rows > 0 ORDER BY avg_rows_per_day DESC
"""

DB_USERS_ROLES = """
SELECT dp.name AS principal_name, dp.type_desc AS principal_type,
       CONVERT(VARCHAR, dp.create_date, 120) AS create_date,
       ISNULL(dp.default_schema_name, '') AS default_schema,
       ISNULL(sp.name, 'No Server Login') AS server_login,
       ISNULL((SELECT STRING_AGG(rp.name, ', ') WITHIN GROUP (ORDER BY rp.name)
               FROM sys.database_role_members drm2
               JOIN sys.database_principals rp ON rp.principal_id = drm2.role_principal_id
               WHERE drm2.member_principal_id = dp.principal_id), 'None') AS roles
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE dp.type IN ('S','U','G','E','X') ORDER BY dp.name
"""

ORPHANED_USERS = """
SELECT dp.name AS user_name, dp.type_desc AS user_type,
       CONVERT(VARCHAR, dp.create_date, 120) AS create_date,
       ISNULL(dp.default_schema_name, '') AS default_schema
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE dp.type IN ('S','U') AND sp.sid IS NULL
  AND dp.name NOT IN ('dbo','guest','INFORMATION_SCHEMA','sys') ORDER BY dp.name
"""

DB_OWNER_MEMBERS = """
SELECT dp.name AS member_name, dp.type_desc AS member_type,
       ISNULL(sp.name, 'No Server Login') AS server_login,
       CONVERT(VARCHAR, dp.create_date, 120) AS create_date
FROM sys.database_role_members drm
JOIN sys.database_principals dp ON dp.principal_id = drm.member_principal_id
JOIN sys.database_principals rp ON rp.principal_id = drm.role_principal_id
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE rp.name = 'db_owner' AND dp.name != 'dbo' ORDER BY dp.name
"""

DYNAMIC_SQL_USAGE = """
SELECT o.type_desc AS object_type, s.name AS schema_name, o.name AS object_name,
       CASE WHEN m.definition LIKE '%sp_executesql%' THEN 'sp_executesql'
            WHEN m.definition LIKE '%EXEC%+%' OR m.definition LIKE '%EXECUTE%+%' THEN 'Dynamic EXEC (string concat)'
            ELSE 'Dynamic SQL' END AS dynamic_sql_type
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('P','FN','IF','TF','TR')
  AND (m.definition LIKE '%sp_executesql%' OR m.definition LIKE '%EXEC%+%' OR m.definition LIKE '%EXECUTE%+%')
ORDER BY o.type_desc, s.name, o.name
"""

CLR_ASSEMBLIES = """
SELECT a.name AS assembly_name, a.permission_set_desc AS permission_set,
       CONVERT(VARCHAR, a.create_date, 120) AS create_date,
       CONVERT(VARCHAR, a.modify_date, 120) AS modify_date,
       CASE a.is_visible WHEN 1 THEN 'Yes' ELSE 'No' END AS is_visible,
       COUNT(ao.object_id) AS clr_object_count
FROM sys.assemblies a
LEFT JOIN sys.assembly_objects ao ON ao.assembly_id = a.assembly_id
WHERE a.is_user_defined = 1
GROUP BY a.name, a.permission_set_desc, a.create_date, a.modify_date, a.is_visible ORDER BY a.name
"""

TDE_STATUS = """
SELECT d.name AS database_name,
       CASE WHEN dek.database_id IS NOT NULL THEN 'Enabled' ELSE 'Not Enabled' END AS tde_status,
       ISNULL(dek.encryption_state_desc, 'N/A') AS encryption_state,
       ISNULL(CAST(dek.percent_complete AS VARCHAR(10)), 'N/A') AS percent_complete,
       ISNULL(dek.key_algorithm, 'N/A') AS key_algorithm,
       ISNULL(CAST(dek.key_length AS VARCHAR(10)), 'N/A') AS key_length
FROM sys.databases d
LEFT JOIN sys.dm_database_encryption_keys dek ON dek.database_id = d.database_id
WHERE d.database_id = DB_ID()
"""

COLUMN_ENCRYPTION = """
SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name,
       tp.name AS data_type, cek.name AS encryption_key_name, c.encryption_type_desc AS encryption_type
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.types tp ON tp.user_type_id = c.user_type_id
JOIN sys.column_encryption_keys cek ON cek.column_encryption_key_id = c.column_encryption_key_id
WHERE c.column_encryption_key_id IS NOT NULL ORDER BY s.name, t.name, c.name
"""

PII_INDICATORS = """
SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name, tp.name AS data_type,
       CASE
           WHEN c.name LIKE '%ssn%' OR c.name LIKE '%social_security%' THEN 'SSN'
           WHEN c.name LIKE '%email%' OR c.name LIKE '%e_mail%' THEN 'Email'
           WHEN c.name LIKE '%phone%' OR c.name LIKE '%mobile%' OR c.name LIKE '%cell_phone%' THEN 'Phone'
           WHEN c.name LIKE '%dob%' OR c.name LIKE '%birth_date%' OR c.name LIKE '%date_of_birth%' THEN 'Date of Birth'
           WHEN c.name LIKE '%passport%' THEN 'Passport'
           WHEN c.name LIKE '%credit_card%' OR c.name LIKE '%card_number%' OR c.name LIKE '%cc_num%' THEN 'Credit Card'
           WHEN c.name LIKE '%address%' OR c.name LIKE '%street%' THEN 'Address'
           WHEN c.name LIKE '%zip%' OR c.name LIKE '%postal%' THEN 'Postal Code'
           WHEN c.name LIKE '%salary%' OR c.name LIKE '%wage%' OR c.name LIKE '%income%' THEN 'Financial'
           WHEN c.name LIKE '%password%' OR c.name LIKE '%pwd%' OR c.name LIKE '%secret%' OR c.name LIKE '%token%' THEN 'Password/Secret'
           WHEN c.name LIKE '%national_id%' OR c.name LIKE '%nationalid%' THEN 'National ID'
           WHEN c.name LIKE '%ip_address%' OR c.name LIKE '%ipaddress%' THEN 'IP Address'
           WHEN c.name LIKE '%gender%' THEN 'Gender'
           WHEN c.name LIKE '%race%' OR c.name LIKE '%ethnicity%' THEN 'Race/Ethnicity'
           ELSE 'Other PII'
       END AS pii_category
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.types tp ON tp.user_type_id = c.user_type_id
WHERE c.name LIKE '%ssn%' OR c.name LIKE '%social_security%' OR c.name LIKE '%email%'
   OR c.name LIKE '%phone%' OR c.name LIKE '%mobile%' OR c.name LIKE '%dob%'
   OR c.name LIKE '%birth_date%' OR c.name LIKE '%passport%' OR c.name LIKE '%credit_card%'
   OR c.name LIKE '%card_number%' OR c.name LIKE '%address%' OR c.name LIKE '%zip%'
   OR c.name LIKE '%postal%' OR c.name LIKE '%salary%' OR c.name LIKE '%wage%'
   OR c.name LIKE '%income%' OR c.name LIKE '%password%' OR c.name LIKE '%pwd%'
   OR c.name LIKE '%secret%' OR c.name LIKE '%token%' OR c.name LIKE '%national_id%'
   OR c.name LIKE '%ip_address%' OR c.name LIKE '%gender%' OR c.name LIKE '%race%'
   OR c.name LIKE '%ethnicity%'
ORDER BY pii_category, s.name, t.name, c.name
"""

SQL_AGENT_JOBS = """
SELECT j.name AS job_name, CASE j.enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS status,
       ISNULL(j.description, '') AS description,
       CONVERT(VARCHAR, j.date_created, 120) AS date_created,
       CONVERT(VARCHAR, j.date_modified, 120) AS date_modified,
       (SELECT COUNT(*) FROM msdb.dbo.sysjobhistory h WHERE h.job_id = j.job_id AND h.step_id = 0 AND h.run_status = 0) AS failure_count,
       ISNULL((SELECT TOP 1 CASE h.run_status WHEN 0 THEN 'Failed' WHEN 1 THEN 'Succeeded'
                WHEN 2 THEN 'Retry' WHEN 3 THEN 'Cancelled' ELSE 'Unknown' END
               FROM msdb.dbo.sysjobhistory h WHERE h.job_id = j.job_id AND h.step_id = 0
               ORDER BY h.run_date DESC, h.run_time DESC), 'Never Run') AS last_run_status
FROM msdb.dbo.sysjobs j ORDER BY j.name
"""

LINKED_SERVERS = """
SELECT s.name AS linked_server_name, ISNULL(s.product,'') AS product,
       ISNULL(s.provider,'') AS provider, ISNULL(s.data_source,'') AS data_source,
       CASE s.is_remote_login_enabled WHEN 1 THEN 'Yes' ELSE 'No' END AS remote_login_enabled,
       CASE s.is_data_access_enabled WHEN 1 THEN 'Yes' ELSE 'No' END AS data_access_enabled,
       CASE s.is_rpc_out_enabled WHEN 1 THEN 'Yes' ELSE 'No' END AS rpc_out_enabled,
       CONVERT(VARCHAR, s.modify_date, 120) AS modify_date
FROM sys.servers s WHERE s.is_linked = 1 ORDER BY s.name
"""

CROSS_DB_REFERENCES = """
SELECT DISTINCT o.type_desc AS object_type, s.name AS schema_name, o.name AS object_name,
       d.referenced_database_name AS referenced_database,
       ISNULL(d.referenced_schema_name,'') AS referenced_schema,
       d.referenced_entity_name AS referenced_entity
FROM sys.sql_expression_dependencies d
JOIN sys.objects o ON o.object_id = d.referencing_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE d.referenced_database_name IS NOT NULL AND d.referenced_database_name <> DB_NAME()
ORDER BY d.referenced_database_name, s.name, o.name
"""

REPLICATION_STATUS = """
SELECT DB_NAME() AS database_name,
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE is_replicated = 1) THEN 'Yes' ELSE 'No' END AS has_replicated_tables,
       (SELECT COUNT(*) FROM sys.tables WHERE is_replicated = 1) AS replicated_table_count,
       CASE DATABASEPROPERTYEX(DB_NAME(),'IsPublished') WHEN 1 THEN 'Yes' ELSE 'No' END AS is_publisher,
       CASE DATABASEPROPERTYEX(DB_NAME(),'IsSubscribed') WHEN 1 THEN 'Yes' ELSE 'No' END AS is_subscriber,
       CASE DATABASEPROPERTYEX(DB_NAME(),'IsMergePublished') WHEN 1 THEN 'Yes' ELSE 'No' END AS is_merge_published
"""

SERVICE_BROKER = """
SELECT DB_NAME() AS database_name,
       CASE d.is_broker_enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS broker_status,
       (SELECT COUNT(*) FROM sys.service_queues WHERE is_ms_shipped = 0) AS user_queue_count,
       (SELECT COUNT(*) FROM sys.services WHERE is_ms_shipped = 0) AS user_service_count,
       (SELECT COUNT(*) FROM sys.conversation_endpoints WHERE state NOT IN ('CD','ER')) AS active_conversations
FROM sys.databases d WHERE d.database_id = DB_ID()
"""

VERSION_FEATURES = """
SELECT @@SERVERNAME AS server_name,
       CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50)) AS product_version,
       CAST(SERVERPROPERTY('ProductLevel') AS VARCHAR(50)) AS product_level,
       CAST(SERVERPROPERTY('ProductUpdateLevel') AS VARCHAR(50)) AS product_update_level,
       CAST(SERVERPROPERTY('Edition') AS VARCHAR(100)) AS edition,
       CAST(SERVERPROPERTY('EngineEdition') AS VARCHAR(10)) AS engine_edition,
       CASE SERVERPROPERTY('IsClustered') WHEN 1 THEN 'Yes' ELSE 'No' END AS is_clustered,
       CASE SERVERPROPERTY('IsHadrEnabled') WHEN 1 THEN 'Yes' ELSE 'No' END AS hadr_enabled,
       CASE SERVERPROPERTY('IsFullTextInstalled') WHEN 1 THEN 'Yes' ELSE 'No' END AS fulltext_installed,
       (SELECT value_in_use FROM sys.configurations WHERE name = 'clr enabled') AS clr_enabled,
       (SELECT value_in_use FROM sys.configurations WHERE name = 'xp_cmdshell') AS xp_cmdshell_enabled,
       (SELECT value_in_use FROM sys.configurations WHERE name = 'Ole Automation Procedures') AS ole_automation_enabled,
       (SELECT value_in_use FROM sys.configurations WHERE name = 'Ad Hoc Distributed Queries') AS adhoc_distributed_queries
"""

NULL_ANALYSIS_COLUMNS = """
SELECT c.name, tp.name AS data_type
FROM sys.columns c JOIN sys.types tp ON tp.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID('{full_name}') AND c.is_nullable = 1
"""

_QUERY_STEPS = [
    ("overview", OVERVIEW),
    ("schemas", SCHEMAS),
    ("tables", TABLES),
    ("columns", COLUMNS),
    ("views", VIEWS),
    ("stored_procedures", STORED_PROCEDURES),
    ("functions", FUNCTIONS),
    ("indexes", INDEXES),
    ("relationships", RELATIONSHIPS),
    ("index_coverage", INDEX_COVERAGE),
    ("insertion_frequency", INSERTION_FREQUENCY),
    ("db_users_roles", DB_USERS_ROLES),
    ("orphaned_users", ORPHANED_USERS),
    ("db_owner_members", DB_OWNER_MEMBERS),
    ("dynamic_sql_usage", DYNAMIC_SQL_USAGE),
    ("clr_assemblies", CLR_ASSEMBLIES),
    ("tde_status", TDE_STATUS),
    ("column_encryption", COLUMN_ENCRYPTION),
    ("pii_indicators", PII_INDICATORS),
    ("sql_agent_jobs", SQL_AGENT_JOBS),
    ("linked_servers", LINKED_SERVERS),
    ("cross_db_references", CROSS_DB_REFERENCES),
    ("replication_status", REPLICATION_STATUS),
    ("service_broker", SERVICE_BROKER),
    ("version_features", VERSION_FEATURES),
]


# ── Assessment helpers ────────────────────────────────────────────────────────


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _rows_to_dicts(cursor) -> list[dict]:
    rows = cursor.fetchall()
    if not rows:
        return []
    # pymssql with as_dict=True returns list of dicts already
    return [{k: _serialize(v) for k, v in row.items()} for row in rows]


def _safe_fetch(cursor, sql: str, label: str) -> list[dict]:
    try:
        cursor.execute(sql)
        return _rows_to_dicts(cursor)
    except Exception as exc:
        print(f"    [WARN] {label}: {exc}")
        return []


def _run_null_analysis(cursor, table_rows: list[dict], sample_limit: int) -> list[dict]:
    results = []
    sampled = 0
    for tbl in table_rows:
        if sampled >= sample_limit:
            break
        schema = tbl.get("schema_name", "")
        table = tbl.get("table_name", "")
        full_name = f"[{schema}].[{table}]"
        col_sql = NULL_ANALYSIS_COLUMNS.format(full_name=full_name)
        col_rows = _safe_fetch(cursor, col_sql, f"null-cols {full_name}")
        if not col_rows:
            sampled += 1
            continue
        nullable_cols = [(r["name"], r["data_type"]) for r in col_rows[:20]]
        if not nullable_cols:
            sampled += 1
            continue
        exprs = []
        for col_name, dtype in nullable_cols:
            safe_col = f"[{col_name}]"
            if dtype in ("varchar", "nvarchar", "char", "nchar"):
                exprs.append(
                    f"SUM(CASE WHEN {safe_col} IS NULL OR LTRIM(RTRIM({safe_col})) = '' THEN 1 ELSE 0 END) "
                    f"* 100.0 / NULLIF(COUNT(*),0) AS [{col_name}_null_pct]"
                )
            elif dtype in ("text", "ntext"):
                exprs.append(
                    f"SUM(CASE WHEN {safe_col} IS NULL OR LTRIM(RTRIM(CAST({safe_col} AS NVARCHAR(MAX)))) = '' THEN 1 ELSE 0 END) "
                    f"* 100.0 / NULLIF(COUNT(*),0) AS [{col_name}_null_pct]"
                )
            else:
                exprs.append(
                    f"SUM(CASE WHEN {safe_col} IS NULL THEN 1 ELSE 0 END) "
                    f"* 100.0 / NULLIF(COUNT(*),0) AS [{col_name}_null_pct]"
                )
        query = f"SELECT COUNT(*) AS total_rows, {', '.join(exprs)} FROM {full_name}"
        try:
            cursor.execute(query)
            row = cursor.fetchone()
        except Exception as exc:
            print(f"    [WARN] Null analysis {full_name}: {exc}")
            sampled += 1
            continue
        if row:
            # pymssql as_dict=True returns a dict; access by key
            total_rows = row.get("total_rows", 0) if isinstance(row, dict) else row[0]
            for col_name, _ in nullable_cols:
                key = f"{col_name}_null_pct"
                pct_raw = row.get(key) if isinstance(row, dict) else None
                results.append(
                    {
                        "schema_name": schema,
                        "table_name": table,
                        "column_name": col_name,
                        "total_rows": total_rows,
                        "null_blank_pct": (
                            round(float(pct_raw), 2) if pct_raw is not None else 0.0
                        ),
                    }
                )
        sampled += 1
    return results


def run_assessment(payload: dict) -> dict:
    conn_cfg = payload["connection"]
    include_null = payload.get("include_null_analysis", True)
    null_limit = payload.get("null_analysis_sample_limit", 30)

    print(f"  Connecting to {conn_cfg['server']} / {conn_cfg['database']}…")
    # pymssql bundles its own TDS driver — no ODBC Driver installation required
    conn = pymssql.connect(
        server=conn_cfg["server"],
        port=str(conn_cfg.get("port", 1433)),
        user=conn_cfg["username"],
        password=conn_cfg["password"],
        database=conn_cfg["database"],
        tds_version="7.4",
        login_timeout=30,
    )
    cursor = conn.cursor(as_dict=True)

    raw: dict[str, Any] = {}
    try:
        total = len(_QUERY_STEPS)
        for i, (key, sql) in enumerate(_QUERY_STEPS, 1):
            print(f"  [{i:02d}/{total}] {key}…")
            raw[key] = _safe_fetch(cursor, sql, key)

        if include_null:
            print(f"  [NA] Null analysis (limit={null_limit})…")
            raw["null_analysis"] = _run_null_analysis(
                cursor, raw.get("tables", []), null_limit
            )
        else:
            raw["null_analysis"] = []
    finally:
        cursor.close()
        conn.close()

    return raw


# ── HTTP helpers ──────────────────────────────────────────────────────────────


def _post(url: str, data: dict) -> dict:
    resp = requests.post(url, json=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get(url: str, params: dict = None) -> dict:
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── Heartbeat (Service Bus mode) ──────────────────────────────────────────────


def _start_heartbeat(server_url: str, gateway_key: str, interval: int = 30) -> None:
    """
    Background thread: pings /gateway/heartbeat every `interval` seconds so
    the portal shows this gateway as Online even in Service Bus mode.
    """
    if not server_url or not gateway_key:
        return  # HTTP heartbeat not configured — skip silently

    def _beat():
        while True:
            try:
                requests.post(
                    f"{server_url}/api/v1/gateway/heartbeat",
                    params={"gateway_key": gateway_key},
                    timeout=10,
                )
            except Exception:
                pass  # Never crash the heartbeat thread
            time.sleep(interval)

    t = threading.Thread(target=_beat, daemon=True)
    t.start()


# ── Service Bus mode ──────────────────────────────────────────────────────────


def _run_service_bus_loop(conn_str: str) -> None:
    """Main loop using Azure Service Bus — works through VPNs."""
    try:
        from azure.servicebus import ServiceBusClient, ServiceBusMessage
    except ImportError:
        print(
            "ERROR: azure-servicebus not installed. Run: pip install azure-servicebus"
        )
        sys.exit(1)

    print(f"Mode    : Azure Service Bus (VPN-compatible)")
    print(f"Jobs Q  : {SERVICE_BUS_JOBS_QUEUE}")
    print(f"Results Q: {SERVICE_BUS_RESULTS_QUEUE}")
    if SAT_SERVER_URL and GATEWAY_KEY:
        print(f"Heartbeat: {SAT_SERVER_URL} every 30s")
        _start_heartbeat(SAT_SERVER_URL, GATEWAY_KEY)
    else:
        print(f"Heartbeat: disabled (set SAT_SERVER_URL + GATEWAY_KEY to enable)")
    print(f"Listening for jobs. Press Ctrl+C to stop.\n")

    while True:
        try:
            with ServiceBusClient.from_connection_string(conn_str) as client:
                with client.get_queue_receiver(
                    SERVICE_BUS_JOBS_QUEUE,
                    max_wait_time=30,
                ) as receiver:
                    print(f"[{_now()}] Idle — waiting for jobs…", end="\r")
                    msgs = receiver.receive_messages(
                        max_message_count=1, max_wait_time=30
                    )
                    if not msgs:
                        continue

                    msg = msgs[0]
                    body = json.loads(str(msg))
                    job_id = body.get("job_id")
                    payload = body.get("payload", {})

                    print(f"\n[{_now()}] Job received: {job_id}")
                    receiver.complete_message(msg)

                    error = None
                    results = None
                    try:
                        results = run_assessment(payload)
                        print(f"[{_now()}] Assessment done. Sending results…")
                    except Exception as exc:
                        error = str(exc)
                        print(f"[{_now()}] Assessment FAILED: {exc}")

                    # Send result back via Service Bus
                    result_payload = json.dumps(
                        {
                            "job_id": job_id,
                            "results": results,
                            "error": error,
                        }
                    )
                    with client.get_queue_sender(SERVICE_BUS_RESULTS_QUEUE) as sender:
                        sender.send_messages(
                            ServiceBusMessage(result_payload, message_id=job_id)
                        )

                    if error:
                        print(f"[{_now()}] Error reported to server for job {job_id}.")
                    else:
                        print(f"[{_now()}] Job {job_id} completed successfully.")

        except KeyboardInterrupt:
            print("\nStopped.")
            sys.exit(0)
        except Exception as exc:
            print(f"[{_now()}] Service Bus error (retrying in 10s): {exc}")
            time.sleep(10)


# ── Legacy HTTP polling mode ──────────────────────────────────────────────────


def _run_http_poll_loop() -> None:
    """Fallback loop using HTTP polling — may be blocked by strict VPNs."""
    global SAT_SERVER_URL, GATEWAY_KEY

    if not SAT_SERVER_URL:
        SAT_SERVER_URL = input("SAT Server URL: ").strip().rstrip("/")
    if not GATEWAY_KEY:
        GATEWAY_KEY = input("Gateway Key: ").strip()

    if not SAT_SERVER_URL or not GATEWAY_KEY:
        print("ERROR: SAT_SERVER_URL and GATEWAY_KEY are required.")
        sys.exit(1)

    if "your-sat-app" in SAT_SERVER_URL:
        print("ERROR: SAT_SERVER_URL is still the placeholder.")
        sys.exit(1)

    print(f"Mode    : HTTP Polling (fallback)")
    print(f"Server  : {SAT_SERVER_URL}")
    print(f"Key     : {GATEWAY_KEY[:8]}…{GATEWAY_KEY[-4:]}")
    print(f"Polling every {POLL_INTERVAL}s. Press Ctrl+C to stop.\n")

    while True:
        try:
            data = _get(
                f"{SAT_SERVER_URL}/api/v1/gateway/poll",
                params={"gateway_key": GATEWAY_KEY},
            )
            job_id = data.get("job_id")

            if job_id:
                payload = data.get("payload", {})
                print(f"[{_now()}] Job received: {job_id}")
                try:
                    results = run_assessment(payload)
                    print(f"[{_now()}] Submitting results…")
                    _post(
                        f"{SAT_SERVER_URL}/api/v1/gateway/submit/{job_id}",
                        {"gateway_key": GATEWAY_KEY, "results": results},
                    )
                    print(f"[{_now()}] Job {job_id} completed successfully.")
                except Exception as exc:
                    print(f"[{_now()}] Job {job_id} FAILED: {exc}")
                    try:
                        _post(
                            f"{SAT_SERVER_URL}/api/v1/gateway/submit/{job_id}",
                            {"gateway_key": GATEWAY_KEY, "error": str(exc)},
                        )
                    except Exception:
                        pass
            else:
                print(f"[{_now()}] Idle — waiting for jobs…", end="\r")

        except KeyboardInterrupt:
            print("\nStopped.")
            sys.exit(0)
        except Exception as exc:
            print(f"[{_now()}] Poll error: {exc}")

        time.sleep(POLL_INTERVAL)


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    print("=" * 60)
    print("  SAT Gateway Agent")
    print("=" * 60)

    if SERVICE_BUS_CONNECTION_STRING:
        # Recommended: Azure Service Bus — works through corporate VPNs
        _run_service_bus_loop(SERVICE_BUS_CONNECTION_STRING)
    else:
        # Fallback: HTTP polling
        print("\nNote: SERVICE_BUS_CONNECTION_STRING not set.")
        print("      Falling back to HTTP polling mode.")
        print("      This may not work if your VPN blocks outbound connections.\n")
        _run_http_poll_loop()


def _now() -> str:
    return datetime.now().strftime("%H:%M:%S")


if __name__ == "__main__":
    main()
