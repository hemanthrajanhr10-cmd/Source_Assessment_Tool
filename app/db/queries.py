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
