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

    wb.save(str(output_path))
    logger.info("Report saved: %s", output_path)
    return str(output_path.resolve())
