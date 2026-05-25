"""
Tableau Assessment Service.

Orchestrates the full Tableau assessment:
  1. Sign in and capture server/site info
  2. Enumerate projects
  3. Enumerate workbooks + views (sheets/dashboards)
  4. Enumerate published data sources
  5. Enumerate users + groups
  6. Enumerate Tableau Prep flows (if available)
  7. Enumerate extract schedules + recent jobs
  8. Sample permissions (top 20 workbooks)
  9. Build data quality flags
 10. Generate Excel + Word reports
"""

import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.logging import get_logger
from app.db import tableau_client as client
from app.models.tableau_requests import (
    TableauAssessmentRequest,
    TableauAssessmentResult,
    TableauServerInfo,
    TableauWorkbook,
    TableauView,
    TableauDatasource,
    TableauUserProfile,
    TableauGroup,
    TableauProject,
    TableauFlow,
    TableauExtractJob,
    TableauExtractHealth,
    TableauPermissionEntry,
    TableauDataQualityFlags,
    TableauWorkbookSummary,
    TableauDatasourceSummary,
)

logger = get_logger(__name__)

# ── In-memory job store ───────────────────────────────────────────────────────

_jobs: dict[str, dict] = {}


def create_job(request: TableauAssessmentRequest) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "job_id": job_id,
        "label": request.label,
        "server_url": request.credentials.server_url,
        "status": "pending",
        "progress_message": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "results": None,
        "excel_bytes": None,
        "word_bytes": None,
    }
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


def list_jobs() -> list[dict]:
    return sorted(_jobs.values(), key=lambda j: j["created_at"], reverse=True)


def _update(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)


# ── Connection test ───────────────────────────────────────────────────────────

def test_connection(request: TableauAssessmentRequest) -> dict:
    creds = request.credentials
    return client.test_connection(
        server_url=creds.server_url,
        site_name=creds.site_name,
        username=creds.username,
        password=creds.password.get_secret_value() if creds.password else None,
        token_name=creds.token_name,
        token_secret=creds.token_secret.get_secret_value() if creds.token_secret else None,
    )


# ── Assessment steps list (for progress terminal) ────────────────────────────

STEPS = [
    "Connecting to Tableau Server",
    "Enumerating projects",
    "Enumerating workbooks",
    "Enumerating views & dashboards",
    "Enumerating data sources",
    "Enumerating users",
    "Enumerating groups",
    "Enumerating Prep flows",
    "Enumerating extract schedules",
    "Enumerating recent background jobs",
    "Sampling workbook permissions",
    "Building data quality flags",
    "Generating Excel report",
    "Generating Word report",
]


# ── Assessment runner ─────────────────────────────────────────────────────────

def run_assessment(job_id: str, request: TableauAssessmentRequest) -> None:
    """Full Tableau assessment — runs in a background thread."""
    creds = request.credentials

    try:
        import tableauserverclient as TSC
    except ImportError:
        _update(
            job_id,
            status="failed",
            error="tableauserverclient is not installed. Run: pip install tableauserverclient",
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        return

    def _step(msg: str) -> None:
        logger.info("[tableau:%s] %s", job_id[:8], msg)
        _update(job_id, status="running", progress_message=msg)

    try:
        _update(job_id, status="running", progress_message=STEPS[0])

        # Build server object + auth
        server = TSC.Server(creds.server_url, use_server_version=True)
        server.add_http_options({"verify": False})

        if creds.token_name and creds.token_secret:
            auth = TSC.PersonalAccessTokenAuth(
                token_name=creds.token_name,
                personal_access_token=creds.token_secret.get_secret_value(),
                site_id=creds.site_name or "",
            )
        else:
            auth = TSC.TableauAuth(
                username=creds.username or "",
                password=creds.password.get_secret_value() if creds.password else "",
                site_id=creds.site_name or "",
            )

        with server.auth.sign_in(auth):

            # ── Step 1: Server info ───────────────────────────────────────────
            _step(STEPS[0])
            server_info = TableauServerInfo(
                server_url=creds.server_url,
                site_name=server.site_id or "Default",
                server_version=server.version or "unknown",
                site_id=server.site_id or "",
                content_url=creds.site_name or "",
            )

            # ── Step 2: Projects ──────────────────────────────────────────────
            _step(STEPS[1])
            raw_projects = []
            try:
                raw_projects = client.list_projects(server)
            except Exception as e:
                logger.warning("Projects step failed: %s", e)

            projects = [TableauProject(**p) for p in raw_projects]

            # ── Step 3: Workbooks ─────────────────────────────────────────────
            _step(STEPS[2])
            raw_workbooks = []
            try:
                raw_workbooks = client.list_workbooks(server)
            except Exception as e:
                logger.warning("Workbooks step failed: %s", e)

            workbooks = [TableauWorkbook(**w) for w in raw_workbooks]

            # ── Step 4: Views ─────────────────────────────────────────────────
            _step(STEPS[3])
            raw_views = []
            try:
                raw_views = client.list_views(server)
            except Exception as e:
                logger.warning("Views step failed: %s", e)

            views = [TableauView(**v) for v in raw_views]

            sheets = [v for v in views if v.view_type in ("sheet", "")]
            dashboards = [v for v in views if v.view_type == "dashboard"]

            wb_summary = TableauWorkbookSummary(
                total_workbooks=len(workbooks),
                total_views=len(views),
                total_sheets=len(sheets),
                total_dashboards=len(dashboards),
                workbooks_with_extracts=0,
                avg_views_per_workbook=len(views) / max(len(workbooks), 1),
            )

            # ── Step 5: Datasources ───────────────────────────────────────────
            _step(STEPS[4])
            raw_ds = []
            try:
                raw_ds = client.list_datasources(server)
            except Exception as e:
                logger.warning("Datasources step failed: %s", e)

            datasources = [TableauDatasource(**d) for d in raw_ds]

            certified = [d for d in datasources if d.is_certified]
            with_extracts = [d for d in datasources if d.has_extracts]
            conn_types = list({d.connection_type for d in datasources if d.connection_type and d.connection_type != "unknown"})

            ds_summary = TableauDatasourceSummary(
                total_datasources=len(datasources),
                published_datasources=len([d for d in datasources if d.is_published]),
                embedded_datasources=len([d for d in datasources if not d.is_published]),
                certified_datasources=len(certified),
                extract_datasources=len(with_extracts),
                live_datasources=len(datasources) - len(with_extracts),
                connection_types=conn_types[:20],
            )

            # Update workbook summary extract count
            wb_summary.workbooks_with_extracts = len(with_extracts)

            # ── Step 6: Users ─────────────────────────────────────────────────
            _step(STEPS[5])
            raw_users = []
            try:
                raw_users = client.list_users(server)
            except Exception as e:
                logger.warning("Users step failed: %s", e)

            def _role_count(role_substr: str) -> int:
                return sum(1 for u in raw_users if role_substr.lower() in (u.get("role") or "").lower())

            total_users = len(raw_users)
            admin_users = _role_count("serveradmin") + _role_count("siteadmin")
            user_profile = TableauUserProfile(
                total_users=total_users,
                active_users=total_users,
                admin_users=admin_users,
                site_admin_users=_role_count("siteadmin"),
                creator_users=_role_count("creator"),
                explorer_users=_role_count("explorer"),
                viewer_users=_role_count("viewer"),
                unlicensed_users=_role_count("unlicensed"),
            )

            # ── Step 7: Groups ────────────────────────────────────────────────
            _step(STEPS[6])
            raw_groups = []
            try:
                raw_groups = client.list_groups(server)
            except Exception as e:
                logger.warning("Groups step failed: %s", e)

            groups = [TableauGroup(**g) for g in raw_groups]

            # ── Step 8: Flows ─────────────────────────────────────────────────
            flows: list[TableauFlow] = []
            if request.include_flows:
                _step(STEPS[7])
                try:
                    raw_flows = client.list_flows(server)
                    flows = [TableauFlow(**f) for f in raw_flows]
                except Exception as e:
                    logger.warning("Flows step failed: %s", e)

            # ── Step 9: Schedules ─────────────────────────────────────────────
            extract_health = TableauExtractHealth(
                total_schedules=0, active_schedules=0, suspended_schedules=0,
                total_refresh_jobs=0, successful_jobs=0, failed_jobs=0,
                cancelled_jobs=0, stale_datasources=0,
            )
            extract_jobs: list[TableauExtractJob] = []

            if request.include_extract_health:
                _step(STEPS[8])
                try:
                    raw_schedules = client.list_schedules(server)
                    active_sched = sum(1 for s in raw_schedules if (s.get("state") or "").lower() == "active")
                    suspended_sched = len(raw_schedules) - active_sched
                    extract_health.total_schedules = len(raw_schedules)
                    extract_health.active_schedules = active_sched
                    extract_health.suspended_schedules = suspended_sched
                except Exception as e:
                    logger.warning("Schedules step failed: %s", e)

                # ── Step 10: Recent jobs ──────────────────────────────────────
                _step(STEPS[9])
                try:
                    raw_jobs = client.list_jobs(server)
                    extract_jobs = [TableauExtractJob(**j) for j in raw_jobs[:100]]
                    extract_health.total_refresh_jobs = len(raw_jobs)
                    extract_health.successful_jobs = sum(1 for j in raw_jobs if (j.get("status") or "").lower() == "completed")
                    extract_health.failed_jobs = sum(1 for j in raw_jobs if (j.get("status") or "").lower() in ("error", "failed"))
                    extract_health.cancelled_jobs = sum(1 for j in raw_jobs if (j.get("status") or "").lower() == "cancelled")
                except Exception as e:
                    logger.warning("Jobs step failed: %s", e)

            # ── Step 11: Permissions sample ───────────────────────────────────
            permissions: list[TableauPermissionEntry] = []
            if request.include_permissions and workbooks:
                _step(STEPS[10])
                try:
                    for wb in workbooks[:20]:
                        raw_perms = client.get_workbook_permissions(server, wb.id)
                        for p in raw_perms:
                            permissions.append(TableauPermissionEntry(
                                workbook_or_datasource_name=wb.name,
                                grantee_name=p["grantee_name"],
                                grantee_type=p["grantee_type"],
                                capability_name=p["capability_name"],
                                capability_mode=p["capability_mode"],
                            ))
                except Exception as e:
                    logger.warning("Permissions step failed: %s", e)

            # ── Step 12: Data quality ─────────────────────────────────────────
            _step(STEPS[11])
            data_quality = TableauDataQualityFlags(
                workbooks_with_no_views=sum(1 for wb in workbooks if wb.view_count == 0),
                datasources_with_no_workbooks=len([d for d in datasources if not d.is_certified]),
                users_with_no_activity=0,
                failed_extract_jobs=extract_health.failed_jobs,
                stale_extracts_over_7_days=extract_health.stale_datasources,
                uncertified_published_datasources=len(datasources) - len(certified),
            )

        # ── Assemble result ───────────────────────────────────────────────────
        result = TableauAssessmentResult(
            job_id=job_id,
            label=request.label,
            assessed_at=datetime.now(timezone.utc).isoformat(),
            status="completed",
            server_info=server_info,
            workbook_summary=wb_summary,
            datasource_summary=ds_summary,
            user_profile=user_profile,
            extract_health=extract_health,
            data_quality=data_quality,
            projects=projects[:200],
            workbooks=workbooks[:500],
            datasources=datasources[:500],
            views=views[:1000],
            users_list=raw_users[:500],
            groups=groups[:200],
            flows=flows[:200],
            extract_jobs=extract_jobs[:100],
            permissions=permissions[:500],
        )

        # ── Reports ───────────────────────────────────────────────────────────
        _step(STEPS[12])
        excel_bytes = _build_excel(result)

        _step(STEPS[13])
        word_bytes = _build_word(result)

        _update(
            job_id,
            status="completed",
            progress_message="Assessment complete",
            completed_at=datetime.now(timezone.utc).isoformat(),
            results=result.model_dump(),
            excel_bytes=excel_bytes,
            word_bytes=word_bytes,
        )
        logger.info("[tableau:%s] Assessment completed successfully", job_id[:8])

    except Exception as exc:
        logger.exception("[tableau:%s] Assessment failed: %s", job_id[:8], exc)
        _update(
            job_id,
            status="failed",
            error=str(exc),
            completed_at=datetime.now(timezone.utc).isoformat(),
            progress_message=f"Failed: {exc}",
        )


# ── Excel report ──────────────────────────────────────────────────────────────

def _build_excel(result: TableauAssessmentResult) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    TABLEAU_ORANGE = "E8751A"
    TABLEAU_DARK   = "1F3864"
    TABLEAU_LIGHT  = "FFF3E0"
    TABLEAU_ACCENT = "FFF8F0"
    WHITE          = "FFFFFF"
    DARK_GRAY      = "404040"
    LIGHT_GRAY     = "F5F5F5"
    FONT_NAME      = "Calibri"

    def _font(bold=False, size=11, color=DARK_GRAY, italic=False):
        return Font(name=FONT_NAME, bold=bold, size=size, color=color, italic=italic)

    def _fill(hex_c: str):
        return PatternFill("solid", fgColor=hex_c)

    def _border():
        s = Side(style="thin")
        return Border(left=s, right=s, top=s, bottom=s)

    def _align(h="left", v="center", wrap=False):
        return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

    def _hdr(ws, row, col, val, bg=TABLEAU_DARK, fg=WHITE):
        c = ws.cell(row=row, column=col, value=val)
        c.font = _font(bold=True, color=fg)
        c.fill = _fill(bg)
        c.alignment = _align("center")
        c.border = _border()

    def _cell(ws, row, col, val, shade=False):
        c = ws.cell(row=row, column=col, value=val)
        c.font = _font()
        c.fill = _fill(TABLEAU_ACCENT if shade else LIGHT_GRAY)
        c.alignment = _align()
        c.border = _border()

    def _auto_width(ws):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except Exception:
                    pass
            ws.column_dimensions[col_letter].width = min(max_len + 4, 50)

    wb = Workbook()
    wb.remove(wb.active)

    # ── Overview ──────────────────────────────────────────────────────────────
    ws = wb.create_sheet("Overview")
    ws.sheet_view.showGridLines = False
    ws.row_dimensions[1].height = 36
    ws.merge_cells("A1:D1")
    title = ws["A1"]
    server_label = result.server_info.site_name if result.server_info else (result.label or result.job_id[:8])
    title.value = f"Tableau Assessment — {server_label}"
    title.font = Font(name=FONT_NAME, bold=True, size=16, color=WHITE)
    title.fill = _fill(TABLEAU_DARK)
    title.alignment = _align("center")

    ws.merge_cells("A2:D2")
    sub = ws["A2"]
    sub.value = f"Assessed: {result.assessed_at[:19].replace('T', ' ')} UTC  |  Job: {result.job_id[:8]}"
    sub.font = _font(italic=True, size=10, color=TABLEAU_ORANGE)
    sub.fill = _fill(TABLEAU_LIGHT)
    sub.alignment = _align("center")

    overview_data = []
    if result.server_info:
        si = result.server_info
        overview_data += [
            ("Server URL", si.server_url),
            ("Site Name", si.site_name),
            ("Server Version", si.server_version),
        ]
    if result.workbook_summary:
        ws_sum = result.workbook_summary
        overview_data += [
            ("Total Workbooks", ws_sum.total_workbooks),
            ("Total Views", ws_sum.total_views),
            ("Total Sheets", ws_sum.total_sheets),
            ("Total Dashboards", ws_sum.total_dashboards),
            ("Workbooks with Extracts", ws_sum.workbooks_with_extracts),
        ]
    if result.datasource_summary:
        ds_sum = result.datasource_summary
        overview_data += [
            ("Total Data Sources", ds_sum.total_datasources),
            ("Published Data Sources", ds_sum.published_datasources),
            ("Certified Data Sources", ds_sum.certified_datasources),
            ("Extract Data Sources", ds_sum.extract_datasources),
            ("Live Connection Sources", ds_sum.live_datasources),
        ]
    if result.user_profile:
        up = result.user_profile
        overview_data += [
            ("Total Users", up.total_users),
            ("Admin Users", up.admin_users),
            ("Creator Users", up.creator_users),
            ("Explorer Users", up.explorer_users),
            ("Viewer Users", up.viewer_users),
        ]

    _hdr(ws, 4, 1, "Metric")
    _hdr(ws, 4, 2, "Value")
    for i, (k, v) in enumerate(overview_data, start=5):
        _cell(ws, i, 1, k, i % 2 == 0)
        _cell(ws, i, 2, v, i % 2 == 0)
    _auto_width(ws)

    # ── Workbooks ─────────────────────────────────────────────────────────────
    if result.workbooks:
        ws2 = wb.create_sheet("Workbooks")
        ws2.sheet_view.showGridLines = False
        headers = ["Name", "Project", "Owner", "Show Tabs", "Tags", "Size (MB)", "Created", "Updated"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws2, 1, ci, h)
        for i, wb_item in enumerate(result.workbooks, start=2):
            shade = i % 2 == 0
            row_data = [
                wb_item.name, wb_item.project_name, wb_item.owner_name,
                "Yes" if wb_item.show_tabs else "No",
                wb_item.tag_count, round(wb_item.size_mb, 2),
                wb_item.created_at or "", wb_item.updated_at or "",
            ]
            for ci, v in enumerate(row_data, 1):
                _cell(ws2, i, ci, v, shade)
        ws2.auto_filter.ref = f"A1:H{len(result.workbooks)+1}"
        ws2.freeze_panes = "A2"
        _auto_width(ws2)

    # ── Data Sources ──────────────────────────────────────────────────────────
    if result.datasources:
        ws3 = wb.create_sheet("Data Sources")
        ws3.sheet_view.showGridLines = False
        headers = ["Name", "Project", "Owner", "Type", "Has Extracts", "Certified", "Tags", "Size (MB)", "Created"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws3, 1, ci, h)
        for i, ds in enumerate(result.datasources, start=2):
            shade = i % 2 == 0
            row_data = [
                ds.name, ds.project_name, ds.owner_name,
                ds.datasource_type,
                "Yes" if ds.has_extracts else "No",
                "Yes" if ds.is_certified else "No",
                ds.tag_count, round(ds.size_mb, 2),
                ds.created_at or "",
            ]
            for ci, v in enumerate(row_data, 1):
                _cell(ws3, i, ci, v, shade)
        ws3.auto_filter.ref = f"A1:I{len(result.datasources)+1}"
        ws3.freeze_panes = "A2"
        _auto_width(ws3)

    # ── Users ─────────────────────────────────────────────────────────────────
    if result.users_list:
        ws4 = wb.create_sheet("Users")
        ws4.sheet_view.showGridLines = False
        headers = ["Username", "Email", "Role", "Site Role", "Auth Setting", "Last Login"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws4, 1, ci, h)
        for i, u in enumerate(result.users_list, start=2):
            shade = i % 2 == 0
            row_data = [
                u.get("name", ""), u.get("email", ""),
                u.get("role", ""), u.get("site_role", ""),
                u.get("auth_setting", ""), u.get("last_login", "") or "",
            ]
            for ci, v in enumerate(row_data, 1):
                _cell(ws4, i, ci, v, shade)
        ws4.auto_filter.ref = f"A1:F{len(result.users_list)+1}"
        ws4.freeze_panes = "A2"
        _auto_width(ws4)

    # ── Groups ────────────────────────────────────────────────────────────────
    if result.groups:
        ws5 = wb.create_sheet("Groups")
        ws5.sheet_view.showGridLines = False
        headers = ["Group Name", "Domain", "Member Count"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws5, 1, ci, h)
        for i, g in enumerate(result.groups, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([g.name, g.domain_name or "", g.member_count], 1):
                _cell(ws5, i, ci, v, shade)
        _auto_width(ws5)

    # ── Projects ──────────────────────────────────────────────────────────────
    if result.projects:
        ws6 = wb.create_sheet("Projects")
        ws6.sheet_view.showGridLines = False
        headers = ["Name", "Content Permissions", "Description"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws6, 1, ci, h)
        for i, p in enumerate(result.projects, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([p.name, p.content_permissions, p.description or ""], 1):
                _cell(ws6, i, ci, v, shade)
        _auto_width(ws6)

    # ── Flows ─────────────────────────────────────────────────────────────────
    if result.flows:
        ws7 = wb.create_sheet("Prep Flows")
        ws7.sheet_view.showGridLines = False
        headers = ["Flow Name", "Project", "Owner", "Created", "Updated"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws7, 1, ci, h)
        for i, f in enumerate(result.flows, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([f.name, f.project_name, f.owner_name, f.created_at or "", f.updated_at or ""], 1):
                _cell(ws7, i, ci, v, shade)
        _auto_width(ws7)

    # ── Extract Health ────────────────────────────────────────────────────────
    if result.extract_health:
        eh = result.extract_health
        ws8 = wb.create_sheet("Extract Health")
        ws8.sheet_view.showGridLines = False
        _hdr(ws8, 1, 1, "Metric")
        _hdr(ws8, 1, 2, "Value")
        eh_data = [
            ("Total Schedules", eh.total_schedules),
            ("Active Schedules", eh.active_schedules),
            ("Suspended Schedules", eh.suspended_schedules),
            ("Total Refresh Jobs", eh.total_refresh_jobs),
            ("Successful Jobs", eh.successful_jobs),
            ("Failed Jobs", eh.failed_jobs),
            ("Cancelled Jobs", eh.cancelled_jobs),
            ("Stale Data Sources (>7d)", eh.stale_datasources),
        ]
        for i, (k, v) in enumerate(eh_data, start=2):
            _cell(ws8, i, 1, k, i % 2 == 0)
            c = ws8.cell(row=i, column=2, value=v)
            is_warning = k == "Failed Jobs" and v > 0
            c.font = Font(name=FONT_NAME, bold=is_warning, color="EF4444" if is_warning else DARK_GRAY)
            c.fill = _fill(TABLEAU_ACCENT if i % 2 == 0 else LIGHT_GRAY)
            c.alignment = _align()
            c.border = _border()
        _auto_width(ws8)

    # ── Data Quality ──────────────────────────────────────────────────────────
    if result.data_quality:
        dq = result.data_quality
        ws9 = wb.create_sheet("Data Quality")
        ws9.sheet_view.showGridLines = False
        _hdr(ws9, 1, 1, "Quality Flag")
        _hdr(ws9, 1, 2, "Count")
        _hdr(ws9, 1, 3, "Severity")
        dq_data = [
            ("Workbooks with No Views",             dq.workbooks_with_no_views,            "Medium"),
            ("Failed Extract Jobs",                  dq.failed_extract_jobs,                "High"),
            ("Stale Extracts (>7 days)",             dq.stale_extracts_over_7_days,         "High"),
            ("Uncertified Published Data Sources",   dq.uncertified_published_datasources,  "Low"),
            ("Users with No Recent Activity",        dq.users_with_no_activity,             "Low"),
        ]
        for i, (k, v, sev) in enumerate(dq_data, start=2):
            shade = i % 2 == 0
            _cell(ws9, i, 1, k, shade)
            _cell(ws9, i, 2, v, shade)
            c = ws9.cell(row=i, column=3, value=sev)
            sev_color = {"High": "EF4444", "Medium": "F59E0B", "Low": "10B981"}.get(sev, DARK_GRAY)
            c.font = Font(name=FONT_NAME, bold=True, color=sev_color)
            c.fill = _fill(TABLEAU_ACCENT if shade else LIGHT_GRAY)
            c.alignment = _align("center")
            c.border = _border()
        _auto_width(ws9)

    # ── Permissions ───────────────────────────────────────────────────────────
    if result.permissions:
        ws10 = wb.create_sheet("Permissions (Sample)")
        ws10.sheet_view.showGridLines = False
        headers = ["Workbook / Data Source", "Grantee", "Grantee Type", "Capability", "Mode"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws10, 1, ci, h)
        for i, p in enumerate(result.permissions, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([
                p.workbook_or_datasource_name, p.grantee_name, p.grantee_type,
                p.capability_name, p.capability_mode,
            ], 1):
                _cell(ws10, i, ci, v, shade)
        ws10.auto_filter.ref = f"A1:E{len(result.permissions)+1}"
        ws10.freeze_panes = "A2"
        _auto_width(ws10)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Word report ───────────────────────────────────────────────────────────────

def _build_word(result: TableauAssessmentResult) -> bytes:
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    ORANGE    = RGBColor(0xE8, 0x75, 0x1A)
    DARK_BLUE = RGBColor(0x1F, 0x38, 0x64)
    WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
    DARK_GRAY = RGBColor(0x40, 0x40, 0x40)

    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)

    def _set_cell_bg(cell, hex_color: str):
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear")
        shd.set(qn("w:color"), "auto")
        shd.set(qn("w:fill"), hex_color)
        tc_pr.append(shd)

    def _heading(text: str, level: int = 1):
        p = doc.add_heading(text, level=level)
        p.runs[0].font.color.rgb = DARK_BLUE if level <= 2 else ORANGE
        p.runs[0].font.bold = True
        return p

    def _add_kv_table(rows: list[tuple]):
        table = doc.add_table(rows=len(rows) + 1, cols=2)
        table.style = "Table Grid"
        hdr = table.rows[0]
        for i, h in enumerate(["Metric", "Value"]):
            hdr.cells[i].text = h
            hdr.cells[i].paragraphs[0].runs[0].font.bold = True
            hdr.cells[i].paragraphs[0].runs[0].font.color.rgb = WHITE
            hdr.cells[i].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            _set_cell_bg(hdr.cells[i], "1F3864")
        for idx, (k, v) in enumerate(rows):
            row = table.rows[idx + 1]
            row.cells[0].text = str(k)
            row.cells[1].text = str(v)
            bg = "FFF3E0" if idx % 2 == 0 else "F5F5F5"
            _set_cell_bg(row.cells[0], bg)
            _set_cell_bg(row.cells[1], bg)
        doc.add_paragraph()

    # Cover page
    site_label = result.server_info.site_name if result.server_info else (result.label or "Unknown")
    doc.add_paragraph()
    cover_title = doc.add_paragraph()
    cover_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = cover_title.add_run("TABLEAU")
    r.font.size = Pt(32)
    r.font.bold = True
    r.font.color.rgb = ORANGE

    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_r = sub_p.add_run("Source Assessment Report")
    sub_r.font.size = Pt(18)
    sub_r.font.color.rgb = DARK_BLUE

    doc.add_paragraph()
    comp_p = doc.add_paragraph()
    comp_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    comp_r = comp_p.add_run(site_label)
    comp_r.font.size = Pt(14)
    comp_r.font.bold = True
    comp_r.font.color.rgb = DARK_GRAY

    date_p = doc.add_paragraph()
    date_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_r = date_p.add_run(f"Assessment Date: {result.assessed_at[:10]}")
    date_r.font.size = Pt(11)
    date_r.font.color.rgb = RGBColor(0x80, 0x80, 0x80)

    doc.add_page_break()

    # Executive Summary
    _heading("Executive Summary", 1)
    si = result.server_info
    ws_sum = result.workbook_summary
    ds_sum = result.datasource_summary
    up = result.user_profile
    if si and ws_sum and up:
        summary = (
            f"Tableau Server at {si.server_url} (version {si.server_version}, site: {si.site_name}) "
            f"hosts {ws_sum.total_workbooks} workbooks with {ws_sum.total_views} views across "
            f"{len(result.projects or [])} projects. "
            f"There are {ds_sum.total_datasources if ds_sum else 0} published data sources "
            f"({ds_sum.certified_datasources if ds_sum else 0} certified) and "
            f"{up.total_users} licensed users."
        )
        doc.add_paragraph(summary)
    doc.add_paragraph()

    # Server Info
    if si:
        _heading("Server Information", 2)
        _add_kv_table([
            ("Server URL", si.server_url),
            ("Site Name", si.site_name),
            ("Server Version", si.server_version),
        ])

    # Workbook Summary
    if ws_sum:
        _heading("Workbook Summary", 2)
        _add_kv_table([
            ("Total Workbooks", ws_sum.total_workbooks),
            ("Total Views", ws_sum.total_views),
            ("Total Sheets", ws_sum.total_sheets),
            ("Total Dashboards", ws_sum.total_dashboards),
            ("Workbooks with Extracts", ws_sum.workbooks_with_extracts),
            ("Avg Views per Workbook", f"{ws_sum.avg_views_per_workbook:.1f}"),
        ])

    # Data Source Summary
    if ds_sum:
        _heading("Data Source Summary", 2)
        _add_kv_table([
            ("Total Data Sources", ds_sum.total_datasources),
            ("Published Data Sources", ds_sum.published_datasources),
            ("Certified Data Sources", ds_sum.certified_datasources),
            ("Extract Data Sources", ds_sum.extract_datasources),
            ("Live Connection Sources", ds_sum.live_datasources),
            ("Connection Types", ", ".join(ds_sum.connection_types) or "N/A"),
        ])

    # User Profile
    if up:
        _heading("User Profile", 2)
        _add_kv_table([
            ("Total Users", up.total_users),
            ("Admin Users", up.admin_users),
            ("Site Admin Users", up.site_admin_users),
            ("Creator Users", up.creator_users),
            ("Explorer Users", up.explorer_users),
            ("Viewer Users", up.viewer_users),
            ("Unlicensed Users", up.unlicensed_users),
        ])

    # Extract Health
    if result.extract_health:
        eh = result.extract_health
        _heading("Extract Refresh Health", 2)
        _add_kv_table([
            ("Total Schedules", eh.total_schedules),
            ("Active Schedules", eh.active_schedules),
            ("Suspended Schedules", eh.suspended_schedules),
            ("Total Refresh Jobs", eh.total_refresh_jobs),
            ("Successful Jobs", eh.successful_jobs),
            ("Failed Jobs", eh.failed_jobs),
            ("Cancelled Jobs", eh.cancelled_jobs),
        ])

    # Flows
    if result.flows:
        _heading("Tableau Prep Flows", 2)
        _add_kv_table([("Total Prep Flows", len(result.flows))])

    # Data Quality
    if result.data_quality:
        dq = result.data_quality
        _heading("Data Quality Flags", 2)
        _add_kv_table([
            ("Workbooks with No Views",             dq.workbooks_with_no_views),
            ("Failed Extract Jobs",                  dq.failed_extract_jobs),
            ("Stale Extracts (>7 days)",             dq.stale_extracts_over_7_days),
            ("Uncertified Published Data Sources",   dq.uncertified_published_datasources),
            ("Users with No Recent Activity",        dq.users_with_no_activity),
        ])

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
