"""
Excel report builder: converts raw assessment data into a formatted .xlsx workbook.
"""

from datetime import datetime
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ─────────────────────────── Style constants ────────────────────────────────

DARK_BLUE = "1F3864"
MID_BLUE = "2E75B6"
LIGHT_BLUE = "BDD7EE"
ACCENT_BLUE = "DEEAF1"
WHITE = "FFFFFF"
DARK_GRAY = "404040"
MED_GRAY = "808080"
LIGHT_GRAY = "F2F2F2"
GREEN = "70AD47"
LIGHT_GREEN = "E2EFDA"
ORANGE = "ED7D31"
LIGHT_ORANGE = "FCE4D6"
RED = "FF0000"
LIGHT_RED = "FFE2E2"
FONT_NAME = "Calibri"


def _font(bold=False, size=11, color=DARK_GRAY, italic=False):
    return Font(name=FONT_NAME, bold=bold, size=size, color=color, italic=italic)


def _fill(hex_color: str):
    return PatternFill("solid", fgColor=hex_color)


def _border(style="thin"):
    s = Side(style=style)
    return Border(left=s, right=s, top=s, bottom=s)


def _align(h="left", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)


def _header_cell(ws, row: int, col: int, value: str, bg=DARK_BLUE, fg=WHITE):
    c = ws.cell(row=row, column=col, value=value)
    c.font = _font(bold=True, color=fg)
    c.fill = _fill(bg)
    c.alignment = _align("center")
    c.border = _border()


def _data_cell(ws, row: int, col: int, value, bg=WHITE, align_h="left", bold=False, color=DARK_GRAY):
    c = ws.cell(row=row, column=col, value=value)
    c.font = _font(bold=bold, color=color)
    c.fill = _fill(bg)
    c.border = _border()
    c.alignment = _align(align_h, wrap=True)


def _section_title(ws, row: int, col: int, text: str, span: int = 1):
    c = ws.cell(row=row, column=col, value=text)
    c.font = _font(bold=True, size=12, color=WHITE)
    c.fill = _fill(MID_BLUE)
    c.alignment = _align("left")
    c.border = _border()
    if span > 1:
        ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col + span - 1)


def _auto_width(ws, min_w=10, max_w=50):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            try:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max(max_len + 2, min_w), max_w)


def _set_tab_color(ws, hex_color: str):
    ws.sheet_properties.tabColor = hex_color


def _write_generic_sheet(
    wb: Workbook,
    title: str,
    tab_color: str,
    section_label: str,
    headers: list[str],
    rows: list[dict[str, Any]],
    header_bg: str = DARK_BLUE,
    alt_bg: str = LIGHT_GRAY,
):
    """Generic helper: writes a header row + data rows for any flat list of dicts."""
    ws = wb.create_sheet(title)
    _set_tab_color(ws, tab_color)
    _section_title(ws, 1, 1, f"  {section_label}", span=len(headers))

    for ci, h in enumerate(headers, 1):
        _header_cell(ws, 2, ci, h, bg=header_bg)

    ws.auto_filter.ref = f"A2:{get_column_letter(len(headers))}2"
    ws.freeze_panes = "A3"

    for ri, record in enumerate(rows, start=3):
        bg = alt_bg if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = record.get(key, record.get(key.lower().replace(" ", "_"), ""))
            _data_cell(ws, ri, ci, val, bg=bg, align_h="center" if ci > 2 else "left")

    _auto_width(ws)


# ──────────────────────────── Per-sheet builders ────────────────────────────

def _build_summary(wb: Workbook, raw: dict[str, Any]):
    ws = wb.active
    ws.title = "Summary"
    _set_tab_color(ws, DARK_BLUE)

    ws.merge_cells("A1:H1")
    c = ws["A1"]
    c.value = "SQL SERVER SOURCE ASSESSMENT REPORT"
    c.font = _font(bold=True, size=18, color=WHITE)
    c.fill = _fill(DARK_BLUE)
    c.alignment = _align("center")
    ws.row_dimensions[1].height = 35

    ws.merge_cells("A2:H2")
    c = ws["A2"]
    c.value = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    c.font = _font(italic=True, size=10, color=MED_GRAY)
    c.fill = _fill(ACCENT_BLUE)
    c.alignment = _align("center")

    overview = raw.get("overview")
    if isinstance(overview, list) and overview:
        ov = overview[0]
    elif isinstance(overview, dict):
        ov = overview
    else:
        ov = {}

    _section_title(ws, 4, 1, "  DATABASE OVERVIEW", span=4)
    info_rows = [
        ("Database Name", ov.get("database_name", "N/A")),
        ("Connected User", ov.get("connected_user", "N/A")),
        ("SQL Version",    str(ov.get("sql_version", ov.get("sql_server_version", "N/A")))[:80]),
        ("Report Date",    datetime.now().strftime("%Y-%m-%d")),
    ]
    for i, (label, val) in enumerate(info_rows, start=5):
        ws.cell(row=i, column=1, value=label).font = _font(bold=True)
        ws.cell(row=i, column=1).fill = _fill(LIGHT_BLUE)
        ws.cell(row=i, column=1).border = _border()
        ws.cell(row=i, column=1).alignment = _align()
        c2 = ws.cell(row=i, column=2, value=val)
        c2.fill = _fill(WHITE)
        c2.border = _border()
        c2.alignment = _align(wrap=True)
        ws.merge_cells(start_row=i, start_column=2, end_row=i, end_column=4)

    row_kpi = 10
    _section_title(ws, row_kpi, 1, "  KEY METRICS", span=8)

    relationships = raw.get("relationships", [])
    index_coverage = raw.get("index_coverage", [])
    indexed_count = sum(1 for r in index_coverage if r.get("coverage") == "Indexed")

    kpis = [
        ("Schemas",         ov.get("schema_count", 0),     MID_BLUE),
        ("Tables",          ov.get("table_count", 0),      MID_BLUE),
        ("Views",           ov.get("view_count", 0),       MID_BLUE),
        ("Stored Procs",    ov.get("proc_count", ov.get("stored_proc_count", 0)), GREEN),
        ("Functions",       ov.get("func_count", ov.get("function_count", 0)),   GREEN),
        ("Relationships",   len(relationships),             ORANGE),
        ("Indexed Tables",  indexed_count,                  GREEN),
        ("DB Size (MB)",    ov.get("total_size_mb", 0),    MID_BLUE),
    ]

    for idx, (label, val, color) in enumerate(kpis):
        col = idx + 1
        kl = ws.cell(row=row_kpi + 1, column=col, value=label)
        kl.font = _font(bold=True, size=9, color=WHITE)
        kl.fill = _fill(color)
        kl.alignment = _align("center")
        kl.border = _border()
        ws.row_dimensions[row_kpi + 1].height = 18

        kv = ws.cell(row=row_kpi + 2, column=col, value=val)
        kv.font = _font(bold=True, size=16)
        kv.fill = _fill(ACCENT_BLUE)
        kv.alignment = _align("center")
        kv.border = _border()
        ws.row_dimensions[row_kpi + 2].height = 30

    row_schema = row_kpi + 5
    _section_title(ws, row_schema, 1, "  SCHEMA BREAKDOWN", span=5)
    s_headers = ["Schema", "Tables", "Views", "Stored Procs", "Total Objects"]
    for ci, h in enumerate(s_headers, 1):
        _header_cell(ws, row_schema + 1, ci, h, bg=MID_BLUE)

    for ri, srow in enumerate(raw.get("schemas", []), start=row_schema + 2):
        bg = LIGHT_BLUE if ri % 2 == 0 else WHITE
        tc = srow.get("table_count", 0)
        vc = srow.get("view_count", 0)
        pc = srow.get("proc_count", 0)
        vals = [srow.get("schema_name", ""), tc, vc, pc, tc + vc + pc]
        for ci, v in enumerate(vals, 1):
            _data_cell(ws, ri, ci, v, bg=bg, align_h="center" if ci > 1 else "left")

    _auto_width(ws)
    ws.column_dimensions["B"].width = 14


def _build_tables_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Tables")
    _set_tab_color(ws, MID_BLUE)
    headers = ["schema_name", "table_name", "column_count", "row_count", "size_mb", "create_date", "modify_date"]
    labels  = ["Schema", "Table Name", "Columns", "Row Count", "Size (MB)", "Created", "Modified"]
    _section_title(ws, 1, 1, "  TABLE INVENTORY", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_GRAY if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 2 else "left", wrap=True)
            if ci == 4 and isinstance(val, (int, float)) and val > 100_000:
                c.font = _font(bold=True, color=ORANGE)
    _auto_width(ws)


def _build_columns_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Columns")
    _set_tab_color(ws, "4472C4")
    headers = [
        "schema_name", "table_name", "column_id", "column_name",
        "data_type", "max_length", "precision", "scale",
        "is_nullable", "is_identity", "is_primary_key", "is_foreign_key",
    ]
    labels = [
        "Schema", "Table", "Col#", "Column Name",
        "Data Type", "Max Length", "Precision", "Scale",
        "Nullable", "Identity", "Primary Key", "Foreign Key",
    ]
    _section_title(ws, 1, 1, "  COLUMN CATALOGUE", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = ACCENT_BLUE if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 3 else "left", wrap=True)
            if key == "is_primary_key" and val == "YES":
                c.fill = _fill(LIGHT_GREEN)
                c.font = _font(bold=True, color="375623")
            if key == "is_foreign_key" and val == "YES":
                c.fill = _fill(LIGHT_ORANGE)
                c.font = _font(bold=True)
    _auto_width(ws)


def _build_views_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Views")
    _set_tab_color(ws, "70AD47")
    headers = ["schema_name", "view_name", "create_date", "modify_date", "definition"]
    labels  = ["Schema", "View Name", "Created", "Modified", "Definition (truncated)"]
    _section_title(ws, 1, 1, "  VIEWS", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl, bg=GREEN)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_GREEN if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            if key == "definition" and val and len(str(val)) > 200:
                val = str(val)[:200] + "…"
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("left", wrap=(key == "definition"))
    _auto_width(ws)
    ws.column_dimensions["E"].width = 50


def _build_procedures_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Stored Procedures")
    _set_tab_color(ws, "ED7D31")
    headers = ["schema_name", "procedure_name", "create_date", "modify_date", "param_count"]
    labels  = ["Schema", "Procedure Name", "Created", "Modified", "Param Count"]
    _section_title(ws, 1, 1, "  STORED PROCEDURES", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl, bg=ORANGE)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_ORANGE if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            _data_cell(ws, ri, ci, row.get(key, ""), bg=bg, align_h="center" if ci > 2 else "left")
    _auto_width(ws)


def _build_functions_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Functions")
    _set_tab_color(ws, "FFC000")
    headers = ["schema_name", "function_name", "function_type", "create_date", "modify_date"]
    labels  = ["Schema", "Function Name", "Type", "Created", "Modified"]
    _section_title(ws, 1, 1, "  FUNCTIONS", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl, bg="C55A11")
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = "FFF2CC" if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            _data_cell(ws, ri, ci, row.get(key, ""), bg=bg)
    _auto_width(ws)


def _build_indexes_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Indexes")
    _set_tab_color(ws, "9DC3E6")
    headers = [
        "schema_name", "table_name", "index_name", "index_type",
        "is_unique", "is_primary_key", "is_unique_constraint", "indexed_columns",
    ]
    labels = [
        "Schema", "Table", "Index Name", "Type",
        "Unique", "Primary Key", "Unique Constraint", "Indexed Columns",
    ]
    _section_title(ws, 1, 1, "  INDEX ANALYSIS", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_BLUE if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            if key in ("is_unique", "is_primary_key", "is_unique_constraint"):
                val = "YES" if val else "NO"
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if 4 <= ci <= 7 else "left", wrap=True)
            if key == "is_primary_key" and val == "YES":
                c.fill = _fill(LIGHT_GREEN)
                c.font = _font(bold=True)
    _auto_width(ws)
    ws.column_dimensions["H"].width = 40


def _build_relationships_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Relationships")
    _set_tab_color(ws, "70AD47")
    headers = [
        "fk_name", "parent_schema", "parent_table", "parent_column",
        "ref_schema", "ref_table", "ref_column", "on_delete", "on_update",
    ]
    labels = [
        "FK Name", "Parent Schema", "Parent Table", "Parent Column",
        "Ref Schema", "Ref Table", "Ref Column", "On Delete", "On Update",
    ]
    _section_title(ws, 1, 1, "  TABLE RELATIONSHIPS (FOREIGN KEYS)", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl, bg=GREEN)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_GREEN if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            _data_cell(ws, ri, ci, row.get(key, ""), bg=bg)
    _auto_width(ws)


def _build_index_coverage_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Index Coverage")
    _set_tab_color(ws, "4472C4")
    headers = ["schema_name", "table_name", "index_count", "coverage"]
    labels  = ["Schema", "Table", "Index Count", "Coverage Status"]
    _section_title(ws, 1, 1, "  INDEX COVERAGE BY TABLE", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"

    indexed_count = sum(1 for r in rows if r.get("coverage") == "Indexed")
    no_index_count = len(rows) - indexed_count

    for ri, row in enumerate(rows, start=3):
        is_indexed = row.get("coverage") == "Indexed"
        bg = LIGHT_GREEN if is_indexed else LIGHT_RED
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg if ci == 4 else (LIGHT_GRAY if ri % 2 == 0 else WHITE))
            c.border = _border()
            c.alignment = _align("center" if ci > 2 else "left")
            if key == "coverage":
                c.font = _font(bold=True, color="375623" if is_indexed else RED)

    summary_row = len(rows) + 5
    for label, val, color in [
        ("Indexed Tables",       indexed_count,   "375623"),
        ("Tables without Index", no_index_count,  RED),
        ("Coverage %",           f"{indexed_count / max(len(rows), 1) * 100:.1f}%", MID_BLUE),
    ]:
        r = summary_row
        ws.cell(row=r, column=1, value=label).font = _font(bold=True)
        ws.cell(row=r, column=2, value=val).font = _font(bold=True, color=color)
        summary_row += 1

    _auto_width(ws)


def _build_null_analysis_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Null Analysis")
    _set_tab_color(ws, "FF0000")
    headers = ["schema_name", "table_name", "column_name", "total_rows", "null_blank_pct"]
    labels  = ["Schema", "Table", "Column", "Total Rows", "Null/Blank %"]
    _section_title(ws, 1, 1, "  NULL / BLANK VALUE ANALYSIS", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl, bg="C00000")
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        pct = row.get("null_blank_pct", 0) or 0
        pct_bg = LIGHT_RED if pct >= 75 else (LIGHT_ORANGE if pct >= 25 else LIGHT_GREEN)
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            bg = pct_bg if key == "null_blank_pct" else (LIGHT_GRAY if ri % 2 == 0 else WHITE)
            c = ws.cell(row=ri, column=ci, value=val / 100 if key == "null_blank_pct" else val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 3 else "left")
            if key == "null_blank_pct":
                c.number_format = "0.00%"
    _auto_width(ws)


def _build_insertion_freq_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Insertion Frequency")
    _set_tab_color(ws, "ED7D31")
    _section_title(ws, 1, 1, "  DATA INSERTION FREQUENCY ESTIMATE", span=6)
    note = ws.cell(row=2, column=1, value="⚠ Avg rows/day is estimated from total rows ÷ table age. Use with caution.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells("A2:F2")
    headers = ["schema_name", "table_name", "current_rows", "age_days", "avg_rows_per_day", "activity_level"]
    labels  = ["Schema", "Table", "Row Count", "Table Age (days)", "Avg Rows/Day", "Activity Level"]
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg=ORANGE)
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    for ri, row in enumerate(rows, start=4):
        rpd = float(row.get("avg_rows_per_day", 0) or 0)
        if rpd > 1000:
            level, level_bg = "High", LIGHT_RED
        elif rpd > 100:
            level, level_bg = "Medium", LIGHT_ORANGE
        elif rpd > 0:
            level, level_bg = "Low", LIGHT_GREEN
        else:
            level, level_bg = "Static", LIGHT_GRAY
        row_bg = LIGHT_GRAY if ri % 2 == 0 else WHITE
        values = {
            "schema_name":      row.get("schema_name", ""),
            "table_name":       row.get("table_name", ""),
            "current_rows":     row.get("current_rows", 0),
            "age_days":         row.get("age_days", 0),
            "avg_rows_per_day": round(rpd, 2),
            "activity_level":   level,
        }
        for ci, key in enumerate(headers, 1):
            val = values[key]
            bg = level_bg if key == "activity_level" else row_bg
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 2 else "left")
            if key == "activity_level":
                c.font = _font(bold=True)
    _auto_width(ws)


# ──────────────────────── Security sheet builders ───────────────────────────

def _build_db_users_roles_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-DB Users")
    _set_tab_color(ws, "C00000")
    headers = ["principal_name", "principal_type", "create_date", "default_schema", "server_login", "roles"]
    labels  = ["Principal Name", "Type", "Created", "Default Schema", "Server Login", "Roles"]
    _section_title(ws, 1, 1, "  SECURITY — DATABASE USERS & ROLES", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl, bg="C00000")
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    for ri, row in enumerate(rows, start=3):
        bg = "FFE2E2" if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("left", wrap=(key == "roles"))
            if key == "roles" and val and "db_owner" in str(val):
                c.font = _font(bold=True, color=RED)
    _auto_width(ws)
    ws.column_dimensions["F"].width = 40


def _build_orphaned_users_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-Orphaned Users")
    _set_tab_color(ws, "C00000")
    headers = ["user_name", "user_type", "create_date", "default_schema"]
    labels  = ["User Name", "User Type", "Created", "Default Schema"]
    _section_title(ws, 1, 1, "  SECURITY — ORPHANED USERS (No Server Login)", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ These users have no matching server login and cannot authenticate.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg="C00000")
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    if not rows:
        ws.cell(row=4, column=1, value="No orphaned users found.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=4):
        bg = "FFE2E2" if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            _data_cell(ws, ri, ci, row.get(key, ""), bg=bg)
    _auto_width(ws)


def _build_db_owner_members_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-DB Owners")
    _set_tab_color(ws, "C00000")
    headers = ["member_name", "member_type", "server_login", "create_date"]
    labels  = ["Member Name", "Member Type", "Server Login", "Created"]
    _section_title(ws, 1, 1, "  SECURITY — EXCESSIVE PERMISSIONS (db_owner Members)", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ Non-dbo members of db_owner have unrestricted database control.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg="C00000")
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    if not rows:
        ws.cell(row=4, column=1, value="No non-dbo db_owner members found.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=4):
        bg = "FFE2E2" if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            c = ws.cell(row=ri, column=ci, value=row.get(key, ""))
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("left")
            c.font = _font(bold=True, color=RED)
    _auto_width(ws)


def _build_dynamic_sql_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-Dynamic SQL")
    _set_tab_color(ws, "C55A11")
    headers = ["object_type", "schema_name", "object_name", "dynamic_sql_type"]
    labels  = ["Object Type", "Schema", "Object Name", "Dynamic SQL Pattern"]
    _section_title(ws, 1, 1, "  SECURITY — DYNAMIC SQL USAGE", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ Dynamic SQL can introduce SQL injection risks if user input is not sanitised.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg="C55A11")
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    if not rows:
        ws.cell(row=4, column=1, value="No dynamic SQL usage detected.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=4):
        bg = LIGHT_ORANGE if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            _data_cell(ws, ri, ci, row.get(key, ""), bg=bg)
    _auto_width(ws)


def _build_clr_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-CLR")
    _set_tab_color(ws, "7030A0")
    headers = ["assembly_name", "permission_set", "clr_object_count", "create_date", "modify_date", "is_visible"]
    labels  = ["Assembly Name", "Permission Set", "CLR Objects", "Created", "Modified", "Visible"]
    _section_title(ws, 1, 1, "  SECURITY — CLR ASSEMBLIES", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ UNSAFE / EXTERNAL_ACCESS assemblies can execute arbitrary code.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg="7030A0", fg=WHITE)
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    if not rows:
        ws.cell(row=4, column=1, value="CLR is not used or no user-defined assemblies found.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=4):
        bg = "EAD1DC" if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 2 else "left")
            if key == "permission_set" and str(val) in ("UNSAFE", "EXTERNAL_ACCESS"):
                c.font = _font(bold=True, color=RED)
                c.fill = _fill(LIGHT_RED)
    _auto_width(ws)


def _build_encryption_sheet(wb: Workbook, tde_rows: list[dict[str, Any]], col_enc_rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-Encryption")
    _set_tab_color(ws, "375623")
    row_offset = 1

    # TDE section
    _section_title(ws, row_offset, 1, "  SECURITY — TRANSPARENT DATA ENCRYPTION (TDE)", span=6)
    row_offset += 1
    tde_headers = ["database_name", "tde_status", "encryption_state", "percent_complete", "key_algorithm", "key_length"]
    tde_labels  = ["Database", "TDE Status", "Encryption State", "% Complete", "Algorithm", "Key Length"]
    for ci, lbl in enumerate(tde_labels, 1):
        _header_cell(ws, row_offset, ci, lbl, bg="375623")
    row_offset += 1
    ws.freeze_panes = f"A{row_offset}"
    for row in tde_rows:
        enabled = str(row.get("tde_status", "")).lower() == "enabled"
        bg = LIGHT_GREEN if enabled else LIGHT_RED
        for ci, key in enumerate(tde_headers, 1):
            c = ws.cell(row=row_offset, column=ci, value=row.get(key, ""))
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 1 else "left")
            if key == "tde_status":
                c.font = _font(bold=True, color="375623" if enabled else RED)
        row_offset += 1

    # Column encryption section
    row_offset += 2
    _section_title(ws, row_offset, 1, "  SECURITY — COLUMN-LEVEL ENCRYPTION (Always Encrypted)", span=6)
    row_offset += 1
    ce_headers = ["schema_name", "table_name", "column_name", "data_type", "encryption_key_name", "encryption_type"]
    ce_labels  = ["Schema", "Table", "Column", "Data Type", "Encryption Key", "Encryption Type"]
    for ci, lbl in enumerate(ce_labels, 1):
        _header_cell(ws, row_offset, ci, lbl, bg="375623")
    row_offset += 1
    if not col_enc_rows:
        ws.cell(row=row_offset, column=1, value="No Always Encrypted columns found.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(col_enc_rows):
        bg = LIGHT_GREEN if (ri % 2 == 0) else WHITE
        for ci, key in enumerate(ce_headers, 1):
            _data_cell(ws, row_offset + ri, ci, row.get(key, ""), bg=bg)
    _auto_width(ws)


def _build_pii_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Sec-PII Scan")
    _set_tab_color(ws, "FF0000")
    headers = ["pii_category", "schema_name", "table_name", "column_name", "data_type"]
    labels  = ["PII Category", "Schema", "Table", "Column", "Data Type"]
    _section_title(ws, 1, 1, "  SECURITY — PII / SENSITIVE DATA INDICATORS", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ Column names match known PII patterns. Verify data and apply appropriate controls.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg="C00000")
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    if not rows:
        ws.cell(row=4, column=1, value="No PII indicators detected in column names.").font = _font(italic=True, color=MED_GRAY)

    PII_COLORS = {
        "SSN": ("FFE2E2", RED),
        "Credit Card": ("FFE2E2", RED),
        "Password/Secret": ("FFE2E2", RED),
        "National ID": ("FFE2E2", RED),
        "Date of Birth": (LIGHT_ORANGE, ORANGE),
        "Financial": (LIGHT_ORANGE, ORANGE),
        "Email": ("FFF2CC", "806000"),
        "Phone": ("FFF2CC", "806000"),
        "Passport": ("FFF2CC", "806000"),
    }
    for ri, row in enumerate(rows, start=4):
        cat = str(row.get("pii_category", ""))
        row_bg, label_color = PII_COLORS.get(cat, (LIGHT_GRAY, DARK_GRAY))
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(row_bg if ci > 1 else row_bg)
            c.border = _border()
            c.alignment = _align("left")
            if key == "pii_category":
                c.font = _font(bold=True, color=label_color)
    _auto_width(ws)


# ─────────────────────── Feature Usage sheet builders ───────────────────────

def _build_agent_jobs_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Feat-Agent Jobs")
    _set_tab_color(ws, "2E75B6")
    headers = ["job_name", "status", "failure_count", "last_run_status", "date_created", "date_modified", "description"]
    labels  = ["Job Name", "Status", "Failure Count", "Last Run Status", "Created", "Modified", "Description"]
    _section_title(ws, 1, 1, "  FEATURE USAGE — SQL AGENT JOBS", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    if not rows:
        ws.cell(row=3, column=1, value="No SQL Agent jobs found or msdb access denied.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=3):
        failures = int(row.get("failure_count", 0) or 0)
        bg = LIGHT_RED if failures > 0 else (LIGHT_GRAY if ri % 2 == 0 else WHITE)
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if 2 <= ci <= 5 else "left")
            if key == "failure_count" and failures > 0:
                c.font = _font(bold=True, color=RED)
            if key == "last_run_status" and str(val) == "Failed":
                c.font = _font(bold=True, color=RED)
                c.fill = _fill(LIGHT_RED)
    _auto_width(ws)
    ws.column_dimensions["G"].width = 40


def _build_linked_servers_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Feat-Linked Servers")
    _set_tab_color(ws, "2E75B6")
    headers = ["linked_server_name", "product", "provider", "data_source",
               "remote_login_enabled", "data_access_enabled", "rpc_out_enabled", "modify_date"]
    labels  = ["Linked Server", "Product", "Provider", "Data Source",
               "Remote Login", "Data Access", "RPC Out", "Modified"]
    _section_title(ws, 1, 1, "  FEATURE USAGE — LINKED SERVERS", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ Linked servers can introduce lateral movement and privilege escalation risks.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl)
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    if not rows:
        ws.cell(row=4, column=1, value="No linked servers configured.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=4):
        bg = LIGHT_ORANGE if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 4 else "left")
            if key in ("remote_login_enabled", "rpc_out_enabled") and str(val) == "Yes":
                c.font = _font(bold=True, color=ORANGE)
    _auto_width(ws)


def _build_cross_db_refs_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Feat-Cross-DB Refs")
    _set_tab_color(ws, "2E75B6")
    headers = ["object_type", "schema_name", "object_name",
               "referenced_database", "referenced_schema", "referenced_entity"]
    labels  = ["Object Type", "Schema", "Object Name",
               "Referenced DB", "Ref Schema", "Ref Entity"]
    _section_title(ws, 1, 1, "  FEATURE USAGE — CROSS-DATABASE REFERENCES", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    if not rows:
        ws.cell(row=3, column=1, value="No cross-database references found.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_BLUE if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            _data_cell(ws, ri, ci, row.get(key, ""), bg=bg)
    _auto_width(ws)


def _build_replication_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Feat-Replication")
    _set_tab_color(ws, "2E75B6")
    headers = ["database_name", "has_replicated_tables", "replicated_table_count",
               "is_publisher", "is_subscriber", "is_merge_published"]
    labels  = ["Database", "Has Replicated Tables", "Replicated Table Count",
               "Is Publisher", "Is Subscriber", "Is Merge Published"]
    _section_title(ws, 1, 1, "  FEATURE USAGE — REPLICATION STATUS", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    if not rows:
        ws.cell(row=3, column=1, value="Replication status unavailable.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=3):
        bg = LIGHT_GRAY if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 1 else "left")
            if str(val) == "Yes":
                c.font = _font(bold=True, color=ORANGE)
    _auto_width(ws)


def _build_service_broker_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Feat-Svc Broker")
    _set_tab_color(ws, "2E75B6")
    headers = ["database_name", "broker_status", "user_queue_count",
               "user_service_count", "active_conversations"]
    labels  = ["Database", "Broker Status", "User Queues",
               "User Services", "Active Conversations"]
    _section_title(ws, 1, 1, "  FEATURE USAGE — SERVICE BROKER", span=len(labels))
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 2, ci, lbl)
    ws.auto_filter.ref = f"A2:{get_column_letter(len(labels))}2"
    ws.freeze_panes = "A3"
    if not rows:
        ws.cell(row=3, column=1, value="Service Broker status unavailable.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=3):
        enabled = str(row.get("broker_status", "")).lower() == "enabled"
        bg = LIGHT_GREEN if enabled else LIGHT_GRAY
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 1 else "left")
            if key == "broker_status":
                c.font = _font(bold=True, color="375623" if enabled else MED_GRAY)
    _auto_width(ws)


def _build_version_features_sheet(wb: Workbook, rows: list[dict[str, Any]]):
    ws = wb.create_sheet("Feat-Version")
    _set_tab_color(ws, "1F3864")
    headers = [
        "server_name", "product_version", "product_level", "product_update_level",
        "edition", "is_clustered", "hadr_enabled", "fulltext_installed",
        "clr_enabled", "xp_cmdshell_enabled", "ole_automation_enabled", "adhoc_distributed_queries",
    ]
    labels = [
        "Server Name", "Product Version", "Product Level", "Update Level",
        "Edition", "Clustered", "HADR Enabled", "Full-Text",
        "CLR Enabled", "xp_cmdshell", "OLE Automation", "Ad Hoc Dist. Queries",
    ]
    _section_title(ws, 1, 1, "  FEATURE USAGE — SQL SERVER VERSION & RISK FEATURES", span=len(labels))
    note = ws.cell(row=2, column=1, value="⚠ Highlighted cells indicate high-risk surface area features that should be reviewed.")
    note.font = _font(italic=True, size=9, color="7F7F7F")
    ws.merge_cells(f"A2:{get_column_letter(len(labels))}2")
    for ci, lbl in enumerate(labels, 1):
        _header_cell(ws, 3, ci, lbl, bg=DARK_BLUE)
    ws.auto_filter.ref = f"A3:{get_column_letter(len(labels))}3"
    ws.freeze_panes = "A4"
    RISK_KEYS = {"clr_enabled", "xp_cmdshell_enabled", "ole_automation_enabled", "adhoc_distributed_queries"}
    if not rows:
        ws.cell(row=4, column=1, value="Version features unavailable.").font = _font(italic=True, color=MED_GRAY)
    for ri, row in enumerate(rows, start=4):
        bg = LIGHT_GRAY if ri % 2 == 0 else WHITE
        for ci, key in enumerate(headers, 1):
            val = row.get(key, "")
            is_risk_on = key in RISK_KEYS and str(val) in ("1", "True", True, 1)
            c = ws.cell(row=ri, column=ci, value=val)
            c.fill = _fill(LIGHT_RED if is_risk_on else bg)
            c.border = _border()
            c.alignment = _align("center" if ci > 5 else "left")
            if is_risk_on:
                c.font = _font(bold=True, color=RED)
    _auto_width(ws)


# ─────────────────────────── Public entry point ─────────────────────────────

def build_report(job_id: str, raw: dict[str, Any]) -> str:
    """
    Build the Excel workbook from raw assessment data and save it to disk.
    Returns the absolute path to the saved file.
    """
    reports_dir = settings.reports_dir
    reports_dir.mkdir(parents=True, exist_ok=True)
    output_path = reports_dir / f"{job_id}.xlsx"

    wb = Workbook()

    # ── Core metadata sheets ─────────────────────────────────────────────────
    _build_summary(wb, raw)
    _build_tables_sheet(wb, raw.get("tables", []))
    _build_columns_sheet(wb, raw.get("columns", []))
    _build_views_sheet(wb, raw.get("views", []))
    _build_procedures_sheet(wb, raw.get("stored_procedures", []))
    _build_functions_sheet(wb, raw.get("functions", []))
    _build_indexes_sheet(wb, raw.get("indexes", []))
    _build_relationships_sheet(wb, raw.get("relationships", []))
    _build_index_coverage_sheet(wb, raw.get("index_coverage", []))
    _build_null_analysis_sheet(wb, raw.get("null_analysis", []))
    _build_insertion_freq_sheet(wb, raw.get("insertion_frequency", []))
    # ── Security assessment sheets ───────────────────────────────────────────
    _build_db_users_roles_sheet(wb, raw.get("db_users_roles", []))
    _build_orphaned_users_sheet(wb, raw.get("orphaned_users", []))
    _build_db_owner_members_sheet(wb, raw.get("db_owner_members", []))
    _build_dynamic_sql_sheet(wb, raw.get("dynamic_sql_usage", []))
    _build_clr_sheet(wb, raw.get("clr_assemblies", []))
    _build_encryption_sheet(wb, raw.get("tde_status", []), raw.get("column_encryption", []))
    _build_pii_sheet(wb, raw.get("pii_indicators", []))
    # ── Feature usage & risk sheets ──────────────────────────────────────────
    _build_agent_jobs_sheet(wb, raw.get("sql_agent_jobs", []))
    _build_linked_servers_sheet(wb, raw.get("linked_servers", []))
    _build_cross_db_refs_sheet(wb, raw.get("cross_db_references", []))
    _build_replication_sheet(wb, raw.get("replication_status", []))
    _build_service_broker_sheet(wb, raw.get("service_broker", []))
    _build_version_features_sheet(wb, raw.get("version_features", []))

    wb.save(str(output_path))
    logger.info("Report saved: %s", output_path)
    return str(output_path.resolve())


def build_session_report(session_id: str, jobs_data: list[dict]) -> str:
    """
    Build a combined Excel workbook for a multi-server session.

    jobs_data: list of { job_id, server, database, results: raw_dict }

    Produces:
      - Sheet 1: Session Summary (one row per database, overview stats)
      - Subsequent sheets: key data per database (Tables, Columns, PII etc.)
        prefixed with a short server/database tag.
    Returns the absolute path to the saved file.
    """
    from app.config import settings

    reports_dir = settings.reports_dir
    reports_dir.mkdir(parents=True, exist_ok=True)
    output_path = reports_dir / f"session_{session_id}.xlsx"

    wb = Workbook()

    # ── Session Summary sheet ─────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Session Summary"
    _set_tab_color(ws, DARK_BLUE)

    # Title
    ws.merge_cells("A1:K1")
    title_cell = ws["A1"]
    title_cell.value = "SQL SERVER SOURCE ASSESSMENT — MULTI-SERVER SESSION REPORT"
    title_cell.font = _font(bold=True, size=16, color=WHITE)
    title_cell.fill = _fill(DARK_BLUE)
    title_cell.alignment = _align("center")
    ws.row_dimensions[1].height = 32

    ws.merge_cells("A2:K2")
    sub_cell = ws["A2"]
    sub_cell.value = f"Session ID: {session_id}   |   Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    sub_cell.font = _font(italic=True, color=MED_GRAY)
    sub_cell.fill = _fill(LIGHT_BLUE)
    sub_cell.alignment = _align("center")
    ws.row_dimensions[2].height = 18

    headers = [
        "Server", "Database", "SQL Version", "Tables", "Views",
        "Stored Procs", "Functions", "Indexes", "Relationships",
        "Size (MB)", "PII Indicators",
    ]
    for ci, h in enumerate(headers, 1):
        _header_cell(ws, 4, ci, h, bg=MID_BLUE)

    ws.auto_filter.ref = f"A4:{get_column_letter(len(headers))}4"
    ws.freeze_panes = "A5"

    for ri, job in enumerate(jobs_data, start=5):
        bg = LIGHT_GRAY if ri % 2 == 0 else WHITE
        raw = job.get("results", {})
        overview = raw.get("overview") or {}
        if isinstance(overview, list):
            overview = overview[0] if overview else {}

        row_vals = [
            job.get("server", ""),
            job.get("database", ""),
            str(overview.get("sql_server_version", ""))[:60],
            overview.get("table_count", 0),
            overview.get("view_count", 0),
            overview.get("stored_proc_count", 0),
            overview.get("function_count", 0),
            len(raw.get("indexes", [])),
            len(raw.get("relationships", [])),
            overview.get("total_size_mb", ""),
            len(raw.get("pii_indicators", [])),
        ]
        for ci, val in enumerate(row_vals, 1):
            _data_cell(ws, ri, ci, val, bg=bg, align_h="center" if ci > 2 else "left")

    _auto_width(ws)

    # ── Per-database detail sheets ─────────────────────────────────────────────
    for job in jobs_data:
        raw = job.get("results", {})
        server = job.get("server", "")
        database = job.get("database", "")
        # Create a short safe prefix for sheet names (max ~20 chars)
        # Excel sheet names cannot contain: \ / ? * [ ] :
        prefix = f"{server[:10]}-{database[:10]}"

        # Tables
        tables = raw.get("tables", [])
        if tables:
            _write_generic_sheet(
                wb, f"{prefix[:20]} Tbl", MID_BLUE, f"Tables — {server}/{database}",
                ["schema_name", "table_name", "column_count", "row_count", "size_mb"],
                tables,
            )

        # PII indicators
        pii = raw.get("pii_indicators", [])
        if pii:
            _write_generic_sheet(
                wb, f"{prefix[:20]} PII", RED, f"PII Indicators — {server}/{database}",
                ["schema_name", "table_name", "column_name", "data_type", "pii_category"],
                pii,
            )

        # Null analysis
        null_data = raw.get("null_analysis", [])
        if null_data:
            _write_generic_sheet(
                wb, f"{prefix[:20]} Null", ORANGE, f"Null Analysis — {server}/{database}",
                ["schema_name", "table_name", "column_name", "total_rows", "null_blank_pct"],
                null_data,
            )

        # Linked servers (risk)
        linked = raw.get("linked_servers", [])
        if linked:
            _write_generic_sheet(
                wb, f"{prefix[:20]} Lnk", ORANGE, f"Linked Servers — {server}/{database}",
                ["linked_server_name", "product", "provider", "data_source"],
                linked,
            )

    wb.save(str(output_path))
    logger.info("Session report saved: %s", output_path)
    return str(output_path.resolve())
