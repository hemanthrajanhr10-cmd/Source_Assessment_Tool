"""
IBM Db2 for LUW Assessment Service — 35-step head-to-toe extraction.

Steps
  1   Test connection
  2   Instance information
  3   Database metadata
  4   Schemas
  5   Tables (all base tables with statistics)
  6   Views
  7   Columns (with cardinality / null statistics)
  8   Indexes (with cluster ratio / density)
  9   Stored procedures
  10  User-defined functions
  11  Triggers
  12  Sequences
  13  User-defined types (UDTs)
  14  Packages (compiled SQL access plans)
  15  Event monitors
  16  Tablespaces (with live utilization from MON_GET_TABLESPACE)
  17  Bufferpools (with live hit-ratio from MON_GET_BUFFERPOOL)
  18  Storage groups (Db2 10.5+)
  19  Database configuration (DBCFG)
  20  Database manager configuration (DBMCFG)
  21  Security — authority inventory
  22  Security — RCAC row permissions + column masks
  23  Security — roles, trusted contexts, audit policies, grants
  24  Performance — MON_GET_DATABASE snapshot
  25  Performance — active connections
  26  Performance — top SQL by total execution time
  27  WLM — service classes
  28  WLM — workloads
  29  Federation — wrappers
  30  Federation — servers + nicknames
  31  Db2 feature inventory (BLU, WLM, RCAC, XSR, Federation)
  32  Object inventory counts
  33  Build assessment result
  34  Generate 15-sheet Excel workbook
  35  Persist results to Azure SQL
"""

import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.logging import get_logger
from app.db import azure_store
from app.db import db2_client as client
from app.models.db2_requests import (
    Db2AssessmentResult, Db2ConnectionParams,
    Db2DatabaseInfo, Db2InstanceInfo, Db2ObjectInventory,
    Db2SecuritySummary, Db2PerformanceSummary, Db2SpecificFeatures,
    Db2Schema, Db2Table, Db2View, Db2Column, Db2Index,
    Db2StoredProcedure, Db2Function, Db2Trigger,
    Db2Sequence, Db2UserDefinedType, Db2Package, Db2EventMonitor,
    Db2Tablespace, Db2Bufferpool, Db2StorageGroup,
    Db2DbConfigParam, Db2DbmConfigParam,
    Db2ActiveConnection, Db2TopSql,
    Db2FederationWrapper, Db2FederationServer,
    Db2WlmServiceClass, Db2WlmWorkload,
    Db2JobResponse,
)

logger = get_logger(__name__)

_jobs: dict[str, dict] = {}


# ── Job management ────────────────────────────────────────────────────────────

def create_job(params: Db2ConnectionParams) -> str:
    job_id = str(uuid.uuid4())
    job: dict = {
        "job_id":           job_id,
        "label":            params.label,
        "hostname":         params.hostname,
        "database":         params.database,
        "status":           "pending",
        "progress_message": None,
        "error":            None,
        "via_hcm":          params.use_hcm,
        "created_at":       datetime.now(timezone.utc).isoformat(),
        "completed_at":     None,
        "results":          None,
        "excel_bytes":      None,
    }
    _jobs[job_id] = job
    try:
        azure_store.db2_upsert_session(job)
    except Exception as exc:
        logger.warning("db2_service: Azure persist on create failed — %s", exc)
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    if job_id in _jobs:
        return _jobs[job_id]
    try:
        row = azure_store.db2_get_session(job_id)
        if row:
            _jobs[job_id] = row
            return row
    except Exception as exc:
        logger.warning("db2_service: Azure lookup failed — %s", exc)
    return None


def list_jobs() -> list[dict]:
    try:
        return azure_store.db2_list_sessions()
    except Exception as exc:
        logger.warning("db2_service: Azure list failed — %s", exc)
        return list(_jobs.values())


def _update(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
    try:
        azure_store.db2_upsert_session(_jobs.get(job_id, {"job_id": job_id, **kwargs}))
    except Exception as exc:
        logger.warning("db2_service: Azure update failed — %s", exc)


# ── Excel workbook builder (15 sheets) ───────────────────────────────────────

def _build_excel(result: Db2AssessmentResult) -> bytes:
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from openpyxl.styles.numbers import FORMAT_NUMBER_COMMA_SEPARATED1
    except ImportError:
        logger.warning("openpyxl not installed — Excel export skipped")
        return b""

    # ── Palette ───────────────────────────────────────────────────────────────
    HDR_COLOR  = "1B5E4B"   # deep teal
    HDR2_COLOR = "4DA8A0"   # mid teal
    GOOD_COLOR = "D1FAE5"   # green pastel
    WARN_COLOR = "FEF3C7"   # amber pastel
    CRIT_COLOR = "FEE2E2"   # red pastel
    TEAL_LIGHT = "E6F7F5"

    HDR_FILL  = PatternFill("solid", fgColor=HDR_COLOR)
    HDR_FONT  = Font(bold=True, color="FFFFFF", size=10, name="Calibri")
    TITLE_FONT = Font(bold=True, size=16, color=HDR_COLOR, name="Calibri")
    SUB_FONT   = Font(bold=True, size=11, color=HDR2_COLOR, name="Calibri")
    BOLD       = Font(bold=True, name="Calibri")
    WRAP       = Alignment(wrap_text=True, vertical="top")
    THIN_BORDER = Border(
        bottom=Side(style="thin", color="CCCCCC"),
    )

    wb = openpyxl.Workbook()

    def _add_sheet(name: str):
        return wb.create_sheet(name)

    def _hrow(ws, cols: list[str], row: int = 1):
        for c, col in enumerate(cols, 1):
            cell = ws.cell(row=row, column=c, value=col)
            cell.fill = HDR_FILL
            cell.font = HDR_FONT
            cell.alignment = WRAP

    def _auto_width(ws, max_col_width: int = 60):
        for col in ws.columns:
            max_len = max((len(str(cell.value or "")) for cell in col), default=0)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, max_col_width)

    def _freeze(ws, cell: str = "A2"):
        ws.freeze_panes = cell

    def _kv_row(ws, r: int, key: str, value, bold_val: bool = False, fill_color: Optional[str] = None):
        k_cell = ws.cell(row=r, column=1, value=key)
        k_cell.font = BOLD
        v_cell = ws.cell(row=r, column=2, value=value)
        if bold_val:
            v_cell.font = BOLD
        if fill_color:
            v_cell.fill = PatternFill("solid", fgColor=fill_color)
        k_cell.border = THIN_BORDER
        v_cell.border = THIN_BORDER

    # ── Sheet 1: Summary ──────────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "IBM Db2 Assessment Report"
    ws["A1"].font = TITLE_FONT
    ws.merge_cells("A1:D1")
    ws.row_dimensions[1].height = 32

    kv: list[tuple] = [
        ("Assessed At",      result.assessed_at),
        ("Job ID",           result.job_id),
        ("Label",            result.label or "—"),
        ("Status",           result.status.upper()),
        ("", ""),
        ("── Connection", ""),
        ("Host",             result.hostname or "—"),
        ("Database",         result.database or "—"),
        ("Port",             str(result.port or "—")),
        ("Via HCM Relay",    "Yes" if result.via_hcm else "No"),
        ("HCM Namespace",    result.hcm_relay_namespace or "—"),
        ("HCM Connection",   result.hcm_connection_name or "—"),
        ("", ""),
        ("── Instance", ""),
    ]
    if result.instance_info:
        ii = result.instance_info
        kv += [
            ("Db2 Version",     ii.db2_version or "—"),
            ("Instance Name",   ii.instance_name or "—"),
            ("Server Hostname", ii.host_name or "—"),
            ("Platform",        ii.platform or "—"),
            ("Fix Pack",        str(ii.fix_pack_num or "—")),
            ("Partitions (DPF)", str(ii.num_db_partitions)),
            ("DPF Active",      "Yes" if ii.is_dpf else "No"),
        ]
    if result.database_info:
        di = result.database_info
        kv += [
            ("", ""),
            ("── Database", ""),
            ("DB Name",         di.db_name),
            ("BLU Acceleration","Enabled" if di.blu_enabled else "Disabled"),
        ]
    if result.object_inventory:
        inv = result.object_inventory
        kv += [
            ("", ""),
            ("── Object Inventory", ""),
            ("Schemas",          inv.schema_count),
            ("Tables",           inv.table_count),
            ("Columns",          inv.column_count),
            ("Views",            inv.view_count),
            ("Indexes",          inv.index_count),
            ("Procedures",       inv.procedure_count),
            ("Functions",        inv.function_count),
            ("Triggers",         inv.trigger_count),
            ("Sequences",        inv.sequence_count),
            ("UDTs",             inv.udt_count),
            ("Packages",         inv.package_count),
            ("Event Monitors",   inv.event_monitor_count),
            ("Tablespaces",      inv.tablespace_count),
            ("Bufferpools",      inv.bufferpool_count),
            ("Storage Groups",   inv.storage_group_count),
            ("Federation Wrappers", inv.wrapper_count),
            ("Nicknames",        inv.nickname_count),
        ]

    for r_idx, (k, v) in enumerate(kv, 3):
        if k.startswith("──"):
            ws.cell(row=r_idx, column=1, value=k).font = SUB_FONT
            ws.cell(row=r_idx, column=1).fill = PatternFill("solid", fgColor=TEAL_LIGHT)
            ws.merge_cells(f"A{r_idx}:D{r_idx}")
        elif k == "":
            pass
        else:
            _kv_row(ws, r_idx, k, v)

    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 52

    # ── Sheet 2: Object Inventory ─────────────────────────────────────────────
    ws2 = _add_sheet("Object Inventory")
    ws2["A1"] = "Object Inventory"
    ws2["A1"].font = TITLE_FONT
    _hrow(ws2, ["Object Type", "Count"], row=2)
    inv2 = result.object_inventory
    inv_rows = [
        ("Schemas",            inv2.schema_count        if inv2 else 0),
        ("Tables",             inv2.table_count         if inv2 else 0),
        ("Columns",            inv2.column_count        if inv2 else 0),
        ("Views",              inv2.view_count          if inv2 else 0),
        ("Indexes",            inv2.index_count         if inv2 else 0),
        ("Stored Procedures",  inv2.procedure_count     if inv2 else 0),
        ("User-Defined Functions", inv2.function_count  if inv2 else 0),
        ("Triggers",           inv2.trigger_count       if inv2 else 0),
        ("Sequences",          inv2.sequence_count      if inv2 else 0),
        ("User-Defined Types", inv2.udt_count           if inv2 else 0),
        ("Packages",           inv2.package_count       if inv2 else 0),
        ("Event Monitors",     inv2.event_monitor_count if inv2 else 0),
        ("Tablespaces",        inv2.tablespace_count    if inv2 else 0),
        ("Bufferpools",        inv2.bufferpool_count    if inv2 else 0),
        ("Storage Groups",     inv2.storage_group_count if inv2 else 0),
        ("Federation Wrappers",inv2.wrapper_count       if inv2 else 0),
        ("Nicknames",          inv2.nickname_count      if inv2 else 0),
    ]
    for r_idx, (lbl, cnt) in enumerate(inv_rows, 3):
        ws2.cell(r_idx, 1, lbl)
        ws2.cell(r_idx, 2, cnt)
    _auto_width(ws2)

    # ── Sheet 3: Schemas ──────────────────────────────────────────────────────
    ws3 = _add_sheet("Schemas")
    _hrow(ws3, ["Schema", "Owner", "Created", "Tables", "Views", "Procedures"])
    for r_idx, s in enumerate(result.schemas or [], 2):
        ws3.cell(r_idx, 1, s.schema_name)
        ws3.cell(r_idx, 2, s.owner)
        ws3.cell(r_idx, 3, str(s.create_time or ""))
        ws3.cell(r_idx, 4, s.table_count)
        ws3.cell(r_idx, 5, s.view_count)
        ws3.cell(r_idx, 6, s.proc_count)
    _auto_width(ws3); _freeze(ws3)

    # ── Sheet 4: Tables ───────────────────────────────────────────────────────
    ws4 = _add_sheet("Tables")
    _hrow(ws4, ["Schema", "Table", "Type", "Organization", "Row Count",
                "Data Pages", "Overflow Pages", "Tablespace", "BLU", "Created", "Last Altered"])
    for r_idx, t in enumerate(result.tables or [], 2):
        ws4.cell(r_idx,  1, t.schema_name)
        ws4.cell(r_idx,  2, t.table_name)
        ws4.cell(r_idx,  3, t.table_type)
        ws4.cell(r_idx,  4, "Column (BLU)" if t.is_column_org else "Row")
        ws4.cell(r_idx,  5, t.row_count)
        ws4.cell(r_idx,  6, t.data_pages)
        ws4.cell(r_idx,  7, t.overflow_pages)
        ws4.cell(r_idx,  8, t.tablespace_name)
        ws4.cell(r_idx,  9, "Yes" if t.is_column_org else "No")
        ws4.cell(r_idx, 10, str(t.create_time or ""))
        ws4.cell(r_idx, 11, str(t.alter_time  or ""))
        if t.is_column_org:
            for c in range(1, 12):
                ws4.cell(r_idx, c).fill = PatternFill("solid", fgColor="E0F2F1")
    _auto_width(ws4); _freeze(ws4)

    # ── Sheet 5: Views ────────────────────────────────────────────────────────
    ws5 = _add_sheet("Views")
    _hrow(ws5, ["Schema", "View Name", "Read Only", "Created"])
    for r_idx, v in enumerate(result.views or [], 2):
        ws5.cell(r_idx, 1, v.schema_name)
        ws5.cell(r_idx, 2, v.view_name)
        ws5.cell(r_idx, 3, v.readonly)
        ws5.cell(r_idx, 4, str(v.create_time or ""))
    _auto_width(ws5); _freeze(ws5)

    # ── Sheet 6: Indexes ──────────────────────────────────────────────────────
    ws6 = _add_sheet("Indexes")
    _hrow(ws6, ["Schema", "Table", "Index", "Unique Rule", "Type",
                "Clustered", "Num Levels", "Cluster Ratio %", "Density %", "Key Cols", "Index Columns"])
    for r_idx, ix in enumerate(result.indexes or [], 2):
        ws6.cell(r_idx,  1, ix.schema_name)
        ws6.cell(r_idx,  2, ix.table_name)
        ws6.cell(r_idx,  3, ix.index_name)
        ws6.cell(r_idx,  4, ix.uniquerule)
        ws6.cell(r_idx,  5, ix.index_type)
        ws6.cell(r_idx,  6, ix.clustered)
        ws6.cell(r_idx,  7, ix.nlevels)
        ws6.cell(r_idx,  8, ix.clusterratio)
        ws6.cell(r_idx,  9, ix.density)
        ws6.cell(r_idx, 10, ix.num_key_cols)
        ws6.cell(r_idx, 11, ix.index_columns)
        # Highlight poor cluster ratio
        cr = ix.clusterratio or 100
        if cr < 50:
            ws6.cell(r_idx, 8).fill = PatternFill("solid", fgColor="FEE2E2")
    _auto_width(ws6); _freeze(ws6)

    # ── Sheet 7: Procedures & Functions ──────────────────────────────────────
    ws7 = _add_sheet("Procedures & Functions")
    _hrow(ws7, ["Kind", "Schema", "Name", "Language", "Params / Return Type", "Created", "Altered"])
    r_idx = 2
    for p in (result.procedures or []):
        ws7.cell(r_idx, 1, "Stored Procedure")
        ws7.cell(r_idx, 2, p.schema_name)
        ws7.cell(r_idx, 3, p.proc_name)
        ws7.cell(r_idx, 4, p.language)
        ws7.cell(r_idx, 5, p.parm_count)
        ws7.cell(r_idx, 6, str(p.create_time or ""))
        ws7.cell(r_idx, 7, str(p.alter_time  or ""))
        r_idx += 1
    for f in (result.functions or []):
        ws7.cell(r_idx, 1, "User-Defined Function")
        ws7.cell(r_idx, 2, f.schema_name)
        ws7.cell(r_idx, 3, f.func_name)
        ws7.cell(r_idx, 4, f.language)
        ws7.cell(r_idx, 5, f.func_type)
        ws7.cell(r_idx, 6, str(f.create_time or ""))
        r_idx += 1
    _auto_width(ws7); _freeze(ws7)

    # ── Sheet 8: Triggers & Sequences ────────────────────────────────────────
    ws8 = _add_sheet("Triggers & Sequences")
    _hrow(ws8, ["Kind", "Schema", "Name", "Target Table", "Event", "Time", "Enabled / Type", "Data Type", "Created"])
    r_idx = 2
    for t in (result.triggers or []):
        ws8.cell(r_idx, 1, "Trigger")
        ws8.cell(r_idx, 2, t.schema_name)
        ws8.cell(r_idx, 3, t.trigger_name)
        ws8.cell(r_idx, 4, f"{t.table_schema}.{t.table_name}" if t.table_name else "")
        ws8.cell(r_idx, 5, t.trigger_type)
        ws8.cell(r_idx, 6, t.trigger_time)
        ws8.cell(r_idx, 7, t.enabled)
        ws8.cell(r_idx, 8, "")
        ws8.cell(r_idx, 9, str(t.create_time or ""))
        r_idx += 1
    for s in (result.sequences or []):
        ws8.cell(r_idx, 1, "Sequence")
        ws8.cell(r_idx, 2, s.schema_name)
        ws8.cell(r_idx, 3, s.seq_name)
        ws8.cell(r_idx, 4, "")
        ws8.cell(r_idx, 5, "")
        ws8.cell(r_idx, 6, "")
        ws8.cell(r_idx, 7, s.seq_type)
        ws8.cell(r_idx, 8, s.data_type)
        ws8.cell(r_idx, 9, str(s.create_time or ""))
        r_idx += 1
    _auto_width(ws8); _freeze(ws8)

    # ── Sheet 9: Tablespaces ──────────────────────────────────────────────────
    ws9 = _add_sheet("Tablespaces")
    _hrow(ws9, ["Tablespace", "Type", "Page Size (B)", "Extent Size",
                "Total Pages", "Usable Pages", "Used Pages", "Free Pages",
                "Utilization %", "Bufferpool"])
    for r_idx, ts in enumerate(result.tablespaces or [], 2):
        ws9.cell(r_idx,  1, ts.tbspace)
        ws9.cell(r_idx,  2, ts.tbspace_type)
        ws9.cell(r_idx,  3, ts.page_size)
        ws9.cell(r_idx,  4, ts.extent_size)
        ws9.cell(r_idx,  5, ts.total_pages)
        ws9.cell(r_idx,  6, ts.usable_pages)
        ws9.cell(r_idx,  7, ts.used_pages)
        ws9.cell(r_idx,  8, ts.free_pages)
        util = ts.utilization_pct
        ws9.cell(r_idx,  9, util)
        ws9.cell(r_idx, 10, ts.bufferpool_name)
        if util is not None:
            color = CRIT_COLOR if util > 90 else (WARN_COLOR if util > 75 else GOOD_COLOR)
            ws9.cell(r_idx, 9).fill = PatternFill("solid", fgColor=color[1:] if color.startswith("#") else color)
    _auto_width(ws9); _freeze(ws9)

    # ── Sheet 10: Bufferpools ─────────────────────────────────────────────────
    ws10 = _add_sheet("Bufferpools")
    _hrow(ws10, ["Bufferpool", "Pages", "Automatic", "Page Size (B)",
                 "Block Pages", "Logical Reads", "Physical Reads", "Hit Ratio %"])
    for r_idx, bp in enumerate(result.bufferpools or [], 2):
        ws10.cell(r_idx, 1, bp.bpname)
        ws10.cell(r_idx, 2, bp.npages)
        ws10.cell(r_idx, 3, bp.automatic)
        ws10.cell(r_idx, 4, bp.pagesize)
        ws10.cell(r_idx, 5, bp.numblockpages)
        ws10.cell(r_idx, 6, bp.logical_reads)
        ws10.cell(r_idx, 7, bp.physical_reads)
        ws10.cell(r_idx, 8, bp.hit_ratio)
        if bp.hit_ratio is not None:
            color = CRIT_COLOR if bp.hit_ratio < 80 else (WARN_COLOR if bp.hit_ratio < 90 else GOOD_COLOR)
            ws10.cell(r_idx, 8).fill = PatternFill("solid", fgColor=color)
    _auto_width(ws10); _freeze(ws10)

    # ── Sheet 11: Security Posture ────────────────────────────────────────────
    ws11 = _add_sheet("Security Posture")
    _hrow(ws11, ["Security Check", "Value", "Assessment"])
    if result.security_summary:
        s = result.security_summary
        sec_rows = [
            ("Users with DBADM",          s.users_with_dbadm,        "RISK: >3 DBADM users" if s.users_with_dbadm > 3 else "OK"),
            ("Users with SECADM",         s.users_with_secadm,       "OK"),
            ("Users with DATAACCESS",     s.users_with_dataaccess,   "OK"),
            ("Users with BINDADD",        s.users_with_bindadd,      "OK"),
            ("Users with CONNECT",        s.users_with_connect,      "OK"),
            ("Total Roles",               s.total_roles,             "OK"),
            ("Role Memberships",          s.role_member_count,       "OK"),
            ("RCAC Row Permissions",      s.rcac_row_permissions,    "Active" if s.rcac_row_permissions > 0 else "Not in use"),
            ("RCAC Column Masks",         s.rcac_col_masks,          "Active" if s.rcac_col_masks > 0 else "Not in use"),
            ("Trusted Contexts",          s.trusted_contexts_count,  "Configured" if s.trusted_contexts_count > 0 else "None"),
            ("Audit Policies",            s.audit_policies_count,    "Configured" if s.audit_policies_count > 0 else "WARNING: No audit policies"),
            ("Table Grants",              s.table_grants_count,      "OK"),
            ("Column-Level Grants",       s.column_grants_count,     "OK"),
            ("Schema Grants",             s.schema_grants_count,     "OK"),
            ("Package Grants",            s.package_grants_count,    "OK"),
        ]
        for r_idx, (k, v, assessment) in enumerate(sec_rows, 2):
            ws11.cell(r_idx, 1, k).font = BOLD
            ws11.cell(r_idx, 2, v)
            ws11.cell(r_idx, 3, assessment)
            if "RISK" in assessment or "WARNING" in assessment:
                ws11.cell(r_idx, 3).fill = PatternFill("solid", fgColor="FEE2E2")
    _auto_width(ws11)

    # ── Sheet 12: Performance ─────────────────────────────────────────────────
    ws12 = _add_sheet("Performance")
    # Part A: Summary
    ws12["A1"] = "A — Database Performance Summary"
    ws12["A1"].font = SUB_FONT
    _hrow(ws12, ["Metric", "Value", "Assessment"], row=2)
    if result.performance:
        p = result.performance
        perf_rows = [
            ("DB Status",                p.db_status,             "OK" if p.db_status == "ACTIVE" else "CHECK"),
            ("Total Connections",         p.total_cons,            "OK"),
            ("Current App Connections",   p.appls_cur_cons,        "OK"),
            ("Lock Waits",               p.lock_waits,            "HIGH" if (p.lock_waits or 0) > 1000 else "OK"),
            ("Lock Timeouts",            p.lock_timeouts,         "HIGH" if (p.lock_timeouts or 0) > 100 else "OK"),
            ("Lock Escalations",         p.lock_escals,           "HIGH" if (p.lock_escals or 0) > 0 else "OK"),
            ("Deadlocks",                p.deadlocks,             "CRITICAL" if (p.deadlocks or 0) > 0 else "OK"),
            ("Sort Overflows",           p.sort_overflows,        "HIGH" if (p.sort_overflows or 0) > 500 else "OK"),
            ("Rows Read",                p.rows_read,             "INFO"),
            ("Rows Written",             p.rows_written,          "INFO"),
            ("Bufferpool Hit Ratio %",   p.bp_hit_ratio,          "LOW — tune bufferpools" if (p.bp_hit_ratio or 100) < 90 else "OK"),
            ("Log Utilization %",        p.log_utilization_pct,   "HIGH" if (p.log_utilization_pct or 0) > 80 else "OK"),
            ("Direct Reads",             p.direct_reads,          "INFO"),
            ("Direct Writes",            p.direct_writes,         "INFO"),
        ]
        for r_idx, (k, v, asm) in enumerate(perf_rows, 3):
            ws12.cell(r_idx, 1, k).font = BOLD
            ws12.cell(r_idx, 2, v)
            ws12.cell(r_idx, 3, asm)
            if "CRITICAL" in asm:
                ws12.cell(r_idx, 3).fill = PatternFill("solid", fgColor="FEE2E2")
            elif "HIGH" in asm or "LOW" in asm:
                ws12.cell(r_idx, 3).fill = PatternFill("solid", fgColor="FEF3C7")
    # Part B: Active connections
    r_off = len(result.performance.__dict__) + 6 if result.performance else 6
    ws12.cell(r_off, 1, "B — Active Connections").font = SUB_FONT
    _hrow(ws12, ["Agent ID", "App Name", "Status", "Auth ID", "Platform", "Workload", "Locks Held", "Status Changed"], row=r_off + 1)
    for r_idx, ac in enumerate(result.active_connections or [], r_off + 2):
        ws12.cell(r_idx, 1, ac.agent_id)
        ws12.cell(r_idx, 2, ac.appl_name)
        ws12.cell(r_idx, 3, ac.appl_status)
        ws12.cell(r_idx, 4, ac.authid)
        ws12.cell(r_idx, 5, ac.client_platform)
        ws12.cell(r_idx, 6, ac.workload_name)
        ws12.cell(r_idx, 7, ac.num_locks_held)
        ws12.cell(r_idx, 8, str(ac.status_change_time or ""))
    _auto_width(ws12)

    # ── Sheet 13: Top SQL ─────────────────────────────────────────────────────
    ws13 = _add_sheet("Top SQL")
    _hrow(ws13, ["Rank", "SQL Statement", "Executions", "Total Time (µs)",
                 "Avg Time (µs)", "Rows Read", "Rows Returned", "Sort Overflows"])
    for r_idx, sql in enumerate(result.top_sql or [], 2):
        ws13.cell(r_idx, 1, r_idx - 1)
        ws13.cell(r_idx, 2, sql.stmt_text)
        ws13.cell(r_idx, 3, sql.exec_count)
        ws13.cell(r_idx, 4, sql.total_exec_time)
        ws13.cell(r_idx, 5, sql.avg_exec_time)
        ws13.cell(r_idx, 6, sql.rows_read)
        ws13.cell(r_idx, 7, sql.rows_returned)
        ws13.cell(r_idx, 8, sql.sort_overflows)
        ws13.cell(r_idx, 2).alignment = WRAP
    ws13.column_dimensions["B"].width = 80
    ws13.row_dimensions[1].height = 20
    _freeze(ws13)

    # ── Sheet 14: Db2 Features ────────────────────────────────────────────────
    ws14 = _add_sheet("Db2 Features")
    _hrow(ws14, ["Feature Area", "Feature", "Count / Status"])
    feat_rows = []
    if result.db2_features:
        f = result.db2_features
        feat_rows = [
            ("BLU Acceleration",   "Column-Organized Tables",     f.column_org_tables),
            ("BLU Acceleration",   "Row-Organized Tables",        f.row_org_tables),
            ("RCAC",               "Row Permissions",             f.rcac_row_permissions),
            ("RCAC",               "Column Masks",                f.rcac_col_masks),
            ("Federation",         "Enabled",                     "Yes" if f.federation_enabled else "No"),
            ("Federation",         "Wrappers",                    f.wrapper_count),
            ("Federation",         "Remote Servers",              f.server_count),
            ("Federation",         "Nicknames",                   f.nickname_count),
            ("WLM",                "Service Classes",             f.wlm_service_classes),
            ("WLM",                "Workloads",                   f.wlm_workloads),
            ("WLM",                "Thresholds",                  f.wlm_thresholds),
            ("Sequences",          "User Sequences",              f.sequence_count),
            ("Aliases",            "Aliases",                     f.alias_count),
            ("MQTs",               "Materialized Query Tables",   f.mqt_count),
            ("Typed Tables",       "Typed Tables",                f.typed_table_count),
            ("User-Defined Types", "UDTs",                        f.udt_count),
            ("Event Monitors",     "Event Monitors",              f.event_monitor_count),
            ("Packages",           "User Packages",               f.package_count),
            ("XSR",                "XML Schema Objects",          f.xsr_count),
            ("Storage Groups",     "Storage Groups",              f.storage_group_count),
        ]
    for r_idx, (area, feat, val) in enumerate(feat_rows, 2):
        ws14.cell(r_idx, 1, area)
        ws14.cell(r_idx, 2, feat)
        ws14.cell(r_idx, 3, val)
    _auto_width(ws14)

    # ── Sheet 15: DB & DBM Configuration ─────────────────────────────────────
    ws15 = _add_sheet("DB & DBM Configuration")
    _hrow(ws15, ["Source", "Parameter", "Current Value", "Flags"])
    r_idx = 2
    for p in (result.db_config or []):
        ws15.cell(r_idx, 1, "DBCFG")
        ws15.cell(r_idx, 2, p.name)
        ws15.cell(r_idx, 3, p.value)
        ws15.cell(r_idx, 4, p.flags)
        r_idx += 1
    for p in (result.dbm_config or []):
        ws15.cell(r_idx, 1, "DBMCFG")
        ws15.cell(r_idx, 2, p.name)
        ws15.cell(r_idx, 3, p.value)
        ws15.cell(r_idx, 4, p.flags)
        r_idx += 1
    _auto_width(ws15); _freeze(ws15)

    # ── Remove default "Sheet" if still present ───────────────────────────────
    if "Sheet" in wb.sheetnames:
        del wb["Sheet"]

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Assessment runner (35 steps) ──────────────────────────────────────────────

def run_assessment(job_id: str, params: Db2ConnectionParams) -> None:
    job = _jobs.get(job_id)
    if not job:
        return

    total = 35

    def step(n: int, msg: str):
        full = f"Step {n}/{total} — {msg}"
        _update(job_id, status="running", progress_message=full)
        logger.info("[db2:%s] %s", job_id[:8], full)

    def _safe(label: str, fn, *args, default=None):
        try:
            return fn(*args)
        except Exception as exc:
            logger.warning("[db2:%s] %s failed (non-fatal): %s", job_id[:8], label, exc)
            return default if default is not None else []

    try:
        # ── 1. Connect ────────────────────────────────────────────────────────
        step(1, "Testing connection")
        conn = client.open_connection(
            hostname=params.hostname,     port=params.port,
            database=params.database,     username=params.username,
            password=params.password,     ssl_enabled=params.ssl_enabled,
            ssl_server_certificate=params.ssl_server_certificate,
            use_hcm=params.use_hcm,      hcm_local_host=params.hcm_local_host,
            hcm_local_port=params.hcm_local_port,
        )

        # ── 2. Instance info ──────────────────────────────────────────────────
        step(2, "Collecting instance information")
        instance_info = Db2InstanceInfo(**client.get_instance_info(conn))

        # ── 3. Database info ──────────────────────────────────────────────────
        step(3, "Collecting database metadata")
        database_info = Db2DatabaseInfo(**client.get_database_info(conn, params.database))

        # ── 4. Schemas ────────────────────────────────────────────────────────
        step(4, "Enumerating schemas")
        schemas = [
            Db2Schema(
                schema_name=r.get("schemaname", ""),
                owner=r.get("owner"),
                create_time=str(r.get("create_time") or ""),
                table_count=int(r.get("table_count") or 0),
                view_count= int(r.get("view_count")  or 0),
                proc_count= int(r.get("proc_count")  or 0),
            )
            for r in client.get_schemas(conn, params.schema_filter)
        ]

        # ── 5. Tables ─────────────────────────────────────────────────────────
        step(5, "Enumerating tables with statistics")
        tables = [
            Db2Table(
                schema_name=r.get("schema_name",""),   table_name=r.get("table_name",""),
                table_type=r.get("table_type"),         org_type=r.get("org_type"),
                row_count=r.get("row_count"),           data_pages=r.get("data_pages"),
                overflow_pages=r.get("overflow_pages"), tablespace_name=r.get("tablespace_name"),
                create_time=str(r.get("create_time") or ""),
                alter_time= str(r.get("alter_time")  or ""),
                is_column_org=bool(r.get("is_column_org")),
            )
            for r in client.get_tables(conn, params.schema_filter)
        ]

        # ── 6. Views ──────────────────────────────────────────────────────────
        step(6, "Enumerating views")
        views = [
            Db2View(
                schema_name=r.get("schema_name",""), view_name=r.get("view_name",""),
                readonly=r.get("readonly"), create_time=str(r.get("create_time") or ""),
            )
            for r in client.get_views(conn, params.schema_filter)
        ]

        # ── 7. Columns ────────────────────────────────────────────────────────
        step(7, "Enumerating columns with cardinality statistics")
        raw_cols = _safe("columns", client.get_columns, conn, params.schema_filter, default=[])
        col_count = len(raw_cols)

        # ── 8. Indexes ────────────────────────────────────────────────────────
        step(8, "Enumerating indexes with cluster ratio and density")
        indexes = [
            Db2Index(
                schema_name=r.get("schema_name",""),  table_name=r.get("table_name",""),
                index_name=r.get("index_name",""),    uniquerule=r.get("uniquerule"),
                index_type=r.get("index_type"),       clustered=r.get("clustered"),
                nleaf=r.get("nleaf"),                 nlevels=r.get("nlevels"),
                clusterratio=r.get("clusterratio"),   density=r.get("density"),
                index_columns=r.get("index_columns"), num_key_cols=r.get("num_key_cols"),
            )
            for r in client.get_indexes(conn, params.schema_filter)
        ]

        # ── 9. Stored procedures ──────────────────────────────────────────────
        step(9, "Enumerating stored procedures")
        procedures = [
            Db2StoredProcedure(
                schema_name=r.get("schema_name",""), proc_name=r.get("proc_name",""),
                language=r.get("language"),          parm_count=r.get("parm_count"),
                create_time=str(r.get("create_time") or ""),
                alter_time= str(r.get("alter_time")  or ""),
            )
            for r in client.get_procedures(conn, params.schema_filter)
        ]

        # ── 10. Functions ─────────────────────────────────────────────────────
        step(10, "Enumerating user-defined functions")
        functions = [
            Db2Function(
                schema_name=r.get("schema_name",""), func_name=r.get("func_name",""),
                func_type=r.get("func_type"),        language=r.get("language"),
                create_time=str(r.get("create_time") or ""),
            )
            for r in client.get_functions(conn, params.schema_filter)
        ]

        # ── 11. Triggers ──────────────────────────────────────────────────────
        step(11, "Enumerating triggers")
        triggers = [
            Db2Trigger(
                schema_name=r.get("schema_name",""),   trigger_name=r.get("trigger_name",""),
                table_schema=r.get("table_schema"),    table_name=r.get("table_name"),
                trigger_type=r.get("trigger_type"),    trigger_time=r.get("trigger_time"),
                enabled=r.get("enabled"),              create_time=str(r.get("create_time") or ""),
            )
            for r in client.get_triggers(conn, params.schema_filter)
        ]

        # ── 12. Sequences ─────────────────────────────────────────────────────
        step(12, "Enumerating sequences")
        sequences = [
            Db2Sequence(
                schema_name=r.get("schema_name",""), seq_name=r.get("seq_name",""),
                seq_type=r.get("seq_type"),          data_type=r.get("data_type"),
                start=r.get("start"),                increment=r.get("increment"),
                min_val=r.get("min_val"),            max_val=r.get("max_val"),
                cycle=r.get("cycle"),                create_time=str(r.get("create_time") or ""),
            )
            for r in _safe("sequences", client.get_sequences, conn, params.schema_filter, default=[])
        ]

        # ── 13. User-defined types ────────────────────────────────────────────
        step(13, "Enumerating user-defined types")
        user_defined_types = [
            Db2UserDefinedType(
                schema_name=r.get("schema_name",""), type_name=r.get("type_name",""),
                metatype=r.get("metatype"),          source_name=r.get("source_name"),
                create_time=str(r.get("create_time") or ""),
            )
            for r in _safe("UDTs", client.get_user_defined_types, conn, params.schema_filter, default=[])
        ]

        # ── 14. Packages ──────────────────────────────────────────────────────
        step(14, "Enumerating compiled SQL packages")
        packages = [
            Db2Package(
                pkg_schema=r.get("pkg_schema",""), pkg_name=r.get("pkg_name",""),
                pkg_version=r.get("pkg_version"), language=r.get("language"),
                owner=r.get("owner"),             create_time=str(r.get("create_time") or ""),
            )
            for r in _safe("packages", client.get_packages, conn, params.schema_filter, default=[])
        ]

        # ── 15. Event monitors ────────────────────────────────────────────────
        step(15, "Enumerating event monitors")
        event_monitors = [
            Db2EventMonitor(
                evmonname=r.get("evmonname",""),      target_type=r.get("target_type"),
                enabled=r.get("enabled"),             event_mon_group=r.get("event_mon_group"),
            )
            for r in _safe("event monitors", client.get_event_monitors, conn, default=[])
        ]

        # ── 16. Tablespaces ───────────────────────────────────────────────────
        step(16, "Enumerating tablespaces with live utilization")
        tablespaces = [
            Db2Tablespace(
                tbspace=r.get("tbspace",""),         tbspace_type=r.get("tbspace_type"),
                data_tag=r.get("data_tag"),          page_size=r.get("page_size"),
                extent_size=r.get("extent_size"),    prefetch_size=r.get("prefetch_size"),
                total_pages=r.get("total_pages"),    usable_pages=r.get("usable_pages"),
                used_pages=r.get("used_pages"),      free_pages=r.get("free_pages"),
                overhead=r.get("overhead"),          bufferpool_name=r.get("bufferpool_name"),
                utilization_pct=r.get("utilization_pct"),
            )
            for r in client.get_tablespaces(conn)
        ]

        # ── 17. Bufferpools ───────────────────────────────────────────────────
        step(17, "Enumerating bufferpools with live hit-ratio")
        bufferpools = [
            Db2Bufferpool(
                bpname=r.get("bpname",""),       npages=r.get("npages"),
                automatic=r.get("automatic"),    pagesize=r.get("pagesize"),
                numblockpages=r.get("numblockpages"),
                hit_ratio=r.get("hit_ratio"),
                logical_reads=r.get("logical_reads"),
                physical_reads=r.get("physical_reads"),
            )
            for r in client.get_bufferpools(conn)
        ]

        # ── 18. Storage groups ────────────────────────────────────────────────
        step(18, "Enumerating storage groups")
        storage_groups = [
            Db2StorageGroup(
                sgname=r.get("sgname",""),  owner=r.get("owner"),
                create_time=str(r.get("create_time") or ""),
                default_tbspace=r.get("default_tbspace"),
            )
            for r in _safe("storage groups", client.get_storage_groups, conn, default=[])
        ]

        # ── 19. DB config ─────────────────────────────────────────────────────
        step(19, "Collecting database configuration (DBCFG)")
        db_config = [
            Db2DbConfigParam(
                name=r.get("name",""),  value=str(r.get("value") or ""),
                default=str(r.get("default_val") or ""), flags=r.get("flags"),
            )
            for r in client.get_db_config(conn)
        ]

        # ── 20. DBM config ────────────────────────────────────────────────────
        step(20, "Collecting database manager configuration (DBMCFG)")
        dbm_config = [
            Db2DbmConfigParam(
                name=r.get("name",""),  value=str(r.get("value") or ""),
                default=str(r.get("default_val") or ""), flags=r.get("flags"),
            )
            for r in _safe("DBMCFG", client.get_dbm_config, conn, default=[])
        ]

        # ── 21-23. Security ───────────────────────────────────────────────────
        step(21, "Collecting authority inventory (AUTHORIZATIONIDS)")
        step(22, "Collecting RCAC row permissions and column masks")
        step(23, "Collecting roles, trusted contexts, audit policies, grants")
        sec_raw = client.get_security_summary(conn)
        security_summary = Db2SecuritySummary(**sec_raw)

        # ── 24. Performance snapshot ──────────────────────────────────────────
        step(24, "Collecting performance snapshot (MON_GET_DATABASE)")
        try:
            perf_raw = client.get_performance_summary(conn)
            performance = Db2PerformanceSummary(**perf_raw)
        except Exception as exc:
            logger.warning("[db2:%s] performance stats failed (non-fatal): %s", job_id[:8], exc)
            performance = Db2PerformanceSummary()

        # ── 25. Active connections ────────────────────────────────────────────
        step(25, "Enumerating active connections (SYSIBMADM.APPLICATIONS)")
        active_connections = [
            Db2ActiveConnection(
                agent_id=r.get("agent_id"),            appl_name=r.get("appl_name"),
                appl_status=r.get("appl_status"),      authid=r.get("authid"),
                client_platform=r.get("client_platform"),
                workload_name=r.get("workload_name"),
                num_locks_held=r.get("num_locks_held"),
                status_change_time=str(r.get("status_change_time") or ""),
            )
            for r in _safe("active connections", client.get_active_connections, conn, default=[])
        ]

        # ── 26. Top SQL ───────────────────────────────────────────────────────
        step(26, "Extracting top SQL by execution time (MON_GET_PKG_CACHE_STMT)")
        top_sql = [
            Db2TopSql(
                stmt_text=r.get("stmt_text",""),
                exec_count=r.get("exec_count"),
                total_exec_time=r.get("total_exec_time"),
                avg_exec_time=r.get("avg_exec_time"),
                rows_read=r.get("rows_read"),
                rows_returned=r.get("rows_returned"),
                total_sorts=r.get("total_sorts"),
                sort_overflows=r.get("sort_overflows"),
            )
            for r in _safe("top SQL", client.get_top_sql, conn, default=[])
        ]

        # ── 27-28. WLM ────────────────────────────────────────────────────────
        step(27, "Collecting WLM service classes")
        wlm_service_classes = [
            Db2WlmServiceClass(
                serviceclassname=r.get("serviceclassname",""),
                parentserviceclassname=r.get("parentserviceclassname"),
                enabled=r.get("enabled"),
                create_time=str(r.get("create_time") or ""),
            )
            for r in _safe("WLM service classes", client.get_wlm_service_classes, conn, default=[])
        ]

        step(28, "Collecting WLM workloads")
        wlm_workloads = [
            Db2WlmWorkload(
                workloadname=r.get("workloadname",""),
                enabled=r.get("enabled"),
                create_time=str(r.get("create_time") or ""),
            )
            for r in _safe("WLM workloads", client.get_wlm_workloads, conn, default=[])
        ]

        # ── 29-30. Federation ─────────────────────────────────────────────────
        step(29, "Collecting federation wrappers")
        fed_wrappers = [
            Db2FederationWrapper(
                wrapname=r.get("wrapname",""), library=r.get("library"),
                create_time=str(r.get("create_time") or ""),
            )
            for r in _safe("federation wrappers", client.get_federation_wrappers, conn, default=[])
        ]

        step(30, "Collecting federation servers and nicknames")
        fed_servers = [
            Db2FederationServer(
                servername=r.get("servername",""),   servertype=r.get("servertype"),
                wrapname=r.get("wrapname"),          create_time=str(r.get("create_time") or ""),
                nickname_count=int(r.get("nickname_count") or 0),
            )
            for r in _safe("federation servers", client.get_federation_servers, conn, default=[])
        ]

        # ── 31. Db2 feature inventory ─────────────────────────────────────────
        step(31, "Calculating Db2 feature inventory (BLU, WLM, RCAC, XSR, Federation)")
        feat_raw = client.get_db2_specific_features(conn)
        db2_features = Db2SpecificFeatures(**feat_raw)

        # ── 32. Object inventory ──────────────────────────────────────────────
        step(32, "Building complete object inventory")
        object_inventory = Db2ObjectInventory(
            schema_count=        len(schemas),
            table_count=         len(tables),
            column_count=        col_count,
            view_count=          len(views),
            index_count=         len(indexes),
            procedure_count=     len(procedures),
            function_count=      len(functions),
            trigger_count=       len(triggers),
            sequence_count=      len(sequences),
            alias_count=         db2_features.alias_count,
            mqt_count=           db2_features.mqt_count,
            udt_count=           len(user_defined_types),
            package_count=       len(packages),
            event_monitor_count= len(event_monitors),
            tablespace_count=    len(tablespaces),
            bufferpool_count=    len(bufferpools),
            storage_group_count= len(storage_groups),
            nickname_count=      db2_features.nickname_count,
            wrapper_count=       db2_features.wrapper_count,
        )

        conn.close()

        # ── 33. Build result ──────────────────────────────────────────────────
        step(33, "Assembling assessment result")
        result = Db2AssessmentResult(
            job_id=          job_id,
            label=           params.label,
            assessed_at=     datetime.now(timezone.utc).isoformat(),
            status=          "completed",
            hostname=        params.hostname,
            database=        params.database,
            port=            params.port,
            via_hcm=         params.use_hcm,
            hcm_relay_namespace= params.hcm_relay_namespace,
            hcm_connection_name= params.hcm_connection_name,
            instance_info=       instance_info,
            database_info=       database_info,
            object_inventory=    object_inventory,
            security_summary=    security_summary,
            performance=         performance,
            db2_features=        db2_features,
            schemas=             schemas,
            tables=              tables[:3000],
            views=               views[:2000],
            indexes=             indexes[:5000],
            procedures=          procedures,
            functions=           functions,
            triggers=            triggers,
            sequences=           sequences,
            user_defined_types=  user_defined_types,
            packages=            packages[:500],
            event_monitors=      event_monitors,
            tablespaces=         tablespaces,
            bufferpools=         bufferpools,
            storage_groups=      storage_groups,
            db_config=           db_config,
            dbm_config=          dbm_config,
            active_connections=  active_connections,
            top_sql=             top_sql,
            federation_wrappers= fed_wrappers,
            federation_servers=  fed_servers,
            wlm_service_classes= wlm_service_classes,
            wlm_workloads=       wlm_workloads,
        )

        # ── 34. Generate Excel ────────────────────────────────────────────────
        step(34, "Generating 15-sheet Excel workbook")
        excel_bytes = _build_excel(result)

        # ── 35. Persist ───────────────────────────────────────────────────────
        step(35, "Persisting results to Azure SQL")
        _update(
            job_id,
            status=           "completed",
            progress_message= "Assessment complete — 35 steps, 15-sheet Excel generated.",
            completed_at=     datetime.now(timezone.utc).isoformat(),
            results=          result.model_dump(),
            excel_bytes=      excel_bytes,
        )

    except Exception as exc:
        msg = str(exc)
        logger.error("[db2:%s] assessment failed — %s", job_id[:8], msg)
        _update(
            job_id,
            status=           "failed",
            error=            msg,
            progress_message= f"Failed: {msg[:200]}",
            completed_at=     datetime.now(timezone.utc).isoformat(),
        )
