"""
Word report builder — Microsoft Fabric Assessment Report (.docx)
Matches the UBTI template: cover page, page header/footer, branded tables.
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

# ── Engine metadata ──────────────────────────────────────────────────────────

_ENGINE_LABEL: dict[str, str] = {
    "mssql":    "SQL Server",
    "postgres": "PostgreSQL",
    "mysql":    "MySQL",
    "oracle":   "Oracle",
}

_DOC_TITLE = "Source Assessment Report"  # appended to engine label on cover

# ── Brand colours (matching PDF template) ───────────────────────────────────
_DARK_BLUE   = RGBColor(0x1F, 0x38, 0x64)   # Main headings / cover title
_MID_BLUE    = RGBColor(0x2E, 0x75, 0xB6)   # Sub-headings
_TBL_HEADER  = RGBColor(0x1F, 0x4E, 0x79)   # Table header row background
_TBL_ROW1    = RGBColor(0xBD, 0xD7, 0xEE)   # Alternating row 1
_TBL_ROW2    = RGBColor(0xDE, 0xEA, 0xF1)   # Alternating row 2
_WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
_DARK_GRAY   = RGBColor(0x26, 0x26, 0x26)
_LIGHT_GRAY  = RGBColor(0xF2, 0xF2, 0xF2)
_ACCENT_BLUE = RGBColor(0x1F, 0x56, 0x9E)   # Header bar colour


def _h(c: RGBColor) -> str:
    return f"{c[0]:02X}{c[1]:02X}{c[2]:02X}"


# ── XML helpers ──────────────────────────────────────────────────────────────

def _shd(cell, colour: RGBColor) -> None:
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  _h(colour))
    tcPr.append(shd)


def _borders(tbl) -> None:
    for row in tbl.rows:
        for cell in row.cells:
            tc   = cell._tc
            tcPr = tc.get_or_add_tcPr()
            b    = OxmlElement("w:tcBorders")
            for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
                el = OxmlElement(f"w:{side}")
                el.set(qn("w:val"),   "single")
                el.set(qn("w:sz"),    "4")
                el.set(qn("w:space"), "0")
                el.set(qn("w:color"), "B0C4DE")
                b.append(el)
            tcPr.append(b)


def _cell_vert_center(cell) -> None:
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    va   = OxmlElement("w:vAlign")
    va.set(qn("w:val"), "center")
    tcPr.append(va)


def _page_number_field(para, prefix: str = "Page ", sep: str = " of ") -> None:
    """Insert 'Page X of Y' field into paragraph."""
    para.clear()
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    run = para.add_run(prefix)
    run.font.name = "Calibri"
    run.font.size = Pt(9)
    run.font.color.rgb = _DARK_GRAY

    # PAGE field
    r = OxmlElement("w:r")
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    r.append(fld)
    para._p.append(r)

    r2 = OxmlElement("w:r")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    r2.append(instr)
    para._p.append(r2)

    r3 = OxmlElement("w:r")
    fld2 = OxmlElement("w:fldChar")
    fld2.set(qn("w:fldCharType"), "end")
    r3.append(fld2)
    para._p.append(r3)

    run2 = para.add_run(sep)
    run2.font.name = "Calibri"
    run2.font.size = Pt(9)
    run2.font.color.rgb = _DARK_GRAY

    # NUMPAGES field
    r4 = OxmlElement("w:r")
    fld3 = OxmlElement("w:fldChar")
    fld3.set(qn("w:fldCharType"), "begin")
    r4.append(fld3)
    para._p.append(r4)

    r5 = OxmlElement("w:r")
    instr2 = OxmlElement("w:instrText")
    instr2.set(qn("xml:space"), "preserve")
    instr2.text = " NUMPAGES "
    r5.append(instr2)
    para._p.append(r5)

    r6 = OxmlElement("w:r")
    fld4 = OxmlElement("w:fldChar")
    fld4.set(qn("w:fldCharType"), "end")
    r6.append(fld4)
    para._p.append(r6)


def _para_shd(para, colour: RGBColor) -> None:
    pPr = para._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  _h(colour))
    pPr.append(shd)


# ── Style helpers ────────────────────────────────────────────────────────────

def _font(run, bold=False, size=10, colour: RGBColor = _DARK_GRAY,
          italic=False, name="Calibri"):
    run.bold       = bold
    run.italic     = italic
    run.font.size  = Pt(size)
    run.font.color.rgb = colour
    run.font.name  = name


def _setup_header(doc: Document, client_name: str, doc_title: str = "Source Assessment Report") -> None:
    """Add branded header: blue left bar | title center | company right."""
    section = doc.sections[0]
    section.different_first_page_header_footer = True   # cover page has no header

    header = section.header
    header.is_linked_to_previous = False

    # Clear default paragraph
    for p in header.paragraphs:
        p.clear()

    hdr_tbl = header.add_table(1, 3, width=Cm(16))
    hdr_tbl.style = "Table Grid"

    # Left cell — blue accent bar
    lc = hdr_tbl.cell(0, 0)
    lc.width = Cm(0.5)
    _shd(lc, _ACCENT_BLUE)
    lc.paragraphs[0].clear()

    # Centre cell — document title
    mc = hdr_tbl.cell(0, 1)
    mc.width = Cm(11)
    _shd(mc, _LIGHT_GRAY)
    mc.paragraphs[0].clear()
    r = mc.paragraphs[0].add_run(doc_title)
    _font(r, bold=True, size=10, colour=_DARK_BLUE)
    mc.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
    _cell_vert_center(mc)

    # Right cell — company name
    rc = hdr_tbl.cell(0, 2)
    rc.width = Cm(4.5)
    _shd(rc, _LIGHT_GRAY)
    rc.paragraphs[0].clear()
    r2 = rc.paragraphs[0].add_run("Unlimited Innovations\nIndia Pvt. Ltd")
    _font(r2, bold=True, size=8, colour=_MID_BLUE)
    rc.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _cell_vert_center(rc)

    # Remove table borders
    for row in hdr_tbl.rows:
        for cell in row.cells:
            tc   = cell._tc
            tcPr = tc.get_or_add_tcPr()
            b    = OxmlElement("w:tcBorders")
            for side in ("top", "left", "bottom", "right"):
                el = OxmlElement(f"w:{side}")
                el.set(qn("w:val"), "none")
                b.append(el)
            tcPr.append(b)

    header.add_paragraph()   # small spacer


def _setup_footer(doc: Document) -> None:
    """Add 'Page X of Y' footer."""
    section = doc.sections[0]
    footer  = section.footer
    footer.is_linked_to_previous = False

    # Separator line
    sep = footer.paragraphs[0]
    sep.clear()
    sep.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = sep.add_run("─" * 60)
    _font(sr, size=6, colour=RGBColor(0xAA, 0xAA, 0xAA))

    # Page number paragraph
    pn = footer.add_paragraph()
    _page_number_field(pn)


# ── Cover page ───────────────────────────────────────────────────────────────

def _cover_page(doc: Document, client_name: str, run_date: str, doc_title: str = "Source Assessment Report") -> None:
    # Blue accent banner at top of cover
    banner = doc.add_paragraph()
    _para_shd(banner, _ACCENT_BLUE)
    br = banner.add_run("  ")
    _font(br, size=28, colour=_WHITE)
    banner.paragraph_format.space_before = Pt(0)
    banner.paragraph_format.space_after  = Pt(0)

    # Spacer rows
    for _ in range(8):
        sp = doc.add_paragraph()
        sp.paragraph_format.space_before = Pt(0)
        sp.paragraph_format.space_after  = Pt(6)

    # Main title
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = title_p.add_run(doc_title)
    _font(tr, bold=True, size=26, colour=_DARK_BLUE)
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after  = Pt(40)

    # Spacers before client block
    for _ in range(6):
        sp = doc.add_paragraph()
        sp.paragraph_format.space_before = Pt(0)
        sp.paragraph_format.space_after  = Pt(6)

    # Client name (right-aligned)
    cp = doc.add_paragraph()
    cp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    cr = cp.add_run(f"Client:  {client_name}")
    _font(cr, bold=True, size=14, colour=_DARK_BLUE)
    cp.paragraph_format.space_after = Pt(6)

    # Date (right-aligned)
    dp = doc.add_paragraph()
    dp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    dr = dp.add_run(f"Date:    {run_date}")
    _font(dr, bold=True, size=12, colour=_MID_BLUE)
    dp.paragraph_format.space_after = Pt(40)

    doc.add_page_break()


# ── Section heading helpers ──────────────────────────────────────────────────

def _h1(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    _para_shd(p, _DARK_BLUE)
    r = p.add_run(f"  {text}")
    _font(r, bold=True, size=14, colour=_WHITE)
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after  = Pt(6)


def _h2(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    r = p.add_run(text)
    _font(r, bold=True, size=12, colour=_MID_BLUE)
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(4)


def _body(doc: Document, text: str) -> None:
    p = doc.add_paragraph(text)
    for r in p.runs:
        _font(r, size=10)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after  = Pt(2)


# ── Table builder ────────────────────────────────────────────────────────────

def _table(
    doc: Document,
    headers: list[str],
    rows: list[list[str]],
    col_widths: list[float] | None = None,
) -> None:
    n_cols = len(headers)
    data   = rows if rows else [["—"] * n_cols]
    tbl    = doc.add_table(rows=1 + len(data), cols=n_cols)
    tbl.style = "Table Grid"

    # Header row
    hr = tbl.rows[0]
    for i, h in enumerate(headers):
        cell = hr.cells[i]
        _shd(cell, _TBL_HEADER)
        _cell_vert_center(cell)
        cell.paragraphs[0].clear()
        run = cell.paragraphs[0].add_run(h)
        _font(run, bold=True, size=9, colour=_WHITE)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
        cell.paragraphs[0].paragraph_format.space_before = Pt(2)
        cell.paragraphs[0].paragraph_format.space_after  = Pt(2)

    # Data rows
    for ri, row_data in enumerate(data):
        bg = _TBL_ROW1 if ri % 2 == 0 else _TBL_ROW2
        tr = tbl.rows[ri + 1]
        for ci, val in enumerate(row_data):
            cell = tr.cells[ci]
            _shd(cell, bg)
            _cell_vert_center(cell)
            cell.paragraphs[0].clear()
            txt = str(val) if val is not None else ""
            run = cell.paragraphs[0].add_run(txt)
            _font(run, size=9)
            cell.paragraphs[0].paragraph_format.space_before = Pt(2)
            cell.paragraphs[0].paragraph_format.space_after  = Pt(2)

    if col_widths:
        for ci, w in enumerate(col_widths):
            for row in tbl.rows:
                row.cells[ci].width = Cm(w)

    _borders(tbl)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)


# ── Data helpers ─────────────────────────────────────────────────────────────

def _s(v: Any, default: str = "—") -> str:
    if v is None:
        return default
    s = str(v).strip()
    return s if s else default


def _overview(raw: dict) -> dict:
    ov = raw.get("overview") or {}
    if isinstance(ov, list):
        ov = ov[0] if ov else {}
    return ov


# ── Per-database content sections ─────────────────────────────────────────────

def _write_db_sections(
    doc: Document,
    raw: dict,
    db_label: str,
    server_label: str,
    db_type: str = "mssql",
) -> None:
    """Write all assessment sections for one database into doc."""
    engine    = _ENGINE_LABEL.get(db_type, db_type.upper())
    mssql     = db_type == "mssql"
    ov        = _overview(raw)
    db_name   = _s(ov.get("database_name"), db_label)
    size_mb   = ov.get("total_size_mb")
    size_gb   = f"{float(size_mb) / 1024:.2f}" if size_mb else "—"
    db_workload = ("Datawarehouse"
                   if any(k in db_name.lower() for k in ("dw", "warehouse", "mart", "dwh"))
                   else "Transaction")
    tbl_count = _s(ov.get("table_count"))
    view_count = _s(ov.get("view_count"))
    proc_count = _s(ov.get("stored_proc_count"))
    fn_count   = _s(ov.get("function_count"))

    pii       = raw.get("pii_indicators") or []
    dyn_sql   = raw.get("dynamic_sql_usage") or []
    tde       = raw.get("tde_status") or []
    enc       = raw.get("column_encryption") or []
    linked    = raw.get("linked_servers") or []
    agent_jobs = raw.get("sql_agent_jobs") or []
    cross_db  = raw.get("cross_db_references") or []
    broker    = raw.get("service_broker") or []
    users_roles = raw.get("db_users_roles") or []
    orphaned  = raw.get("orphaned_users") or []
    null_a    = raw.get("null_analysis") or []
    vf        = raw.get("version_features") or []
    version_str = _s(vf[0].get("product_version") if vf else None, "—")
    edition     = _s(vf[0].get("edition") if vf else None, "—")

    # ── 1. Existing Data Infrastructure ─────────────────────────────────────
    _h1(doc, "Assessment of Existing Data Infrastructure")

    _h2(doc, "Inbound Systems")
    if linked:
        ls_rows = [[_s(r.get("linked_server_name")), _s(r.get("product") or r.get("provider"))]
                   for r in linked]
    else:
        ls_rows = [[f"{engine} (source)", server_label or db_name]]
    _table(doc, ["Source Systems", "Details"], ls_rows, [7, 9])

    _h2(doc, "Outbound Systems")
    _table(doc, ["Destination Systems", "Details"],
           [["Microsoft Fabric (OneLake)", "Target for migration"]], [7, 9])

    _h2(doc, "Types of Services offered")
    svc = [[f"{engine} – Relational DB", f"{db_workload} workloads"]]
    if cross_db:
        svc.append(["Cross-DB References", f"{len(cross_db)} references detected"])
    if broker and any(r.get("broker_status") == "Enabled" for r in broker):
        svc.append(["Service Broker", "Enabled – asynchronous messaging"])
    _table(doc, ["Services", "Description"], svc, [7, 9])

    _h2(doc, "Data Source Availability by Data Format and Type")
    avail = [
        ["Relational (SQL)",   engine,                    "Yes"],
        ["Structured Tables",  f"{tbl_count} tables",     "Yes"],
        ["Views",              f"{view_count} views",     "Yes"],
        ["Stored Procedures",  f"{proc_count} procedures","Yes"],
        ["Functions",          f"{fn_count} functions",   "Yes"],
    ]
    if mssql and raw.get("clr_assemblies"):
        avail.append(["CLR Assemblies", f"{len(raw['clr_assemblies'])} found", "Yes"])
    _table(doc, ["Data Format", "Data Source Type", "Is Available"], avail, [5, 7, 4])

    _h2(doc, "Database Overview")
    _table(doc,
           ["DB Name", "Database Size (GB)", "Database Type", "Data Growth Rate"],
           [[db_name, size_gb, db_workload, "—"]], [5, 4, 4, 3])

    _h2(doc, "Summary")
    _table(doc,
           ["Data Type", "Sum of Database Size (GB)", "Count of Server Name"],
           [[db_workload, size_gb, "1"]], [5, 6, 5])

    _h2(doc, "Data Loading Method")
    if mssql and agent_jobs:
        load_rows = [[_s(j.get("job_name")), "SQL Agent Job", "1"] for j in agent_jobs[:10]]
    else:
        load_rows = [["Scheduled pipeline / cron", f"{engine} source", "—"]]
    _table(doc, ["Data Loading Process", "Details", "No of Jobs"], load_rows, [6, 7, 3])

    _h2(doc, "Data Refresh Frequency")
    if mssql and agent_jobs:
        freq_rows = [[_s(j.get("job_name")), _s(j.get("schedule") or "Scheduled"), "—"]
                     for j in agent_jobs[:10]]
    else:
        freq_rows = [["—", "Scheduled", "—"]]
    _table(doc, ["JobName", "Frequency", "Duration"], freq_rows, [7, 5, 4])

    # ── 2. Data Lifecycle Management ─────────────────────────────────────────
    _h1(doc, "Data Lifecycle Management")

    _h2(doc, "Data Access Controls")
    _body(doc, "User permissions / Role-based access")
    if users_roles:
        ur_rows = [[_s(r.get("principal_name") or r.get("user_name")),
                    _s(r.get("roles") or r.get("principal_type") or "DB User")]
                   for r in users_roles[:20]]
    else:
        ur_rows = [["—", "—"]]
    _table(doc, ["User / Role", "Actions"], ur_rows, [8, 8])

    _h2(doc, "Data Privacy and Compliance")
    if pii:
        pii_rows = [[_s(r.get("pii_category") or "PII"),
                     f"{_s(r.get('schema_name'))}.{_s(r.get('table_name'))}.{_s(r.get('column_name'))}"]
                    for r in pii[:20]]
    else:
        pii_rows = [["No PII indicators detected", "—"]]
    _table(doc, ["Data Privacy and Compliance", "Column Names"], pii_rows, [6, 10])

    _h2(doc, "Data Quality Metrics")
    if null_a:
        dq_rows = [[
            f"Null check: {_s(r.get('table_name'))}.{_s(r.get('column_name'))}",
            "Automated",
            "Data team",
            f"{_s(r.get('null_blank_pct') or r.get('null_percentage'))}% nulls",
        ] for r in null_a[:10]]
    else:
        dq_rows = [["NA", "NA", "NA", "NA"]]
    _table(doc, ["Data Quality Rules", "User Notification", "Recipients", "Resolution"],
           dq_rows, [5, 4, 3, 4])

    _h2(doc, "Security Auditing and Logging")
    audit_rows = []
    for r in tde:
        audit_rows.append([
            "TDE",
            _s(r.get("encryption_state") or r.get("tde_status")),
            _s(r.get("key_algorithm") or "—"),
        ])
    if enc:
        audit_rows.append(["Always Encrypted", f"{len(enc)} column(s)", "Column-level"])
    if not audit_rows:
        audit_rows = [["—", "—", "—"]]
    _table(doc, ["Auditing", "Description", "Path / Error Details"], audit_rows, [5, 6, 5])

    # ── 3. Deployment Method (existing) ──────────────────────────────────────
    _h1(doc, "Deployment Method")

    _h2(doc, "Deployment Details")
    _table(doc,
           ["System Name", "Deployment Tool/Method", "Deployment Environment", "Deployment Contact Email"],
           [[db_name, engine, server_label or "On-Premises / Cloud", "—"]],
           [4, 4, 4, 4])

    # ── 4. BI Reports Assessment ─────────────────────────────────────────────
    _h1(doc, "Assessment for Business Intelligence Reports")

    _h2(doc, "SSRS Report Details")
    _table(doc, ["Number of Reports", "Number of Data sources", "Number of Tables"],
           [["—", "—", tbl_count]], [5, 6, 5])

    _h2(doc, "Power BI Report Details")
    _table(doc,
           ["Number of Reports", "Number of Data sources", "Scheduled Refresh", "Number of Tables"],
           [["—", "—", "—", tbl_count]], [4, 4, 4, 4])

    _h2(doc, "Subscription Details")
    _table(doc, ["Report Name", "Subscription Schedule", "Delivery Method", "Time"],
           [["—", "—", "—", "—"]], [4, 4, 4, 4])

    # ── 5. Implementations in Fabric ─────────────────────────────────────────
    _h1(doc, "Implementations in Fabric")

    _h2(doc, "Data Loading Method – One Time Load")
    _table(doc,
           ["Data Loading Process", "Details", "No of Jobs", "Email Notification for Job"],
           [["Full load – OneLake ingestion", "Migrate all historical data to Fabric Lakehouse", "1", "—"]],
           [4, 6, 2, 4])

    _h2(doc, "Data Loading Method – Incremental Load")
    if agent_jobs:
        inc = [[_s(j.get("job_name")), "Incremental delta load", "1", "—"] for j in agent_jobs[:5]]
    else:
        inc = [["Incremental Pipeline", "Delta load based on watermark column", "—", "—"]]
    _table(doc, ["Data Loading Process", "Details", "No of Jobs", "Email Notification for Job"],
           inc, [4, 6, 2, 4])

    _h2(doc, "Logging")
    _table(doc, ["Auditing", "Description", "Path / Error Details"],
           [["—", "—", "—"]], [5, 6, 5])
    _body(doc, "Log table details")
    _table(doc, ["Table name", "Description"], [["—", "—"], ["—", "—"]], [6, 10])

    _h2(doc, "Refresh Frequency")
    _table(doc, ["Data Refresh Frequency", "Yes/No", "Time"],
           [["Scheduled Lakehouse refresh", "Yes", "—"]], [8, 3, 5])

    _h2(doc, "Report Implementation")
    _table(doc,
           ["Number of Reports", "Semantic Model Implementation", "Scheduled Refresh", "Number of Tables"],
           [["—", "Direct Lake mode", "Yes", tbl_count]], [4, 5, 4, 3])

    _h2(doc, "Subscription Details")
    _table(doc, ["Report Name", "Subscription Schedule", "Delivery Method", "Time"],
           [["—", "—", "—", "—"]], [4, 4, 4, 4])

    # ── 6. Fabric Recommendations ────────────────────────────────────────────
    _h1(doc, "Fabric Recommendations")

    _h2(doc, "Data Science")
    _table(doc, ["Scenario", "Description", "Algorithms/models"],
           [["Predictive Analytics",
             "Leverage historical transaction data for ML models",
             "AutoML / Notebooks"]], [5, 7, 4])

    _h2(doc, "Data Activator")
    _table(doc, ["Scenario", "Description", "Alerts (Teams/Mail)"],
           [["Anomaly Detection", "Trigger alerts on data quality thresholds",
             "Teams + Email"]], [5, 7, 4])

    _h2(doc, "Data Retention Method")
    _body(doc, "Recommended: Fabric OneLake with tiered storage "
               "(Hot → Cool → Archive) based on data age and access frequency.")

    _h2(doc, "Data Security")
    sec_rows = [
        ["Row-Level Security",  "Implement RLS in semantic models",              "Yes"],
        ["Column Masking",      f"PII columns detected: {len(pii)}",             "Yes" if pii else "No"],
        ["Dynamic SQL Risk",    f"{len(dyn_sql)} object(s) use dynamic SQL",
         "Review" if dyn_sql else "No"],
        ["Orphaned Users",      f"{len(orphaned)} orphaned DB user(s)",
         "Review" if orphaned else "No"],
    ]
    _table(doc, ["Activity", "Description", "Yes/No"], sec_rows, [5, 8, 3])

    _h2(doc, "Data Quality Metrics")
    _table(doc, ["Data Quality Rules", "Alert Through"],
           [["Null value threshold breach", "Teams Notification"],
            ["Duplicate row detection",     "Email Alert"]], [8, 8])

    _h2(doc, "Data Governance")
    gov = [
        ["Microsoft Purview",  "Cataloguing and lineage tracking for all Fabric items", "Yes"],
        ["Sensitivity Labels", f"Apply labels to {len(pii)} PII column(s)",
         "Yes" if pii else "No"],
        ["Data Lineage",       f"Track: {engine} → Lakehouse → Report",       "Yes"],
    ]
    _table(doc, ["Activity", "Description", "Yes/No"], gov, [4, 9, 3])

    # ── 7. Deployment Method (Fabric) ────────────────────────────────────────
    _h1(doc, "Deployment Method (Fabric)")

    _h2(doc, "Deployment Details")
    _table(doc,
           ["System Name", "Deployment Tool/Method", "Deployment Environment",
            "Deployment Frequency", "Deployment Contact Email"],
           [["Microsoft Fabric", "Fabric Deployment Pipelines",
             "Dev → UAT → Prod", "On-demand / Sprint", "—"]],
           [3.2, 3.2, 3.2, 3.2, 3.2])

    # ── 8. Cost Analysis ─────────────────────────────────────────────────────
    _h1(doc, "Cost Analysis & Licensing Details")

    _h2(doc, "Compute & Storage Details - Fabric")
    _table(doc,
           ["Environment", "Region", "Compute SKU", "Storage",
            "Storage Cost", "Monthly Cost (Fabric SKU + Storage)"],
           [["Production",  "—", "F64 (recommended)", f"{size_gb} GB", "—", "—"],
            ["Development", "—", "F4 (trial)",        "—",             "—", "—"]],
           [2.5, 2, 3, 2, 2, 4.5])

    _h2(doc, "Azure DevOps")
    _table(doc, ["Plan Type", "Users", "Monthly Cost Per User", "Total Monthly Cost"],
           [["Basic", "—", "$6", "—"]], [4, 4, 4, 4])

    # ── 9. Migration Recommendations ─────────────────────────────────────────
    _h1(doc, "Migration Recommendations")

    _h2(doc, "Migration Items")
    _table(doc,
           ["Environment", "No. of Cubes", "No. of Tables", "No. of Alerts", "No. of Reports"],
           [["Production", "—", tbl_count, "—", view_count]], [3.2, 3.2, 3.2, 3.2, 3.2])

    _h2(doc, "Migration Timeline")
    _table(doc, ["PoC", "Items Delivered"],
           [["PoC 1", f"Schema + {tbl_count} table ingestion"],
            ["PoC 2", "Report migration + semantic model"]], [4, 12])
    _table(doc, ["No. of Months", "Resources", "No. of Weeks"],
           [["3–6", "2 Data Engineers + 1 BI Developer", "12–24"]], [4, 9, 3])

    # ── 10. Backup Plan & Release ─────────────────────────────────────────────
    _h1(doc, "Backup Plan & Release Strategy")

    _h2(doc, "Implementation Steps")
    steps = [
        "Source Assessment – Validate connectivity, schema, and data volumes.",
        "Proof of Concept – Migrate a subset of tables to Fabric Lakehouse.",
        "Full Migration – Incremental pipelines for all databases.",
        "Validation – Data reconciliation between source and Fabric.",
        "Cutover – Redirect reports and consumers to Fabric semantic model.",
        f"Decommission – Retire legacy {engine} infrastructure.",
    ]
    for i, step in enumerate(steps, 1):
        p = doc.add_paragraph(f"{i}.  {step}")
        for r in p.runs:
            _font(r, size=10)
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after  = Pt(2)

    # ── 11. Conclusion ────────────────────────────────────────────────────────
    _h1(doc, "Conclusion")

    _h2(doc, "Summary of Findings")
    summary = [
        ["Database",          db_name],
        ["Engine",            engine],
        ["Server Version",    version_str],
        ["Edition",           edition],
        ["Total Tables",      tbl_count],
        ["Total Views",       view_count],
        ["Stored Procedures", proc_count],
        ["Functions",         fn_count],
        ["Database Size",     f"{size_gb} GB"],
        ["PII Columns",       str(len(pii))],
        ["Dynamic SQL Usage", str(len(dyn_sql))],
    ]
    if mssql:
        summary.append(["Orphaned Users", str(len(orphaned))])
    _table(doc, ["Metric", "Value"], summary, [8, 8])

    _h2(doc, "Final Recommendations")
    recs = [
        f"Migrate {engine} to Microsoft Fabric Lakehouse using Data Factory pipelines.",
        "Implement row-level security and sensitivity labels for PII columns.",
    ]
    if mssql:
        recs.append("Replace SQL Agent jobs with Fabric Data Activator triggers.")
    recs += [
        "Adopt Direct Lake mode for Power BI reports to eliminate import overhead.",
        "Use Microsoft Purview for unified data governance and lineage.",
    ]
    for rec in recs:
        p = doc.add_paragraph(f"•  {rec}")
        for r in p.runs:
            _font(r, size=10)
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after  = Pt(2)

    _h2(doc, "Appendices")
    _body(doc, "Full schema details, index coverage, and null analysis are "
               "available in the companion Excel report.")


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════════

def build_word_report(
    job_id: str,
    raw: dict[str, Any],
    client_name: str | None = None,
    db_type: str = "mssql",
) -> bytes:
    """
    Build a Word report for a single-database assessment.
    client_name defaults to the job label → database name.
    """
    engine      = _ENGINE_LABEL.get(db_type, db_type.upper())
    doc_title   = f"{engine} {_DOC_TITLE}"
    ov          = _overview(raw)
    db_name     = _s(ov.get("database_name"), "Unknown Database")
    server_name = _s(raw.get("_server") or ov.get("server_name"), "")
    label       = client_name or db_name
    run_date    = datetime.utcnow().strftime("%d %b %Y")

    doc = Document()
    for section in doc.sections:
        section.top_margin    = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    _setup_header(doc, label, doc_title=doc_title)
    _setup_footer(doc)
    _cover_page(doc, label, run_date, doc_title=doc_title)
    _write_db_sections(doc, raw, db_name, server_name, db_type=db_type)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    logger.info("Word report built for job %s — engine: %s, client: %s", job_id, engine, label)
    return buf.getvalue()


def build_session_word_report(
    session_id: str,
    session_label: str | None,
    jobs_data: list[dict],
    db_type: str = "mssql",
) -> bytes:
    """
    Build a combined Word report for a multi-database session.

    jobs_data: list of {job_id, server, database, label, results: raw_dict}
    """
    engine      = _ENGINE_LABEL.get(db_type, db_type.upper())
    doc_title   = f"{engine} {_DOC_TITLE}"
    client_name = session_label or f"Session {session_id[:8]}"
    run_date    = datetime.utcnow().strftime("%d %b %Y")

    doc = Document()
    for section in doc.sections:
        section.top_margin    = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    _setup_header(doc, client_name, doc_title=doc_title)
    _setup_footer(doc)
    _cover_page(doc, client_name, run_date, doc_title=doc_title)

    # ── Session summary table ─────────────────────────────────────────────────
    _h1(doc, "Session Overview")
    _body(doc, f"This report covers {len(jobs_data)} database assessment(s) "
               f"run under session: {client_name}")
    doc.add_paragraph()

    sum_rows = []
    for jd in jobs_data:
        raw = jd.get("results") or {}
        ov  = _overview(raw)
        sz  = ov.get("total_size_mb")
        sum_rows.append([
            _s(jd.get("server")),
            _s(jd.get("database")),
            _s(ov.get("table_count")),
            _s(ov.get("view_count")),
            _s(ov.get("stored_proc_count")),
            f"{float(sz)/1024:.2f} GB" if sz else "—",
        ])

    _table(
        doc,
        ["Server", "Database", "Tables", "Views", "Stored Procs", "Size (GB)"],
        sum_rows,
        [4.5, 3.5, 2, 2, 2.5, 2.5],
    )

    # ── Per-database sections ─────────────────────────────────────────────────
    for idx, jd in enumerate(jobs_data):
        raw     = jd.get("results") or {}
        db_lbl  = _s(jd.get("database"), f"Database {idx + 1}")
        srv_lbl = _s(jd.get("server"))

        doc.add_page_break()

        # Database banner
        banner = doc.add_paragraph()
        _para_shd(banner, _MID_BLUE)
        br = banner.add_run(f"  Database: {srv_lbl}  ›  {db_lbl}")
        _font(br, bold=True, size=14, colour=_WHITE)
        banner.paragraph_format.space_before = Pt(0)
        banner.paragraph_format.space_after  = Pt(10)

        _write_db_sections(doc, raw, db_lbl, srv_lbl, db_type=db_type)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    logger.info("Session Word report built — %s engine=%s (%d databases)", session_id, engine, len(jobs_data))
    return buf.getvalue()
