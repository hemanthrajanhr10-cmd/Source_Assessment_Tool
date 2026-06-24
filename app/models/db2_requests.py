"""
IBM Db2 for LUW assessment — request/response models.

Connection modes
  1. Direct TCP  — hostname:port reached from the app server directly
  2. Via Azure Hybrid Connection Manager (HCM) — ibm_db connects to a local
     HCM listener (127.0.0.1:hcm_local_port) which relays traffic through the
     Azure Service Bus relay to the on-prem Db2 server. No inbound firewall
     ports are required on the customer network.

Db2-specific concepts
  DPF          — Database Partitioning Feature (MPP, num_db_partitions > 1)
  BLU Accel.   — Column-organized in-memory processing (TABLEORG='C')
  RCAC         — Row and Column Access Control (fine-grained, per-row / per-column)
  Trusted Ctx  — Connection-level privilege scoping
  Federation   — Wrappers / remote servers / nicknames for remote data access
  WLM          — Workload Management (service classes, workloads, thresholds)
  MQTs         — Materialized Query Tables (pre-computed result sets)
  XSR          — XML Schema Repository
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


# ── Connection parameters ─────────────────────────────────────────────────────

class Db2ConnectionParams(BaseModel):
    # ── Direct Db2 TCP connection ─────────────────────────────────────────────
    hostname:    str  = Field(..., description="On-prem Db2 server hostname or IP (as registered in HCM endpoint)")
    port:        int  = Field(50000, description="Db2 port: 50000 plain, 50001 SSL")
    database:    str  = Field(..., description="Db2 database name (e.g. SAMPLE)")
    username:    str  = Field(..., description="Db2 user (must have CONNECT authority)")
    password:    str  = Field(..., description="Db2 password")
    ssl_enabled: bool = Field(False)
    ssl_server_certificate: Optional[str] = Field(None, description="Path to SSL server certificate (.arm/.pem)")

    # ── Azure Hybrid Connection Manager ───────────────────────────────────────
    use_hcm:            bool         = Field(False,       description="Route through local HCM listener instead of direct TCP")
    hcm_local_host:     str          = Field("127.0.0.1", description="Local HCM listener host (default 127.0.0.1)")
    hcm_local_port:     Optional[int]= Field(None,        description="Local HCM listener port (e.g. 5000)")
    hcm_relay_namespace:Optional[str]= Field(None,        description="Azure Service Bus namespace (display only)")
    hcm_connection_name:Optional[str]= Field(None,        description="Hybrid Connection name (display only)")

    # ── Scope / label ─────────────────────────────────────────────────────────
    schema_filter: Optional[str] = Field(None, description="Restrict extraction to one schema")
    label:         Optional[str] = Field(None, description="Human-readable assessment label")


# ── Instance / server ─────────────────────────────────────────────────────────

class Db2InstanceInfo(BaseModel):
    db2_version:        Optional[str] = None
    instance_name:      Optional[str] = None
    host_name:          Optional[str] = None
    service_level:      Optional[str] = None
    fix_pack_num:       Optional[int] = None
    platform:           Optional[str] = None
    bit_width:          Optional[str] = None
    num_db_partitions:  int           = 1
    is_dpf:             bool          = False
    is_puresale:        bool          = False


# ── Database metadata ─────────────────────────────────────────────────────────

class Db2DatabaseInfo(BaseModel):
    db_name:            str
    territory:          Optional[str] = None
    codeset:            Optional[str] = None
    collation_sequence: Optional[str] = None
    db_comment:         Optional[str] = None
    created_at:         Optional[str] = None
    catalog_node:       Optional[str] = None
    blu_enabled:        bool          = False


# ── Schema objects ────────────────────────────────────────────────────────────

class Db2Schema(BaseModel):
    schema_name: str
    owner:       Optional[str] = None
    create_time: Optional[str] = None
    table_count: int = 0
    view_count:  int = 0
    proc_count:  int = 0


class Db2Table(BaseModel):
    schema_name:      str
    table_name:       str
    table_type:       Optional[str] = None
    org_type:         Optional[str] = None   # R=row, C=column (BLU)
    row_count:        Optional[int] = None
    data_pages:       Optional[int] = None
    overflow_pages:   Optional[int] = None
    tablespace_name:  Optional[str] = None
    create_time:      Optional[str] = None
    alter_time:       Optional[str] = None
    is_column_org:    bool          = False


class Db2Column(BaseModel):
    schema_name:   str
    table_name:    str
    column_name:   str
    column_type:   Optional[str] = None
    length:        Optional[int] = None
    scale:         Optional[int] = None
    nulls:         Optional[str] = None
    default:       Optional[str] = None
    identity:      Optional[str] = None
    column_id:     Optional[int] = None
    col_card:      Optional[int] = None   # column cardinality
    num_nulls:     Optional[int] = None


class Db2Index(BaseModel):
    schema_name:    str
    table_name:     str
    index_name:     str
    uniquerule:     Optional[str]   = None   # U=unique, P=primary, D=duplicate
    index_type:     Optional[str]   = None
    clustered:      Optional[str]   = None
    nleaf:          Optional[int]   = None
    nlevels:        Optional[int]   = None
    clusterratio:   Optional[float] = None
    density:        Optional[float] = None
    index_columns:  Optional[str]   = None
    num_key_cols:   Optional[int]   = None


class Db2View(BaseModel):
    schema_name: str
    view_name:   str
    readonly:    Optional[str] = None
    create_time: Optional[str] = None


class Db2StoredProcedure(BaseModel):
    schema_name:  str
    proc_name:    str
    language:     Optional[str] = None
    parm_count:   Optional[int] = None
    create_time:  Optional[str] = None
    alter_time:   Optional[str] = None


class Db2Function(BaseModel):
    schema_name:   str
    func_name:     str
    func_type:     Optional[str] = None   # S=scalar, T=table, A=aggregate
    language:      Optional[str] = None
    create_time:   Optional[str] = None


class Db2Trigger(BaseModel):
    schema_name:   str
    trigger_name:  str
    table_schema:  Optional[str] = None
    table_name:    Optional[str] = None
    trigger_type:  Optional[str] = None
    trigger_time:  Optional[str] = None
    enabled:       Optional[str] = None
    create_time:   Optional[str] = None


class Db2Sequence(BaseModel):
    schema_name:   str
    seq_name:      str
    seq_type:      Optional[str] = None   # S=sequence, I=identity
    data_type:     Optional[str] = None
    start:         Optional[str] = None
    increment:     Optional[str] = None
    min_val:       Optional[str] = None
    max_val:       Optional[str] = None
    cycle:         Optional[str] = None   # Y/N
    create_time:   Optional[str] = None


class Db2UserDefinedType(BaseModel):
    schema_name:   str
    type_name:     str
    metatype:      Optional[str] = None   # S=structured, D=distinct
    source_name:   Optional[str] = None
    create_time:   Optional[str] = None


class Db2Package(BaseModel):
    pkg_schema:    str
    pkg_name:      str
    pkg_version:   Optional[str] = None
    language:      Optional[str] = None
    owner:         Optional[str] = None
    create_time:   Optional[str] = None


class Db2EventMonitor(BaseModel):
    evmonname:  str
    target_type:Optional[str] = None   # TABLE, FILE, PIPE, etc.
    enabled:    Optional[str] = None
    event_mon_group: Optional[str] = None


# ── Storage ───────────────────────────────────────────────────────────────────

class Db2Tablespace(BaseModel):
    tbspace:        str
    tbspace_type:   Optional[str] = None
    data_tag:       Optional[str] = None
    page_size:      Optional[int] = None
    extent_size:    Optional[int] = None
    prefetch_size:  Optional[int] = None
    total_pages:    Optional[int] = None
    usable_pages:   Optional[int] = None
    used_pages:     Optional[int] = None
    free_pages:     Optional[int] = None
    overhead:       Optional[float] = None
    bufferpool_name:Optional[str] = None
    utilization_pct:Optional[float] = None


class Db2Bufferpool(BaseModel):
    bpname:          str
    npages:          Optional[int]   = None
    automatic:       Optional[str]   = None
    pagesize:        Optional[int]   = None
    numblockpages:   Optional[int]   = None
    hit_ratio:       Optional[float] = None   # from MON_GET_BUFFERPOOL
    logical_reads:   Optional[int]   = None
    physical_reads:  Optional[int]   = None


class Db2StorageGroup(BaseModel):
    sgname:         str
    owner:          Optional[str] = None
    create_time:    Optional[str] = None
    default_tbspace:Optional[str] = None


# ── Configuration ─────────────────────────────────────────────────────────────

class Db2DbConfigParam(BaseModel):
    name:    str
    value:   Optional[str] = None
    default: Optional[str] = None
    flags:   Optional[str] = None


class Db2DbmConfigParam(BaseModel):
    name:    str
    value:   Optional[str] = None
    default: Optional[str] = None
    flags:   Optional[str] = None


# ── Security ──────────────────────────────────────────────────────────────────

class Db2SecuritySummary(BaseModel):
    total_users:             int = 0
    users_with_dbadm:        int = 0
    users_with_secadm:       int = 0
    users_with_dataaccess:   int = 0
    users_with_bindadd:      int = 0
    users_with_connect:      int = 0
    total_roles:             int = 0
    role_member_count:       int = 0
    rcac_row_permissions:    int = 0
    rcac_col_masks:          int = 0
    schemas_with_rcac:       int = 0
    trusted_contexts_count:  int = 0
    audit_policies_count:    int = 0
    table_grants_count:      int = 0
    column_grants_count:     int = 0
    schema_grants_count:     int = 0
    package_grants_count:    int = 0


# ── Performance / monitor ─────────────────────────────────────────────────────

class Db2PerformanceSummary(BaseModel):
    db_status:              Optional[str]   = None
    catalog_node_name:      Optional[str]   = None
    total_cons:             Optional[int]   = None
    appls_cur_cons:         Optional[int]   = None
    lock_waits:             Optional[int]   = None
    lock_timeouts:          Optional[int]   = None
    lock_escals:            Optional[int]   = None
    deadlocks:              Optional[int]   = None
    sort_overflows:         Optional[int]   = None
    rows_read:              Optional[int]   = None
    rows_written:           Optional[int]   = None
    pkg_cache_hit_ratio:    Optional[float] = None
    bp_hit_ratio:           Optional[float] = None
    log_utilization_pct:    Optional[float] = None
    total_log_used:         Optional[int]   = None
    total_log_available:    Optional[int]   = None
    db_heap_top:            Optional[int]   = None
    direct_reads:           Optional[int]   = None
    direct_writes:          Optional[int]   = None


class Db2ActiveConnection(BaseModel):
    agent_id:       Optional[int] = None
    appl_name:      Optional[str] = None
    appl_status:    Optional[str] = None
    authid:         Optional[str] = None
    client_platform:Optional[str] = None
    workload_name:  Optional[str] = None
    num_locks_held: Optional[int] = None
    status_change_time: Optional[str] = None


class Db2TopSql(BaseModel):
    stmt_text:          str
    exec_count:         Optional[int]   = None
    total_exec_time:    Optional[int]   = None   # microseconds
    avg_exec_time:      Optional[int]   = None
    rows_read:          Optional[int]   = None
    rows_returned:      Optional[int]   = None
    total_sorts:        Optional[int]   = None
    sort_overflows:     Optional[int]   = None


# ── Db2-specific features ─────────────────────────────────────────────────────

class Db2SpecificFeatures(BaseModel):
    # BLU Acceleration
    column_org_tables:      int  = 0
    row_org_tables:         int  = 0

    # RCAC
    rcac_row_permissions:   int  = 0
    rcac_col_masks:         int  = 0

    # Federation
    federation_enabled:     bool = False
    wrapper_count:          int  = 0
    server_count:           int  = 0
    nickname_count:         int  = 0

    # WLM
    wlm_service_classes:    int  = 0
    wlm_workloads:          int  = 0
    wlm_thresholds:         int  = 0

    # Object counts
    sequence_count:         int  = 0
    alias_count:            int  = 0
    mqt_count:              int  = 0
    typed_table_count:      int  = 0
    udt_count:              int  = 0
    event_monitor_count:    int  = 0
    package_count:          int  = 0
    xsr_count:              int  = 0
    storage_group_count:    int  = 0

    declared_temp_table_count: int = 0


# ── Object inventory ──────────────────────────────────────────────────────────

class Db2ObjectInventory(BaseModel):
    schema_count:        int = 0
    table_count:         int = 0
    column_count:        int = 0
    view_count:          int = 0
    index_count:         int = 0
    procedure_count:     int = 0
    function_count:      int = 0
    trigger_count:       int = 0
    sequence_count:      int = 0
    alias_count:         int = 0
    mqt_count:           int = 0
    udt_count:           int = 0
    package_count:       int = 0
    event_monitor_count: int = 0
    tablespace_count:    int = 0
    bufferpool_count:    int = 0
    storage_group_count: int = 0
    nickname_count:      int = 0
    wrapper_count:       int = 0


# ── Federation detail ─────────────────────────────────────────────────────────

class Db2FederationWrapper(BaseModel):
    wrapname:    str
    library:     Optional[str] = None
    create_time: Optional[str] = None


class Db2FederationServer(BaseModel):
    servername:  str
    servertype:  Optional[str] = None
    wrapname:    Optional[str] = None
    create_time: Optional[str] = None
    nickname_count: int = 0


# ── WLM detail ────────────────────────────────────────────────────────────────

class Db2WlmServiceClass(BaseModel):
    serviceclassname: str
    parentserviceclassname: Optional[str] = None
    enabled:          Optional[str] = None
    create_time:      Optional[str] = None


class Db2WlmWorkload(BaseModel):
    workloadname:  str
    enabled:       Optional[str] = None
    create_time:   Optional[str] = None


# ── Top-level assessment result ───────────────────────────────────────────────

class Db2AssessmentResult(BaseModel):
    job_id:      str
    label:       Optional[str]              = None
    assessed_at: str
    status:      Literal["completed", "failed"]
    error:       Optional[str]              = None

    # Connection details
    hostname:    Optional[str] = None
    database:    Optional[str] = None
    port:        Optional[int] = None
    via_hcm:     bool          = False
    hcm_relay_namespace: Optional[str] = None
    hcm_connection_name: Optional[str] = None

    # Core metadata
    instance_info:      Optional[Db2InstanceInfo]       = None
    database_info:      Optional[Db2DatabaseInfo]       = None
    object_inventory:   Optional[Db2ObjectInventory]    = None
    security_summary:   Optional[Db2SecuritySummary]    = None
    performance:        Optional[Db2PerformanceSummary] = None
    db2_features:       Optional[Db2SpecificFeatures]   = None

    # Detail lists — schema objects
    schemas:        Optional[list[Db2Schema]]          = None
    tables:         Optional[list[Db2Table]]           = None
    views:          Optional[list[Db2View]]            = None
    indexes:        Optional[list[Db2Index]]           = None
    procedures:     Optional[list[Db2StoredProcedure]] = None
    functions:      Optional[list[Db2Function]]        = None
    triggers:       Optional[list[Db2Trigger]]         = None
    sequences:      Optional[list[Db2Sequence]]        = None
    user_defined_types: Optional[list[Db2UserDefinedType]] = None
    packages:       Optional[list[Db2Package]]         = None
    event_monitors: Optional[list[Db2EventMonitor]]    = None

    # Detail lists — storage
    tablespaces:    Optional[list[Db2Tablespace]]      = None
    bufferpools:    Optional[list[Db2Bufferpool]]      = None
    storage_groups: Optional[list[Db2StorageGroup]]   = None

    # Detail lists — config
    db_config:      Optional[list[Db2DbConfigParam]]  = None
    dbm_config:     Optional[list[Db2DbmConfigParam]] = None

    # Detail lists — performance
    active_connections: Optional[list[Db2ActiveConnection]] = None
    top_sql:            Optional[list[Db2TopSql]]           = None

    # Detail lists — federation
    federation_wrappers: Optional[list[Db2FederationWrapper]] = None
    federation_servers:  Optional[list[Db2FederationServer]]  = None

    # Detail lists — WLM
    wlm_service_classes: Optional[list[Db2WlmServiceClass]] = None
    wlm_workloads:       Optional[list[Db2WlmWorkload]]     = None


# ── Job response models ───────────────────────────────────────────────────────

class Db2JobResponse(BaseModel):
    job_id:  str
    status:  str
    message: str


class Db2JobStatusResponse(BaseModel):
    job_id:           str
    status:           str
    label:            Optional[str] = None
    progress_message: Optional[str] = None
    error:            Optional[str] = None
    created_at:       str
    completed_at:     Optional[str] = None
    via_hcm:          bool          = False


class Db2SessionRecord(BaseModel):
    job_id:       str
    label:        Optional[str] = None
    status:       str
    hostname:     Optional[str] = None
    database:     Optional[str] = None
    created_at:   str
    completed_at: Optional[str] = None
    error:        Optional[str] = None
    results:      Optional[Db2AssessmentResult] = None
