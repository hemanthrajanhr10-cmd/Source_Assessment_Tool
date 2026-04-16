-- =============================================================================
-- SQL Server Source Assessment Tool — Azure SQL Schema  (v2 — Relational)
-- Database : SourceAssessment
-- Idempotent: every block is guarded by IF OBJECT_ID / IF NOT EXISTS
-- Migration : old JSON-blob assessment_sections table is dropped automatically
-- =============================================================================

-- ─── 0. users ────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.users', 'U') IS NULL
    CREATE TABLE dbo.users (
        user_id        VARCHAR(36)    NOT NULL,
        email          NVARCHAR(255)  NOT NULL,
        full_name      NVARCHAR(200)  NULL,
        password_hash  NVARCHAR(255)  NOT NULL,
        mfa_secret     NVARCHAR(64)   NULL,       -- NULL = MFA not yet set up
        mfa_enabled    BIT            NOT NULL DEFAULT 0,
        is_active      BIT            NOT NULL DEFAULT 1,
        created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_users PRIMARY KEY (user_id),
        CONSTRAINT UQ_users_email UNIQUE (email)
    );

-- ─── Migration: remove old JSON-blob table (one-time) ────────────────────────
IF OBJECT_ID('dbo.assessment_sections', 'U') IS NOT NULL
    DROP TABLE dbo.assessment_sections;

-- ─── 1. jobs ─────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.jobs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.jobs (
        job_id           VARCHAR(36)     NOT NULL,
        status           VARCHAR(20)     NOT NULL DEFAULT 'pending',
        label            NVARCHAR(200)   NULL,
        created_at       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        started_at       DATETIME2       NULL,
        completed_at     DATETIME2       NULL,
        error            NVARCHAR(MAX)   NULL,
        progress_message NVARCHAR(500)   NULL,
        report_path      NVARCHAR(1000)  NULL,
        gateway_key      VARCHAR(36)     NULL,
        gateway_payload  NVARCHAR(MAX)   NULL,
        CONSTRAINT PK_jobs PRIMARY KEY (job_id)
    );
    CREATE INDEX IX_jobs_status      ON dbo.jobs (status);
    CREATE INDEX IX_jobs_created_at  ON dbo.jobs (created_at DESC);
    CREATE INDEX IX_jobs_gateway_key ON dbo.jobs (gateway_key);
END;

-- Migration: add gateway columns to existing jobs table if not present
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.jobs') AND name = 'gateway_key')
    ALTER TABLE dbo.jobs ADD gateway_key VARCHAR(36) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.jobs') AND name = 'gateway_payload')
    ALTER TABLE dbo.jobs ADD gateway_payload NVARCHAR(MAX) NULL;

-- ─── 1b. gateways ─────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.gateways', 'U') IS NULL
    CREATE TABLE dbo.gateways (
        gateway_key   VARCHAR(36)    NOT NULL,
        name          NVARCHAR(200)  NOT NULL,
        status        VARCHAR(20)    NOT NULL DEFAULT 'offline',
        last_seen_at  DATETIME2      NULL,
        created_at    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        user_id       VARCHAR(36)    NULL,
        CONSTRAINT PK_gateways PRIMARY KEY (gateway_key)
    );

-- Migration: add user_id to existing gateways table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.gateways') AND name = 'user_id')
    ALTER TABLE dbo.gateways ADD user_id VARCHAR(36) NULL;

-- ─── 1c. fabric_sessions ─────────────────────────────────────────────────────
IF OBJECT_ID('dbo.fabric_sessions', 'U') IS NULL
    CREATE TABLE dbo.fabric_sessions (
        session_id       VARCHAR(36)     NOT NULL,
        user_id          VARCHAR(36)     NULL,
        label            NVARCHAR(200)   NULL,
        status           VARCHAR(20)     NOT NULL DEFAULT 'running',
        created_at       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at     DATETIME2       NULL,
        error            NVARCHAR(MAX)   NULL,
        progress_message NVARCHAR(500)   NULL,
        results_json     NVARCHAR(MAX)   NULL,
        CONSTRAINT PK_fabric_sessions PRIMARY KEY (session_id)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fabric_sessions_user')
    CREATE INDEX IX_fabric_sessions_user ON dbo.fabric_sessions (user_id, created_at DESC);

-- ─── 2. assessment_overview ───────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_overview', 'U') IS NULL
    CREATE TABLE dbo.assessment_overview (
        job_id              VARCHAR(36)     NOT NULL,
        database_name       NVARCHAR(128)   NULL,
        connected_user      NVARCHAR(128)   NULL,
        sql_server_version  NVARCHAR(512)   NULL,
        schema_count        INT             NULL,
        table_count         INT             NULL,
        view_count          INT             NULL,
        stored_proc_count   INT             NULL,
        function_count      INT             NULL,
        total_size_mb       DECIMAL(18,2)   NULL,
        CONSTRAINT PK_assessment_overview PRIMARY KEY (job_id),
        CONSTRAINT FK_overview_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE METADATA TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 3. assessment_schemas ───────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_schemas', 'U') IS NULL
    CREATE TABLE dbo.assessment_schemas (
        id           BIGINT IDENTITY(1,1) NOT NULL,
        job_id       VARCHAR(36)          NOT NULL,
        schema_name  NVARCHAR(128)        NOT NULL,
        table_count  INT                  NOT NULL DEFAULT 0,
        view_count   INT                  NOT NULL DEFAULT 0,
        proc_count   INT                  NOT NULL DEFAULT 0,
        CONSTRAINT PK_assessment_schemas PRIMARY KEY (id),
        CONSTRAINT FK_schemas_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 4. assessment_tables ────────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_tables', 'U') IS NULL
    CREATE TABLE dbo.assessment_tables (
        id            BIGINT IDENTITY(1,1) NOT NULL,
        job_id        VARCHAR(36)          NOT NULL,
        schema_name   NVARCHAR(128)        NOT NULL,
        table_name    NVARCHAR(128)        NOT NULL,
        column_count  INT                  NULL,
        row_count     BIGINT               NULL,
        size_mb       DECIMAL(18,2)        NULL,
        create_date   NVARCHAR(30)         NULL,
        modify_date   NVARCHAR(30)         NULL,
        CONSTRAINT PK_assessment_tables PRIMARY KEY (id),
        CONSTRAINT FK_tables_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 5. assessment_columns ───────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_columns', 'U') IS NULL
    CREATE TABLE dbo.assessment_columns (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        job_id          VARCHAR(36)          NOT NULL,
        schema_name     NVARCHAR(128)        NOT NULL,
        table_name      NVARCHAR(128)        NOT NULL,
        column_id       INT                  NOT NULL,
        column_name     NVARCHAR(128)        NOT NULL,
        data_type       NVARCHAR(128)        NULL,
        max_length      SMALLINT             NULL,
        precision       TINYINT              NULL,
        scale           TINYINT              NULL,
        is_nullable     BIT                  NULL,
        is_identity     BIT                  NULL,
        is_primary_key  NVARCHAR(3)          NULL,
        is_foreign_key  NVARCHAR(3)          NULL,
        default_value   NVARCHAR(MAX)        NULL,
        CONSTRAINT PK_assessment_columns PRIMARY KEY (id),
        CONSTRAINT FK_columns_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 6. assessment_views ─────────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_views', 'U') IS NULL
    CREATE TABLE dbo.assessment_views (
        id           BIGINT IDENTITY(1,1) NOT NULL,
        job_id       VARCHAR(36)          NOT NULL,
        schema_name  NVARCHAR(128)        NOT NULL,
        view_name    NVARCHAR(128)        NOT NULL,
        create_date  NVARCHAR(30)         NULL,
        modify_date  NVARCHAR(30)         NULL,
        definition   NVARCHAR(MAX)        NULL,
        CONSTRAINT PK_assessment_views PRIMARY KEY (id),
        CONSTRAINT FK_views_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 7. assessment_stored_procedures ─────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_stored_procedures', 'U') IS NULL
    CREATE TABLE dbo.assessment_stored_procedures (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        job_id          VARCHAR(36)          NOT NULL,
        schema_name     NVARCHAR(128)        NOT NULL,
        procedure_name  NVARCHAR(128)        NOT NULL,
        create_date     NVARCHAR(30)         NULL,
        modify_date     NVARCHAR(30)         NULL,
        param_count     INT                  NULL,
        CONSTRAINT PK_assessment_stored_procedures PRIMARY KEY (id),
        CONSTRAINT FK_stored_procs_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 8. assessment_functions ─────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_functions', 'U') IS NULL
    CREATE TABLE dbo.assessment_functions (
        id             BIGINT IDENTITY(1,1) NOT NULL,
        job_id         VARCHAR(36)          NOT NULL,
        schema_name    NVARCHAR(128)        NOT NULL,
        function_name  NVARCHAR(128)        NOT NULL,
        function_type  NVARCHAR(60)         NULL,
        create_date    NVARCHAR(30)         NULL,
        modify_date    NVARCHAR(30)         NULL,
        CONSTRAINT PK_assessment_functions PRIMARY KEY (id),
        CONSTRAINT FK_functions_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 9. assessment_indexes ───────────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_indexes', 'U') IS NULL
    CREATE TABLE dbo.assessment_indexes (
        id                   BIGINT IDENTITY(1,1) NOT NULL,
        job_id               VARCHAR(36)          NOT NULL,
        schema_name          NVARCHAR(128)        NOT NULL,
        table_name           NVARCHAR(128)        NOT NULL,
        index_name           NVARCHAR(128)        NOT NULL,
        index_type           NVARCHAR(60)         NULL,
        is_unique            BIT                  NULL,
        is_primary_key       BIT                  NULL,
        is_unique_constraint BIT                  NULL,
        indexed_columns      NVARCHAR(MAX)        NULL,
        fill_factor          TINYINT              NULL,
        CONSTRAINT PK_assessment_indexes PRIMARY KEY (id),
        CONSTRAINT FK_indexes_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 10. assessment_relationships ────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_relationships', 'U') IS NULL
    CREATE TABLE dbo.assessment_relationships (
        id             BIGINT IDENTITY(1,1) NOT NULL,
        job_id         VARCHAR(36)          NOT NULL,
        fk_name        NVARCHAR(128)        NOT NULL,
        parent_schema  NVARCHAR(128)        NULL,
        parent_table   NVARCHAR(128)        NULL,
        parent_column  NVARCHAR(128)        NULL,
        ref_schema     NVARCHAR(128)        NULL,
        ref_table      NVARCHAR(128)        NULL,
        ref_column     NVARCHAR(128)        NULL,
        on_delete      NVARCHAR(60)         NULL,
        on_update      NVARCHAR(60)         NULL,
        CONSTRAINT PK_assessment_relationships PRIMARY KEY (id),
        CONSTRAINT FK_relationships_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 11. assessment_index_coverage ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_index_coverage', 'U') IS NULL
    CREATE TABLE dbo.assessment_index_coverage (
        id           BIGINT IDENTITY(1,1) NOT NULL,
        job_id       VARCHAR(36)          NOT NULL,
        schema_name  NVARCHAR(128)        NOT NULL,
        table_name   NVARCHAR(128)        NOT NULL,
        index_count  INT                  NULL,
        coverage     NVARCHAR(20)         NULL,
        CONSTRAINT PK_assessment_index_coverage PRIMARY KEY (id),
        CONSTRAINT FK_index_coverage_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 12. assessment_insertion_frequency ──────────────────────────────────────
IF OBJECT_ID('dbo.assessment_insertion_frequency', 'U') IS NULL
    CREATE TABLE dbo.assessment_insertion_frequency (
        id               BIGINT IDENTITY(1,1) NOT NULL,
        job_id           VARCHAR(36)          NOT NULL,
        schema_name      NVARCHAR(128)        NOT NULL,
        table_name       NVARCHAR(128)        NOT NULL,
        current_rows     BIGINT               NULL,
        create_date      NVARCHAR(30)         NULL,
        modify_date      NVARCHAR(30)         NULL,
        age_days         INT                  NULL,
        avg_rows_per_day FLOAT                NULL,
        CONSTRAINT PK_assessment_insertion_frequency PRIMARY KEY (id),
        CONSTRAINT FK_insertion_frequency_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 13. assessment_null_analysis ────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_null_analysis', 'U') IS NULL
    CREATE TABLE dbo.assessment_null_analysis (
        id             BIGINT IDENTITY(1,1) NOT NULL,
        job_id         VARCHAR(36)          NOT NULL,
        schema_name    NVARCHAR(128)        NOT NULL,
        table_name     NVARCHAR(128)        NOT NULL,
        column_name    NVARCHAR(128)        NOT NULL,
        total_rows     BIGINT               NULL,
        null_blank_pct FLOAT                NULL,
        CONSTRAINT PK_assessment_null_analysis PRIMARY KEY (id),
        CONSTRAINT FK_null_analysis_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY ASSESSMENT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 14. assessment_db_users_roles ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_db_users_roles', 'U') IS NULL
    CREATE TABLE dbo.assessment_db_users_roles (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        job_id          VARCHAR(36)          NOT NULL,
        principal_name  NVARCHAR(128)        NOT NULL,
        principal_type  NVARCHAR(60)         NULL,
        create_date     NVARCHAR(30)         NULL,
        default_schema  NVARCHAR(128)        NULL,
        server_login    NVARCHAR(128)        NULL,
        roles           NVARCHAR(MAX)        NULL,
        CONSTRAINT PK_assessment_db_users_roles PRIMARY KEY (id),
        CONSTRAINT FK_db_users_roles_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 15. assessment_orphaned_users ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_orphaned_users', 'U') IS NULL
    CREATE TABLE dbo.assessment_orphaned_users (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        job_id          VARCHAR(36)          NOT NULL,
        user_name       NVARCHAR(128)        NOT NULL,
        user_type       NVARCHAR(60)         NULL,
        create_date     NVARCHAR(30)         NULL,
        default_schema  NVARCHAR(128)        NULL,
        CONSTRAINT PK_assessment_orphaned_users PRIMARY KEY (id),
        CONSTRAINT FK_orphaned_users_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 16. assessment_db_owner_members ─────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_db_owner_members', 'U') IS NULL
    CREATE TABLE dbo.assessment_db_owner_members (
        id            BIGINT IDENTITY(1,1) NOT NULL,
        job_id        VARCHAR(36)          NOT NULL,
        member_name   NVARCHAR(128)        NOT NULL,
        member_type   NVARCHAR(60)         NULL,
        server_login  NVARCHAR(128)        NULL,
        create_date   NVARCHAR(30)         NULL,
        CONSTRAINT PK_assessment_db_owner_members PRIMARY KEY (id),
        CONSTRAINT FK_db_owner_members_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 17. assessment_dynamic_sql_usage ────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_dynamic_sql_usage', 'U') IS NULL
    CREATE TABLE dbo.assessment_dynamic_sql_usage (
        id               BIGINT IDENTITY(1,1) NOT NULL,
        job_id           VARCHAR(36)          NOT NULL,
        object_type      NVARCHAR(60)         NULL,
        schema_name      NVARCHAR(128)        NULL,
        object_name      NVARCHAR(128)        NOT NULL,
        dynamic_sql_type NVARCHAR(60)         NULL,
        CONSTRAINT PK_assessment_dynamic_sql_usage PRIMARY KEY (id),
        CONSTRAINT FK_dynamic_sql_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 18. assessment_clr_assemblies ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_clr_assemblies', 'U') IS NULL
    CREATE TABLE dbo.assessment_clr_assemblies (
        id               BIGINT IDENTITY(1,1) NOT NULL,
        job_id           VARCHAR(36)          NOT NULL,
        assembly_name    NVARCHAR(128)        NOT NULL,
        permission_set   NVARCHAR(60)         NULL,
        create_date      NVARCHAR(30)         NULL,
        modify_date      NVARCHAR(30)         NULL,
        is_visible       NVARCHAR(3)          NULL,
        clr_object_count INT                  NULL,
        CONSTRAINT PK_assessment_clr_assemblies PRIMARY KEY (id),
        CONSTRAINT FK_clr_assemblies_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 19. assessment_tde_status ───────────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_tde_status', 'U') IS NULL
    CREATE TABLE dbo.assessment_tde_status (
        id                BIGINT IDENTITY(1,1) NOT NULL,
        job_id            VARCHAR(36)          NOT NULL,
        database_name     NVARCHAR(128)        NOT NULL,
        tde_status        NVARCHAR(20)         NULL,
        encryption_state  NVARCHAR(60)         NULL,
        percent_complete  NVARCHAR(10)         NULL,
        key_algorithm     NVARCHAR(20)         NULL,
        key_length        NVARCHAR(10)         NULL,
        CONSTRAINT PK_assessment_tde_status PRIMARY KEY (id),
        CONSTRAINT FK_tde_status_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 20. assessment_column_encryption ────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_column_encryption', 'U') IS NULL
    CREATE TABLE dbo.assessment_column_encryption (
        id                   BIGINT IDENTITY(1,1) NOT NULL,
        job_id               VARCHAR(36)          NOT NULL,
        schema_name          NVARCHAR(128)        NOT NULL,
        table_name           NVARCHAR(128)        NOT NULL,
        column_name          NVARCHAR(128)        NOT NULL,
        data_type            NVARCHAR(128)        NULL,
        encryption_key_name  NVARCHAR(128)        NULL,
        encryption_type      NVARCHAR(60)         NULL,
        CONSTRAINT PK_assessment_column_encryption PRIMARY KEY (id),
        CONSTRAINT FK_column_encryption_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 21. assessment_pii_indicators ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_pii_indicators', 'U') IS NULL
    CREATE TABLE dbo.assessment_pii_indicators (
        id            BIGINT IDENTITY(1,1) NOT NULL,
        job_id        VARCHAR(36)          NOT NULL,
        schema_name   NVARCHAR(128)        NOT NULL,
        table_name    NVARCHAR(128)        NOT NULL,
        column_name   NVARCHAR(128)        NOT NULL,
        data_type     NVARCHAR(128)        NULL,
        pii_category  NVARCHAR(60)         NULL,
        CONSTRAINT PK_assessment_pii_indicators PRIMARY KEY (id),
        CONSTRAINT FK_pii_indicators_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- FEATURE USAGE & RISK TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 22. assessment_sql_agent_jobs ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_sql_agent_jobs', 'U') IS NULL
    CREATE TABLE dbo.assessment_sql_agent_jobs (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        job_id          VARCHAR(36)          NOT NULL,
        job_name        NVARCHAR(128)        NOT NULL,
        status          NVARCHAR(20)         NULL,
        description     NVARCHAR(MAX)        NULL,
        date_created    NVARCHAR(30)         NULL,
        date_modified   NVARCHAR(30)         NULL,
        failure_count   INT                  NULL,
        last_run_status NVARCHAR(20)         NULL,
        CONSTRAINT PK_assessment_sql_agent_jobs PRIMARY KEY (id),
        CONSTRAINT FK_sql_agent_jobs_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 23. assessment_linked_servers ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_linked_servers', 'U') IS NULL
    CREATE TABLE dbo.assessment_linked_servers (
        id                    BIGINT IDENTITY(1,1) NOT NULL,
        job_id                VARCHAR(36)          NOT NULL,
        linked_server_name    NVARCHAR(128)        NOT NULL,
        product               NVARCHAR(128)        NULL,
        provider              NVARCHAR(128)        NULL,
        data_source           NVARCHAR(256)        NULL,
        remote_login_enabled  NVARCHAR(3)          NULL,
        data_access_enabled   NVARCHAR(3)          NULL,
        rpc_out_enabled       NVARCHAR(3)          NULL,
        modify_date           NVARCHAR(30)         NULL,
        CONSTRAINT PK_assessment_linked_servers PRIMARY KEY (id),
        CONSTRAINT FK_linked_servers_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 24. assessment_cross_db_references ──────────────────────────────────────
IF OBJECT_ID('dbo.assessment_cross_db_references', 'U') IS NULL
    CREATE TABLE dbo.assessment_cross_db_references (
        id                   BIGINT IDENTITY(1,1) NOT NULL,
        job_id               VARCHAR(36)          NOT NULL,
        object_type          NVARCHAR(60)         NULL,
        schema_name          NVARCHAR(128)        NULL,
        object_name          NVARCHAR(128)        NOT NULL,
        referenced_database  NVARCHAR(128)        NULL,
        referenced_schema    NVARCHAR(128)        NULL,
        referenced_entity    NVARCHAR(128)        NULL,
        CONSTRAINT PK_assessment_cross_db_references PRIMARY KEY (id),
        CONSTRAINT FK_cross_db_refs_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 25. assessment_replication_status ───────────────────────────────────────
IF OBJECT_ID('dbo.assessment_replication_status', 'U') IS NULL
    CREATE TABLE dbo.assessment_replication_status (
        id                      BIGINT IDENTITY(1,1) NOT NULL,
        job_id                  VARCHAR(36)          NOT NULL,
        database_name           NVARCHAR(128)        NOT NULL,
        has_replicated_tables   NVARCHAR(3)          NULL,
        replicated_table_count  INT                  NULL,
        is_publisher            NVARCHAR(3)          NULL,
        is_subscriber           NVARCHAR(3)          NULL,
        is_merge_published      NVARCHAR(3)          NULL,
        CONSTRAINT PK_assessment_replication_status PRIMARY KEY (id),
        CONSTRAINT FK_replication_status_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 26. assessment_service_broker ───────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_service_broker', 'U') IS NULL
    CREATE TABLE dbo.assessment_service_broker (
        id                   BIGINT IDENTITY(1,1) NOT NULL,
        job_id               VARCHAR(36)          NOT NULL,
        database_name        NVARCHAR(128)        NOT NULL,
        broker_status        NVARCHAR(20)         NULL,
        user_queue_count     INT                  NULL,
        user_service_count   INT                  NULL,
        active_conversations INT                  NULL,
        CONSTRAINT PK_assessment_service_broker PRIMARY KEY (id),
        CONSTRAINT FK_service_broker_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );

-- ─── 28. sessions (multi-server assessment sessions) ──────────────────────────
IF OBJECT_ID('dbo.sessions', 'U') IS NULL
    CREATE TABLE dbo.sessions (
        session_id     VARCHAR(36)    NOT NULL,
        label          NVARCHAR(200)  NULL,
        status         VARCHAR(20)    NOT NULL DEFAULT 'pending',
        total_jobs     INT            NOT NULL DEFAULT 0,
        completed_jobs INT            NOT NULL DEFAULT 0,
        failed_jobs    INT            NOT NULL DEFAULT 0,
        created_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        completed_at   DATETIME2      NULL,
        CONSTRAINT PK_sessions PRIMARY KEY (session_id)
    );

-- Migration: add session tracking columns to existing jobs table
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.jobs') AND name = 'session_id')
    ALTER TABLE dbo.jobs ADD session_id VARCHAR(36) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.jobs') AND name = 'server_name')
    ALTER TABLE dbo.jobs ADD server_name NVARCHAR(300) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.jobs') AND name = 'database_name')
    ALTER TABLE dbo.jobs ADD database_name NVARCHAR(300) NULL;

-- Migration: add user_id to jobs and sessions
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.jobs') AND name = 'user_id')
    ALTER TABLE dbo.jobs ADD user_id VARCHAR(36) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sessions') AND name = 'user_id')
    ALTER TABLE dbo.sessions ADD user_id VARCHAR(36) NULL;

-- ─── 27. assessment_version_features ─────────────────────────────────────────
IF OBJECT_ID('dbo.assessment_version_features', 'U') IS NULL
    CREATE TABLE dbo.assessment_version_features (
        id                       BIGINT IDENTITY(1,1) NOT NULL,
        job_id                   VARCHAR(36)          NOT NULL,
        server_name              NVARCHAR(128)        NULL,
        product_version          NVARCHAR(50)         NULL,
        product_level            NVARCHAR(50)         NULL,
        product_update_level     NVARCHAR(50)         NULL,
        edition                  NVARCHAR(100)        NULL,
        engine_edition           NVARCHAR(10)         NULL,
        is_clustered             NVARCHAR(3)          NULL,
        hadr_enabled             NVARCHAR(3)          NULL,
        fulltext_installed       NVARCHAR(3)          NULL,
        clr_enabled              INT                  NULL,
        xp_cmdshell_enabled      INT                  NULL,
        ole_automation_enabled   INT                  NULL,
        adhoc_distributed_queries INT                 NULL,
        CONSTRAINT PK_assessment_version_features PRIMARY KEY (id),
        CONSTRAINT FK_version_features_jobs FOREIGN KEY (job_id)
            REFERENCES dbo.jobs (job_id) ON DELETE CASCADE
    );
