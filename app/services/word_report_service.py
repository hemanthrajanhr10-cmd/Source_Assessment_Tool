"""
Word report builder: generates a Microsoft Fabric Assessment Report (.docx)
from raw SQL Server assessment data, following the standard UBTI template.
"""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from app.core.logging import get_logger

logger = get_logger(__name__)

# ─── Brand colours ──────────────────────────────────────────────────────────

_DARK_BLUE  = RGBColor(0x1F, 0x38, 0x64)   # headings / cover
_MID_BLUE   = RGBColor(0x2E, 0x75, 0xB6)   # section titles
_TBL_HEADER = RGBColor(0x1F, 0x4E, 0x79)   # table header row bg
_TBL_ALT    = RGBColor(0xBD, 0xD7, 0xEE)   # alternating row bg
_TBL_ALT2   = RGBColor(0xDE, 0xEA, 0xF1)   # lighter alt
_WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
_DARK_GRAY  = RGBColor(0x40, 0x40, 0x40)


# ─── Low-level XML helpers ───────────────────────────────────────────────────

def _hex(c: RGBColor) -> str:
    return f"{c[0]:02X}{c[1]:02X}{c[2]:02X}"


def _set_cell_bg(cell, colour: RGBColor) -> None:
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  _hex(colour))
    tcPr.append(shd)


def _cell_borders(tbl) -> None:
    """Apply thin borders to every cell in the table."""
    for row in tbl.rows:
        for cell in row.cells:
            tc   = cell._tc
            tcPr = tc.get_or_add_tcPr()
            tcBorders = OxmlElement("w:tcBorders")
            for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
                border = OxmlElement(f"w:{side}")
                border.set(qn("w:val"),   "single")
                border.set(qn("w:sz"),    "4")
                border.set(qn("w:space"), "0")
                border.set(qn("w:color"), "AAAAAA")
                tcBorders.append(border)
            tcPr.append(tcBorders)


def _para_shading(para, colour: RGBColor) -> None:
    pPr  = para._p.get_or_add_pPr()
    shd  = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  _hex(colour))
    pPr.append(shd)


# ─── Style helpers ──────────────────────────────────────────────────────────

def _set_font(run, bold=False, size=10, colour: RGBColor = _DARK_GRAY, italic=False):
    run.bold   = bold
    run.italic = italic
    run.font.size  = Pt(size)
    run.font.color.rgb = colour
    run.font.name  = "Calibri"


def _heading(doc: Document, text: str, level: int = 1, colour: RGBColor = _DARK_BLUE) -> None:
    p = doc.add_heading(text, level=level)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    for run in p.runs:
        run.font.color.rgb = colour
        run.font.name = "Calibri"


def _sub_heading(doc: Document, text: str, colour: RGBColor = _MID_BLUE) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    _set_font(run, bold=True, size=12, colour=colour)
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(4)


def _body(doc: Document, text: str) -> None:
    p = doc.add_paragraph(text)
    for run in p.runs:
        _set_font(run, size=10)


# ─── Table builder ──────────────────────────────────────────────────────────

def _make_table(
    doc: Document,
    headers: list[str],
    rows: list[list[str]],
    col_widths: list[float] | None = None,
) -> None:
    """
    Renders a styled table.
    - Header row: dark-blue bg, white bold text
    - Data rows: alternating white / light-blue bg
    """
    n_cols  = len(headers)
    n_rows  = max(len(rows), 1)          # at least one blank data row
    tbl     = doc.add_table(rows=1 + n_rows, cols=n_cols)
    tbl.style = "Table Grid"

    # ── header ──────────────────────────────────────────────────────────────
    hdr_row = tbl.rows[0]
    for i, h in enumerate(headers):
        cell = hdr_row.cells[i]
        _set_cell_bg(cell, _TBL_HEADER)
        cell.paragraphs[0].clear()
        run = cell.paragraphs[0].add_run(h)
        _set_font(run, bold=True, size=9, colour=_WHITE)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT

    # ── data rows ────────────────────────────────────────────────────────────
    for ri, row_data in enumerate(rows or [[""] * n_cols]):
        tbl_row = tbl.rows[ri + 1]
        bg      = _TBL_ALT if ri % 2 == 0 else _TBL_ALT2
        for ci, val in enumerate(row_data):
            cell = tbl_row.cells[ci]
            _set_cell_bg(cell, bg)
            cell.paragraphs[0].clear()
            run = cell.paragraphs[0].add_run(str(val) if val is not None else "")
            _set_font(run, size=9)

    # ── column widths ────────────────────────────────────────────────────────
    if col_widths:
        for col_idx, w in enumerate(col_widths):
            for row in tbl.rows:
                row.cells[col_idx].width = Cm(w)

    _cell_borders(tbl)
    doc.add_paragraph()   # spacer after table


# ─── Helpers to extract data ─────────────────────────────────────────────────

def _str(v: Any, default: str = "—") -> str:
    if v is None or (isinstance(v, float) and v != v):
        return default
    return str(v).strip() or default


def _overview(raw: dict) -> dict:
    """Return the overview dict (first item if it's a list)."""
    ov = raw.get("overview") or {}
    if isinstance(ov, list):
        ov = ov[0] if ov else {}
    return ov


# ─── Main builder ────────────────────────────────────────────────────────────

def build_word_report(job_id: str, raw: dict[str, Any]) -> bytes:
    """
    Build the Word (.docx) report and return raw bytes (no disk write).
    """
    doc = Document()

    # ── Page margins ──────────────────────────────────────────────────────────
    for section in doc.sections:
        section.top_margin    = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    ov = _overview(raw)
    db_name  = _str(ov.get("database_name"), "Unknown Database")
    srv_name = _str(raw.get("_server") or ov.get("server_name"), "")
    run_date = datetime.utcnow().strftime("%d %b %Y")

    # ════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ════════════════════════════════════════════════════════════════════════
    doc.add_paragraph()
    doc.add_paragraph()

    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_p.add_run("Microsoft Fabric Assessment Report")
    _set_font(title_run, bold=True, size=28, colour=_DARK_BLUE)

    doc.add_paragraph()
    doc.add_paragraph()
    doc.add_paragraph()

    client_p = doc.add_paragraph()
    client_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    c_run = client_p.add_run(f"Client:  {db_name}")
    _set_font(c_run, bold=True, size=14, colour=_DARK_BLUE)

    date_p = doc.add_paragraph()
    date_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    d_run = date_p.add_run(f"Date:  {run_date}")
    _set_font(d_run, bold=True, size=12, colour=_MID_BLUE)

    doc.add_page_break()

    # ════════════════════════════════════════════════════════════════════════
    # 1. ASSESSMENT OF EXISTING DATA INFRASTRUCTURE
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Assessment of Existing Data Infrastructure", level=1)

    # ── Inbound Systems ──────────────────────────────────────────────────────
    _sub_heading(doc, "Inbound Systems")
    linked = raw.get("linked_servers") or []
    ls_rows = [
        [_str(r.get("linked_server_name")), _str(r.get("product") or r.get("provider"))]
        for r in linked
    ] if linked else [["SQL Server (source)", srv_name or db_name]]
    _make_table(doc, ["Source Systems", "Details"], ls_rows)

    # ── Outbound Systems ─────────────────────────────────────────────────────
    _sub_heading(doc, "Outbound Systems")
    _make_table(doc, ["Destination Systems", "Details"],
                [["Microsoft Fabric (OneLake)", "Target for migration"]])

    # ── Types of Services ────────────────────────────────────────────────────
    _sub_heading(doc, "Types of Services offered")
    svc_rows = [["SQL Server Database", "Relational database – OLTP / DW workloads"]]
    cross_db = raw.get("cross_db_references") or []
    if cross_db:
        svc_rows.append(["Cross-DB References", f"{len(cross_db)} cross-database object references found"])
    broker = raw.get("service_broker") or []
    if broker and any(r.get("broker_status") == "Enabled" for r in broker):
        svc_rows.append(["Service Broker", "Enabled – asynchronous messaging in use"])
    _make_table(doc, ["Services", "Description"], svc_rows)

    # ── Data Source Availability ──────────────────────────────────────────────
    _sub_heading(doc, "Data Source Availability by Data Format and Type")
    avail_rows = [
        ["Relational (SQL)",    "Azure SQL / SQL Server",      "Yes"],
        ["Structured Tables",  f"{_str(ov.get('table_count'))} tables", "Yes"],
        ["Views",              f"{_str(ov.get('view_count'))} views",   "Yes"],
        ["Stored Procedures",  f"{_str(ov.get('stored_proc_count'))} procedures", "Yes"],
    ]
    clr = raw.get("clr_assemblies") or []
    if clr:
        avail_rows.append(["CLR Assembly",  f"{len(clr)} CLR assemblies", "Yes"])
    _make_table(doc, ["Data Format", "Data Source Type", "Is Available"], avail_rows)

    # ── Database Overview ─────────────────────────────────────────────────────
    _sub_heading(doc, "Database Overview")
    size_mb  = ov.get("total_size_mb")
    size_gb  = f"{size_mb / 1024:.2f}" if size_mb else "—"
    db_type  = "Datawarehouse" if "dw" in db_name.lower() or "warehouse" in db_name.lower() else "Transaction"
    db_rows  = [[db_name, size_gb, db_type, "—"]]
    _make_table(doc, ["DB Name", "Database Size (GB)", "Database Type", "Data Growth Rate"], db_rows)

    _sub_heading(doc, "Summary")
    _make_table(
        doc,
        ["Data Type", "Sum of Database Size (GB)", "Count of Server Name"],
        [[db_type, size_gb, "1"]],
    )

    # ── Data Loading Method ───────────────────────────────────────────────────
    _sub_heading(doc, "Data Loading Method")
    agent_jobs = raw.get("sql_agent_jobs") or []
    if agent_jobs:
        load_rows = [[_str(j.get("job_name")), "SQL Agent Job", "1"] for j in agent_jobs[:10]]
    else:
        load_rows = [["—", "—", "—"]]
    _make_table(doc, ["Data Loading Process", "Details", "No of Jobs"], load_rows)

    # ── Data Refresh Frequency ────────────────────────────────────────────────
    _sub_heading(doc, "Data Refresh Frequency")
    if agent_jobs:
        freq_rows = [
            [_str(j.get("job_name")), _str(j.get("schedule") or "Scheduled"), "—"]
            for j in agent_jobs[:10]
        ]
    else:
        freq_rows = [["—", "—", "—"]]
    _make_table(doc, ["Job Name", "Frequency", "Duration"], freq_rows)

    # ════════════════════════════════════════════════════════════════════════
    # 2. DATA LIFECYCLE MANAGEMENT
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Data Lifecycle Management", level=1)

    # ── Data Access Controls ──────────────────────────────────────────────────
    _sub_heading(doc, "Data Access Controls")
    _body(doc, "User permissions / Role-based access")
    users_roles = raw.get("db_users_roles") or []
    if users_roles:
        ur_rows = [
            [_str(r.get("user_name") or r.get("name")),
             _str(r.get("role_name") or r.get("type_desc") or "Database User")]
            for r in users_roles[:20]
        ]
    else:
        ur_rows = [["—", "—"]]
    _make_table(doc, ["User / Role", "Actions"], ur_rows)

    # ── Data Privacy and Compliance ───────────────────────────────────────────
    _sub_heading(doc, "Data Privacy and Compliance")
    pii = raw.get("pii_indicators") or []
    if pii:
        pii_rows = [
            [_str(r.get("sensitivity_label") or r.get("pii_type") or "PII Detected"),
             _str(r.get("column_name") or r.get("table_name"))]
            for r in pii[:20]
        ]
    else:
        pii_rows = [["No PII indicators detected", "—"]]
    _make_table(doc, ["Data Privacy and Compliance", "Column Names"], pii_rows)

    # ── Data Quality Metrics ──────────────────────────────────────────────────
    _sub_heading(doc, "Data Quality Metrics")
    null_analysis = raw.get("null_analysis") or []
    if null_analysis:
        dq_rows = [
            [
                f"Null check: {_str(r.get('table_name'))}.{_str(r.get('column_name'))}",
                "Automated null analysis",
                "Data team",
                f"{_str(r.get('null_percentage') or r.get('null_pct'))}% nulls",
            ]
            for r in null_analysis[:10]
        ]
    else:
        dq_rows = [["NA", "NA", "NA", "NA"]]
    _make_table(doc, ["Data Quality Rules", "User Notification", "Recipients", "Resolution"], dq_rows)

    # ── Security Auditing and Logging ─────────────────────────────────────────
    _sub_heading(doc, "Security Auditing and Logging")
    tde = raw.get("tde_status") or []
    enc = raw.get("column_encryption") or []
    audit_rows = []
    if tde:
        for r in tde:
            audit_rows.append([
                "TDE (Transparent Data Encryption)",
                _str(r.get("encryption_state_desc") or r.get("state")),
                _str(r.get("encryptor_type") or "—"),
            ])
    if enc:
        audit_rows.append([
            "Always Encrypted",
            f"{len(enc)} encrypted column(s) found",
            "Column-level encryption",
        ])
    if not audit_rows:
        audit_rows = [["—", "—", "—"]]
    _make_table(doc, ["Auditing", "Description", "Path / Error Details"], audit_rows)

    # ════════════════════════════════════════════════════════════════════════
    # 3. DEPLOYMENT METHOD (Current)
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Deployment Method", level=1)
    _sub_heading(doc, "Deployment Details")
    _make_table(
        doc,
        ["System Name", "Deployment Tool/Method", "Deployment Environment", "Deployment Contact Email"],
        [[db_name, "SQL Server", "On-Premises / Azure SQL", "—"]],
    )

    # ════════════════════════════════════════════════════════════════════════
    # 4. ASSESSMENT FOR BUSINESS INTELLIGENCE REPORTS
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Assessment for Business Intelligence Reports", level=1)

    _sub_heading(doc, "SSRS Report Details")
    _make_table(doc, ["Number of Reports", "Number of Data sources", "Number of Tables"],
                [["—", "—", _str(ov.get("table_count"))]])

    _sub_heading(doc, "Power BI Report Details")
    _make_table(doc,
                ["Number of Reports", "Number of Data sources", "Scheduled Refresh", "Number of Tables"],
                [["—", "—", "—", _str(ov.get("table_count"))]])

    _sub_heading(doc, "Subscription Details")
    _make_table(doc, ["Report Name", "Subscription Schedule", "Delivery Method", "Time"],
                [["—", "—", "—", "—"]])

    # ════════════════════════════════════════════════════════════════════════
    # 5. IMPLEMENTATIONS IN FABRIC
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Implementations in Fabric", level=1)

    _sub_heading(doc, "Data Loading Method – One Time Load")
    _make_table(doc,
                ["Data Loading Process", "Details", "No of Jobs", "Email Notification for Job"],
                [["Full load – OneLake ingestion", "Migrate all historical data to Fabric Lakehouse", "1", "—"]])

    _sub_heading(doc, "Data Loading Method – Incremental Load")
    if agent_jobs:
        inc_rows = [
            [_str(j.get("job_name")), "Incremental delta load", "1", "—"]
            for j in agent_jobs[:5]
        ]
    else:
        inc_rows = [["Incremental Pipeline", "Delta load based on watermark column", "—", "—"]]
    _make_table(doc,
                ["Data Loading Process", "Details", "No of Jobs", "Email Notification for Job"],
                inc_rows)

    _sub_heading(doc, "Logging")
    _make_table(doc, ["Auditing", "Description", "Path / Error Details"], [["—", "—", "—"]])
    _body(doc, "Log table details")
    _make_table(doc, ["Table name", "Description"], [["—", "—"], ["—", "—"]])

    _sub_heading(doc, "Refresh Frequency")
    _make_table(doc, ["Data Refresh Frequency", "Yes/No", "Time"],
                [["Scheduled Lakehouse refresh", "Yes", "—"]])

    _sub_heading(doc, "Report Implementation")
    _make_table(doc,
                ["Number of Reports", "Semantic Model Implementation", "Scheduled Refresh", "Number of Tables"],
                [["—", "Direct Lake mode", "Yes", _str(ov.get("table_count"))]])

    _sub_heading(doc, "Subscription Details")
    _make_table(doc, ["Report Name", "Subscription Schedule", "Delivery Method", "Time"],
                [["—", "—", "—", "—"]])

    # ════════════════════════════════════════════════════════════════════════
    # 6. FABRIC RECOMMENDATIONS
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Fabric Recommendations", level=1)

    _sub_heading(doc, "Data Science")
    _make_table(doc, ["Scenario", "Description", "Algorithms/models"],
                [["Predictive Analytics", "Leverage historical transaction data for ML models", "AutoML / Notebooks"]])

    _sub_heading(doc, "Data Activator")
    _make_table(doc, ["Scenario", "Description", "Alerts (Teams/Mail)"],
                [["Anomaly Detection", "Trigger alerts on data quality thresholds", "Teams + Email"]])

    _sub_heading(doc, "Data Retention Method")
    _body(doc, "Recommended: Fabric OneLake with tiered storage (Hot → Cool → Archive) based on data age and access frequency.")

    _sub_heading(doc, "Data Security")
    dyn_sql = raw.get("dynamic_sql_usage") or []
    sec_rows = [
        ["Row-Level Security",  "Implement RLS in semantic models",              "Yes"],
        ["Column Masking",      f"PII columns detected: {len(pii)}",             "Yes" if pii else "No"],
        ["Dynamic SQL Risk",    f"{len(dyn_sql)} procedure(s) use dynamic SQL",  "Review" if dyn_sql else "No"],
    ]
    _make_table(doc, ["Activity", "Description", "Yes/No"], sec_rows)

    _sub_heading(doc, "Data Quality Metrics")
    _make_table(doc, ["Data Quality Rules", "Alert Through"],
                [["Null value threshold breach", "Teams Notification"],
                 ["Duplicate row detection",     "Email Alert"]])

    _sub_heading(doc, "Data Governance")
    gov_rows = [
        ["Microsoft Purview",    "Cataloguing and lineage tracking for all Fabric items", "Yes"],
        ["Sensitivity Labels",   f"Apply labels to {len(pii)} PII column(s)",             "Yes" if pii else "No"],
        ["Data Lineage",         "Track data flow from SQL Server → Lakehouse → Report",  "Yes"],
    ]
    _make_table(doc, ["Activity", "Description", "Yes/No"], gov_rows)

    # ════════════════════════════════════════════════════════════════════════
    # 7. DEPLOYMENT METHOD (Fabric)
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Deployment Method (Fabric)", level=1)
    _sub_heading(doc, "Deployment Details")
    _make_table(
        doc,
        ["System Name", "Deployment Tool/Method", "Deployment Environment",
         "Deployment Frequency", "Deployment Contact Email"],
        [["Microsoft Fabric", "Fabric Deployment Pipelines", "Dev → UAT → Prod", "On-demand / Sprint", "—"]],
    )

    # ════════════════════════════════════════════════════════════════════════
    # 8. COST ANALYSIS & LICENSING
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Cost Analysis & Licensing Details", level=1)

    _sub_heading(doc, "Compute & Storage Details - Fabric")
    _make_table(
        doc,
        ["Environment", "Region", "Compute SKU", "Storage", "Storage Cost", "Monthly Cost (Fabric SKU + Storage)"],
        [["Production", "—", "F64 (recommended)", f"{size_gb} GB", "—", "—"],
         ["Development", "—", "F4 (trial)",        "—",             "—", "—"]],
    )

    _sub_heading(doc, "Azure DevOps")
    _make_table(doc, ["Plan Type", "Users", "Monthly Cost Per User", "Total Monthly Cost"],
                [["Basic", "—", "$6", "—"]])

    # ════════════════════════════════════════════════════════════════════════
    # 9. MIGRATION RECOMMENDATIONS
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Migration Recommendations", level=1)

    _sub_heading(doc, "Migration Items")
    table_count = _str(ov.get("table_count"), "0")
    view_count  = _str(ov.get("view_count"),  "0")
    proc_count  = _str(ov.get("stored_proc_count"), "0")
    _make_table(
        doc,
        ["Environment", "No. of Cubes", "No. of Tables", "No. of Alerts", "No. of Reports"],
        [["Production", "—", table_count, "—", view_count]],
    )

    _sub_heading(doc, "Migration Timeline")
    _make_table(doc, ["PoC", "Items Delivered"],
                [["PoC 1", f"Schema + {table_count} table ingestion"],
                 ["PoC 2", "Report migration + semantic model"]])
    _make_table(doc, ["No. of Months", "Resources", "No. of Weeks"],
                [["3–6", "2 Data Engineers + 1 BI Developer", "12–24"]])

    # ════════════════════════════════════════════════════════════════════════
    # 10. BACKUP PLAN & RELEASE STRATEGY
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Backup Plan & Release Strategy", level=1)
    _sub_heading(doc, "Implementation Steps")
    steps = [
        "1. Source Assessment – Validate connectivity, schema, and data volumes.",
        "2. Proof of Concept – Migrate a subset of tables to Fabric Lakehouse.",
        "3. Full Migration – Incremental pipelines for all databases.",
        "4. Validation – Data reconciliation between source and Fabric.",
        "5. Cutover – Redirect reports and consumers to Fabric semantic model.",
        "6. Decommission – Retire legacy SQL Server / SSRS infrastructure.",
    ]
    for step in steps:
        p = doc.add_paragraph(step, style="List Number")
        for run in p.runs:
            _set_font(run, size=10)

    # ════════════════════════════════════════════════════════════════════════
    # 11. CONCLUSION
    # ════════════════════════════════════════════════════════════════════════
    _heading(doc, "Conclusion", level=1)

    _sub_heading(doc, "Summary of Findings")
    vf = raw.get("version_features") or []
    version_str = _str(vf[0].get("sql_version") if vf else None, "SQL Server")
    summary_lines = [
        f"Database assessed:  {db_name}",
        f"SQL Server version: {version_str}",
        f"Total tables:       {_str(ov.get('table_count'))}",
        f"Total views:        {_str(ov.get('view_count'))}",
        f"Stored procedures:  {_str(ov.get('stored_proc_count'))}",
        f"Functions:          {_str(ov.get('function_count'))}",
        f"Database size:      {size_gb} GB",
        f"PII indicators:     {len(pii)} column(s)",
        f"Orphaned users:     {len(raw.get('orphaned_users') or [])}",
        f"Dynamic SQL usage:  {len(dyn_sql)} object(s)",
    ]
    for line in summary_lines:
        _body(doc, line)

    _sub_heading(doc, "Final Recommendations")
    recs = [
        "Migrate to Microsoft Fabric Lakehouse using Data Factory pipelines.",
        "Implement row-level security and sensitivity labels for PII columns.",
        "Replace SQL Agent jobs with Fabric Data Activator triggers.",
        "Adopt Direct Lake mode for Power BI reports to eliminate import overhead.",
        "Use Microsoft Purview for unified data governance and lineage.",
    ]
    for rec in recs:
        p = doc.add_paragraph(f"• {rec}")
        for run in p.runs:
            _set_font(run, size=10)

    _sub_heading(doc, "Appendices")
    _body(doc, f"Full schema details, index coverage, and null analysis are available in the companion Excel report (job ID: {job_id}).")

    # ── Serialise to bytes ───────────────────────────────────────────────────
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    logger.info("Word report built for job %s (%d bytes)", job_id, len(buf.getvalue()))
    return buf.getvalue()
