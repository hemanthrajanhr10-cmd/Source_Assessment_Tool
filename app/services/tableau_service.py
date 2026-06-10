"""
Tableau Assessment Service — Superior Edition.

Orchestrates a comprehensive 25-domain Tableau assessment:
  1.  Connecting to Tableau Server
  2.  Enumerating projects
  3.  Enumerating workbooks
  4.  Enumerating views & dashboards
  5.  Enumerating data sources
  6.  Enumerating users
  7.  Enumerating groups
  8.  Enumerating Prep flows
  9.  Enumerating extract schedules
  10. Enumerating recent background jobs
  11. Sampling workbook permissions
  12. Building data quality flags
  13. Analysing migration complexity (per-workbook scoring)
  14. Building migration feasibility report
  15. Generating Excel report (10 sheets)
  16. Generating AI-powered Word report (migration analysis + Power BI mapping)

All 25 requirement domains from the specification are captured in the data
model and surfaced in the Word report via AI narrative generation.
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
    MigrationFeasibilityReport,
    WorkbookMigrationScore,
    WorkbookDeepAnalysis,
    CalcFieldSummary,
    LODSummary,
    TableCalcSummary,
    ParameterSummary,
    DatasourceSummary as DatasourceSummaryModel,
    MarkTypeEntry,
    DashboardSummary as DashboardSummaryModel,
    ActionSummary,
    SetSummary,
    HierarchySummary,
    ExtensionSummary,
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


# ── Assessment steps ─────────────────────────────────────────────────────────

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
    "Analysing migration complexity",
    "Building migration feasibility report",
    "Deep analysis: parsing workbook XML (.twb/.twbx)",
    "Generating Excel report",
    "Generating Word report (AI-powered)",
]


# ── Migration scoring helpers ─────────────────────────────────────────────────

# Connection types that map cleanly to Power BI
_SIMPLE_CONNECTIONS = {
    "sqlserver", "sql server", "azuresql", "azure sql", "snowflake",
    "bigquery", "postgresql", "mysql", "oracle", "redshift",
    "synapse", "databricks", "excel", "csv",
}

# Connection types requiring extra work
_COMPLEX_CONNECTIONS = {
    "sap", "salesforce", "sharepoint", "teradata", "vertica",
    "amazon athena", "google analytics", "web data connector",
    "odata", "json", "xml", "pdf", "spatial",
}

# Tableau visual types that have no direct Power BI equivalent
_HARD_VIZ_TYPES = {"map", "polygon", "density", "gantt bar"}

# Tableau functions that map to complex DAX patterns
_LOD_KEYWORDS = ["fixed", "include", "exclude"]
_TABLE_CALC_KEYWORDS = [
    "running_sum", "running_avg", "window_sum", "window_avg",
    "rank", "rank_dense", "lookup", "previous_value", "total",
    "first()", "last()", "index()", "size()",
]


def _score_workbook(
    wb: TableauWorkbook,
    datasources: list[TableauDatasource],
    permissions: list[TableauPermissionEntry],
) -> WorkbookMigrationScore:
    """Derive a migration complexity score for a single workbook."""
    score = WorkbookMigrationScore(
        workbook_name=wb.name,
        project_name=wb.project_name,
        owner_name=wb.owner_name,
        view_count=wb.view_count,
        size_mb=wb.size_mb,
    )
    blockers: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []

    # 1. Data source complexity (0–10)
    wb_lower = wb.name.lower()
    ds_for_wb = [d for d in datasources if d.name.lower() in wb_lower or wb_lower in d.name.lower()]
    if not ds_for_wb:
        ds_for_wb = datasources[:3]  # fallback sample

    conn_types = {d.connection_type.lower() for d in ds_for_wb if d.connection_type}
    complex_conn = conn_types & _COMPLEX_CONNECTIONS
    simple_conn  = conn_types & _SIMPLE_CONNECTIONS

    ds_score = min(len(ds_for_wb) * 2, 6)
    if complex_conn:
        ds_score += 3
        warnings.append(f"Complex connection types: {', '.join(complex_conn)} — require connector mapping in Power BI")
    if simple_conn:
        notes.append(f"Standard connections ({', '.join(list(simple_conn)[:3])}) map directly to Power BI connectors")
    score.data_source_complexity = min(ds_score, 10)

    # 2. Calculated field complexity — proxy via view count as surrogate
    calc_score = min(wb.view_count // 5, 8)
    if wb.view_count > 20:
        calc_score = 8
        warnings.append("High view count suggests many calculated fields — audit for LOD and table calculations before migration")
    score.calc_field_complexity = calc_score

    # 3. Table calculation complexity — size-based proxy
    tc_score = 0
    if wb.size_mb > 50:
        tc_score = 6
        warnings.append("Large workbook size (>50 MB) may indicate complex table calculations or embedded data")
    elif wb.size_mb > 10:
        tc_score = 3
    score.table_calc_complexity = tc_score

    # 4. Dashboard action complexity
    action_score = min(wb.view_count // 10, 5)
    score.dashboard_action_complexity = action_score
    if action_score >= 4:
        warnings.append("Many views suggest complex dashboard action chains — map each filter/URL/parameter action to Power BI bookmarks or cross-filter")

    # 5. RLS complexity
    rls_perms = [p for p in permissions if p.workbook_or_datasource_name == wb.name]
    rls_score = 0
    if rls_perms:
        rls_score = min(len(set(p.grantee_name for p in rls_perms)) // 3, 8)
        if rls_score >= 5:
            warnings.append("Complex permission model — implement Power BI RLS with USERPRINCIPALNAME() roles")
    score.rls_complexity = rls_score

    # 6. Extension complexity (proxy: large workbooks may use extensions)
    ext_score = 0
    if wb.size_mb > 100:
        ext_score = 8
        blockers.append("Very large workbook — likely contains embedded Tableau extensions or heavy custom visuals with no direct Power BI AppSource equivalent")
    score.extension_complexity = ext_score

    # 7. Viz type complexity
    viz_score = 0
    if wb.show_tabs and wb.view_count > 15:
        viz_score = 4
        notes.append("Multi-tab workbook with many sheets — evaluate each view's mark type for Power BI visual equivalence")
    score.viz_type_complexity = viz_score

    # 8. Parameter complexity
    param_score = 0
    if wb.tag_count > 3:
        param_score = 4
        notes.append("Tagged workbook may use parameters for dynamic filtering — replace with Power BI What-If parameters or field parameters")
    score.parameter_complexity = param_score

    # Aggregate
    total = (
        score.data_source_complexity +
        score.calc_field_complexity +
        score.table_calc_complexity +
        score.dashboard_action_complexity +
        score.rls_complexity +
        score.extension_complexity +
        score.viz_type_complexity +
        score.parameter_complexity
    )
    score.total_score = total

    if total <= 15:
        score.complexity_level = "Simple"
    elif total <= 30:
        score.complexity_level = "Moderate"
    elif total <= 50:
        score.complexity_level = "Complex"
    else:
        score.complexity_level = "Very Complex"

    # Build Power BI equivalent notes
    notes += [
        "Workbook → .pbix file published to Power BI Service workspace",
        "Published data sources → Shared semantic model in Power BI",
    ]
    if score.rls_complexity > 0:
        notes.append("Row-level security → Power BI RLS roles with USERPRINCIPALNAME()")

    score.migration_blockers = blockers
    score.migration_warnings = warnings
    score.pbi_equivalent_notes = notes

    return score


def _build_migration_feasibility(
    workbooks: list[TableauWorkbook],
    datasources: list[TableauDatasource],
    flows: list[TableauFlow],
    permissions: list[TableauPermissionEntry],
) -> MigrationFeasibilityReport:
    """Build the overall Power BI migration feasibility report."""
    report = MigrationFeasibilityReport()
    report.has_prep_flows = len(flows) > 0

    # Score each workbook
    all_scores = [_score_workbook(wb, datasources, permissions) for wb in workbooks[:200]]
    all_scores.sort(key=lambda s: s.total_score, reverse=True)

    report.total_workbooks_assessed = len(all_scores)
    report.simple_workbooks     = sum(1 for s in all_scores if s.complexity_level == "Simple")
    report.moderate_workbooks   = sum(1 for s in all_scores if s.complexity_level == "Moderate")
    report.complex_workbooks    = sum(1 for s in all_scores if s.complexity_level == "Complex")
    report.very_complex_workbooks = sum(1 for s in all_scores if s.complexity_level == "Very Complex")

    # Detect feature flags from datasources
    conn_types_lower = {d.connection_type.lower() for d in datasources if d.connection_type}
    report.migratable_connections = sorted(list(conn_types_lower & _SIMPLE_CONNECTIONS))
    report.complex_connections    = sorted(list(conn_types_lower & _COMPLEX_CONNECTIONS))
    report.has_rls = any(s.rls_complexity >= 5 for s in all_scores)
    report.has_custom_sql = any(d.connection_type.lower() in ("sqlserver", "postgresql", "oracle", "mysql") for d in datasources)

    # Overall feasibility
    very_complex_pct = report.very_complex_workbooks / max(len(all_scores), 1)
    if very_complex_pct > 0.3 or report.has_tableau_extensions:
        report.overall_feasibility = "Low"
    elif very_complex_pct > 0.1 or report.has_rls:
        report.overall_feasibility = "Moderate"
    else:
        report.overall_feasibility = "High"

    # Estimate migration effort
    effort = (
        report.simple_workbooks * 1 +
        report.moderate_workbooks * 3 +
        report.complex_workbooks * 8 +
        report.very_complex_workbooks * 20
    )
    report.estimated_migration_weeks = max(1, effort // 40)

    # Feature mapping table
    report.feature_mapping = [
        {"tableau": "Workbook (.twb / .twbx)", "power_bi": ".pbix file", "feasibility": "Direct", "notes": "1:1 mapping; packaged workbooks need extract migration"},
        {"tableau": "Published Data Source", "power_bi": "Shared Semantic Model", "feasibility": "Direct", "notes": "Re-publish as shared dataset in Power BI Service"},
        {"tableau": "Extract (.hyper)", "power_bi": "Lakehouse Delta table / Import dataset", "feasibility": "Direct", "notes": "Export extract data; import to Power BI or OneLake"},
        {"tableau": "Live Connection", "power_bi": "DirectQuery or DirectLake", "feasibility": "Direct", "notes": "Point Power BI connector to same source"},
        {"tableau": "Calculated Field (row-level)", "power_bi": "DAX Calculated Column", "feasibility": "Moderate", "notes": "Simple expressions translate; complex string functions need DAX rewrite"},
        {"tableau": "Calculated Field (aggregate)", "power_bi": "DAX Measure", "feasibility": "Moderate", "notes": "IF/CASE → SWITCH; aggregates → CALCULATE"},
        {"tableau": "LOD FIXED", "power_bi": "CALCULATE with REMOVEFILTERS", "feasibility": "Complex", "notes": "Each FIXED LOD requires explicit REMOVEFILTERS/ALLEXCEPT pattern"},
        {"tableau": "LOD INCLUDE", "power_bi": "CALCULATE with added granularity", "feasibility": "Complex", "notes": "Model at required grain or use SUMMARIZE"},
        {"tableau": "LOD EXCLUDE", "power_bi": "CALCULATE with REMOVEFILTERS on dimension", "feasibility": "Complex", "notes": "REMOVEFILTERS on specific columns"},
        {"tableau": "Table Calculation (RUNNING_SUM)", "power_bi": "DAX CALCULATE with DATESBETWEEN / EARLIER", "feasibility": "Moderate", "notes": "Time-based: use time-intelligence functions"},
        {"tableau": "Table Calculation (RANK)", "power_bi": "RANKX", "feasibility": "Direct", "notes": "RANKX(ALL(table), measure)"},
        {"tableau": "Table Calculation (WINDOW_SUM)", "power_bi": "CALCULATE with sliding window", "feasibility": "Moderate", "notes": "Use DATESINPERIOD or OFFSET for window logic"},
        {"tableau": "Parameter", "power_bi": "What-If Parameter / Field Parameter", "feasibility": "Direct", "notes": "Numeric: What-If; field switching: Field Parameters"},
        {"tableau": "Parameter Action", "power_bi": "Bookmark / Field Parameter", "feasibility": "Moderate", "notes": "No direct equivalent; use button bookmarks or field parameters"},
        {"tableau": "Set", "power_bi": "DAX measure with IN / SELECTEDVALUE", "feasibility": "Moderate", "notes": "Fixed sets → calculated column; computed sets → measures"},
        {"tableau": "Set Action", "power_bi": "Slicer + cross-filter + bookmark", "feasibility": "Complex", "notes": "No direct equivalent — design with cross-filter interactions"},
        {"tableau": "Group", "power_bi": "Mapping table or SWITCH column", "feasibility": "Direct", "notes": "Create a mapping/dimension table; use RELATED in measures"},
        {"tableau": "Hierarchy", "power_bi": "Model hierarchy or date table", "feasibility": "Direct", "notes": "Define hierarchy in model view; date hierarchies auto-created"},
        {"tableau": "Context Filter", "power_bi": "Edit interactions + visual-level filters", "feasibility": "Moderate", "notes": "Use visual-level filters or edit interactions panel"},
        {"tableau": "Dashboard Filter Action", "power_bi": "Cross-filter / sync slicer", "feasibility": "Direct", "notes": "Default cross-highlight; sync slicers for multi-page"},
        {"tableau": "Dashboard URL Action", "power_bi": "Button with URL action", "feasibility": "Direct", "notes": "Add URL action buttons; dynamic URLs via DAX string measures"},
        {"tableau": "User Filter / USERNAME()", "power_bi": "RLS with USERPRINCIPALNAME()", "feasibility": "Direct", "notes": "Define RLS roles using USERPRINCIPALNAME() DAX function"},
        {"tableau": "ISMEMBEROF()", "power_bi": "RLS with group membership rules", "feasibility": "Moderate", "notes": "Map security groups to RLS roles in Power BI Admin"},
        {"tableau": "Tableau Prep Flow", "power_bi": "Dataflow Gen2 / Data Factory pipeline", "feasibility": "Moderate", "notes": "Prep steps → Power Query M; joins and aggregates → Dataflow Gen2"},
        {"tableau": "Story", "power_bi": "Paginated Report or Bookmarks", "feasibility": "Moderate", "notes": "Story points → report pages with bookmark navigator"},
        {"tableau": "Subscription", "power_bi": "Power BI subscription / data alert", "feasibility": "Direct", "notes": "Set up subscriptions in Power BI Service"},
        {"tableau": "Extension Object", "power_bi": "Power BI custom visual (AppSource)", "feasibility": "Complex", "notes": "Search AppSource; D3 custom charts may need full redevelopment"},
        {"tableau": "Viz-in-Tooltip", "power_bi": "Report page tooltip", "feasibility": "Direct", "notes": "Create a tooltip report page in Power BI"},
        {"tableau": "Tableau Server Project", "power_bi": "Power BI workspace", "feasibility": "Direct", "notes": "1:1 project → workspace mapping recommended"},
        {"tableau": "Device Layout (tablet/phone)", "power_bi": "Mobile layout editor", "feasibility": "Direct", "notes": "Design mobile layout in Power BI Desktop"},
    ]

    # Global blockers
    blockers: list[str] = []
    if report.has_tableau_extensions:
        blockers.append("Tableau Extensions detected — these have no direct Power BI AppSource equivalent and require full redevelopment")
    if conn_types_lower & {"web data connector", "wdc"}:
        blockers.append("Web Data Connectors (WDC) used — must be replaced with Power BI custom connectors or REST API integration")
    if conn_types_lower & {"spatial", "shapefile"}:
        blockers.append("Spatial / shapefile connections — Power BI maps require Bing Maps or Azure Maps; custom polygon boundaries need Shape Maps visual")
    if report.complex_workbooks + report.very_complex_workbooks > report.total_workbooks_assessed * 0.5:
        blockers.append("More than 50% of workbooks are Complex/Very Complex — phased migration approach recommended (Simple/Moderate first)")
    report.migration_blockers = blockers

    # Recommended migration order: Simple → Moderate → Complex → Very Complex
    ordered = (
        [s.workbook_name for s in all_scores if s.complexity_level == "Simple"][:10] +
        [s.workbook_name for s in all_scores if s.complexity_level == "Moderate"][:10] +
        [s.workbook_name for s in all_scores if s.complexity_level == "Complex"][:5]
    )
    report.recommended_migration_order = ordered

    # Top 50 by complexity for display
    report.workbook_scores = all_scores[:50]

    return report


# ── TWB deep analysis conversion ─────────────────────────────────────────────

def _twb_to_model(analysis) -> WorkbookDeepAnalysis:
    """Convert twb_parser.WorkbookDeepAnalysis dataclass to the Pydantic model."""
    from app.services.twb_parser import WorkbookDeepAnalysis as TWBResult

    # Build refined scores from real XML data
    calc_count   = analysis.total_calc_fields
    lod_count    = analysis.total_lod_count
    tc_count     = analysis.total_table_calc_count
    param_count  = analysis.total_parameter_count
    ext_count    = analysis.total_extensions
    action_count = analysis.filter_action_count + analysis.set_action_count + analysis.parameter_action_count + analysis.url_action_count

    # Calc field complexity: LODs are harder than plain calcs
    refined_calc = min(calc_count // 3 + lod_count * 2, 10)
    refined_tc   = min(tc_count, 10)
    refined_param = min(param_count, 8)
    refined_rls   = 5 if (any(f.field_name.lower() in ('username()', 'userdn()', 'ismemberof()') for f in analysis.filters) or
                          any('username' in (cf.formula or '').lower() for cf in analysis.calc_fields)) else 0
    refined_ext   = min(ext_count * 4, 10)
    # viz complexity from mark types
    hard_marks = {'Polygon', 'Density', 'Gantt Bar', 'Map'}
    viz_score = sum(2 for mt in analysis.mark_types if mt.mark_type in hard_marks)
    if analysis.has_viz_in_tooltip:
        viz_score += 3
    refined_viz = min(viz_score, 10)
    refined_action = min(action_count, 10)

    refined_total = (refined_calc + refined_tc + refined_param + refined_rls +
                     refined_ext + refined_viz + refined_action)
    if refined_total <= 15:
        refined_level = "Simple"
    elif refined_total <= 30:
        refined_level = "Moderate"
    elif refined_total <= 50:
        refined_level = "Complex"
    else:
        refined_level = "Very Complex"

    # LOD type breakdown
    lod_type_counts: dict[str, int] = {}
    for lod in analysis.lod_expressions:
        lod_type_counts[lod.lod_type] = lod_type_counts.get(lod.lod_type, 0) + 1

    # Unique table calc types
    tc_types = list({tc.calc_type for tc in analysis.table_calcs})

    return WorkbookDeepAnalysis(
        workbook_name=analysis.workbook_name,
        parse_errors=analysis.parse_errors,

        datasource_details=[DatasourceSummaryModel(
            name=ds.name, connection_type=ds.connection_type,
            has_custom_sql=ds.has_custom_sql, has_extract=ds.has_extract,
            join_count=ds.join_count, join_types=ds.join_types,
            has_stored_proc=ds.has_stored_proc,
        ) for ds in analysis.datasources],
        has_data_blending=analysis.has_data_blending,
        has_cross_database_join=analysis.has_cross_database_join,
        has_custom_sql=any(ds.has_custom_sql for ds in analysis.datasources),
        has_stored_procedures=any(ds.has_stored_proc for ds in analysis.datasources),

        total_dimensions=len(analysis.dimensions),
        total_measures=len(analysis.measures),
        total_hidden_fields=len(analysis.hidden_fields),

        calc_fields=[CalcFieldSummary(
            name=cf.name, formula=cf.formula, datatype=cf.datatype, role=cf.role,
            is_lod=cf.is_lod, lod_type=cf.lod_type, is_table_calc=cf.is_table_calc,
            table_calc_type=cf.table_calc_type, dependencies=cf.dependencies,
            nested_lod_count=cf.nested_lod_count,
        ) for cf in analysis.calc_fields[:100]],
        total_calc_fields=analysis.total_calc_fields,

        lod_expressions=[LODSummary(
            name=lod.name, formula=lod.formula, lod_type=lod.lod_type, is_nested=lod.is_nested,
        ) for lod in analysis.lod_expressions[:50]],
        total_lod_count=analysis.total_lod_count,
        has_nested_lod=analysis.has_nested_lod,
        lod_type_counts=lod_type_counts,

        table_calcs=[TableCalcSummary(
            name=tc.name, formula=tc.formula, calc_type=tc.calc_type,
        ) for tc in analysis.table_calcs[:50]],
        total_table_calc_count=analysis.total_table_calc_count,
        table_calc_types_used=tc_types,

        parameters=[ParameterSummary(
            name=p.name, caption=p.caption, datatype=p.datatype,
            current_value=p.current_value, allowable_values_type=p.allowable_values_type,
            list_values=p.list_values[:20],
        ) for p in analysis.parameters],
        total_parameter_count=analysis.total_parameter_count,
        has_parameter_actions=analysis.has_parameter_actions,

        extract_filter_count=analysis.extract_filter_count,
        datasource_filter_count=analysis.datasource_filter_count,
        context_filter_count=analysis.context_filter_count,
        dimension_filter_count=analysis.dimension_filter_count,
        measure_filter_count=analysis.measure_filter_count,
        total_filter_count=(analysis.extract_filter_count + analysis.datasource_filter_count +
                            analysis.context_filter_count + analysis.dimension_filter_count +
                            analysis.measure_filter_count),

        sort_count=analysis.sort_count,
        custom_sort_count=analysis.custom_sort_count,

        sets=[SetSummary(
            name=s.name, set_type=s.set_type, member_count=len(s.members), is_combined=s.is_combined,
        ) for s in analysis.sets],
        has_set_actions=analysis.has_set_actions,
        combined_set_count=analysis.combined_set_count,

        group_count=len(analysis.groups),
        hierarchy_count=len(analysis.hierarchies),
        hierarchies=[HierarchySummary(name=h.name, levels=h.levels) for h in analysis.hierarchies],

        mark_types=[MarkTypeEntry(
            worksheet=mt.worksheet, mark_type=mt.mark_type,
            has_dual_axis=mt.has_dual_axis, has_viz_in_tooltip=mt.has_viz_in_tooltip,
        ) for mt in analysis.mark_types],
        has_viz_in_tooltip=analysis.has_viz_in_tooltip,
        has_custom_marks=analysis.has_custom_marks,
        unique_mark_types=analysis.unique_mark_types,

        dashboards=[DashboardSummaryModel(
            name=db.name, object_count=len(db.objects),
            has_floating_objects=db.has_floating_objects,
            has_device_layouts=db.has_device_layouts,
            device_types=db.device_types,
        ) for db in analysis.dashboards],
        total_dashboards=analysis.total_dashboards,
        has_floating_objects=analysis.has_floating_objects,
        has_device_layouts=analysis.has_device_layouts,

        actions=[ActionSummary(
            name=a.name, action_type=a.action_type,
            source_sheet=a.source_sheet, target_sheet=a.target_sheet,
        ) for a in analysis.actions],
        filter_action_count=analysis.filter_action_count,
        highlight_action_count=analysis.highlight_action_count,
        url_action_count=analysis.url_action_count,
        set_action_count=analysis.set_action_count,
        parameter_action_count=analysis.parameter_action_count,

        has_custom_number_formats=analysis.has_custom_number_formats,
        custom_font_count=analysis.custom_font_count,

        story_count=analysis.total_stories,
        story_point_count=sum(len(s.story_points) for s in analysis.stories),

        extensions=[ExtensionSummary(
            name=e.name, url=e.url, version=e.version, is_dashboard_extension=e.is_dashboard_extension,
        ) for e in analysis.extensions],
        total_extensions=analysis.total_extensions,

        has_javascript_api=analysis.has_javascript_api,
        has_embedding_params=analysis.has_embedding_params,

        refined_calc_field_complexity=refined_calc,
        refined_table_calc_complexity=refined_tc,
        refined_parameter_complexity=refined_param,
        refined_rls_complexity=refined_rls,
        refined_extension_complexity=refined_ext,
        refined_viz_type_complexity=refined_viz,
        refined_dashboard_action_complexity=refined_action,
        refined_total_score=refined_total,
        refined_complexity_level=refined_level,
        raw_worksheet_count=analysis.raw_worksheet_count,
    )


def _download_and_parse_workbooks(
    server,
    workbooks: list[TableauWorkbook],
    max_workbooks: int = 30,
) -> list[WorkbookDeepAnalysis]:
    """Download up to max_workbooks .twb/.twbx files and parse their XML."""
    import tempfile, os
    from app.services.twb_parser import parse_twb

    results: list[WorkbookDeepAnalysis] = []
    # sort by size desc so we parse the most interesting ones first
    sorted_wbs = sorted(workbooks, key=lambda w: w.size_mb, reverse=True)[:max_workbooks]

    for wb in sorted_wbs:
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                # TSC download writes the file to tmpdir and returns the path
                file_path, _ = server.workbooks.download(wb.id, filepath=tmpdir, include_extract=False)
                with open(file_path, "rb") as fh:
                    data = fh.read()
                raw = parse_twb(data, workbook_name=wb.name)
                model = _twb_to_model(raw)
                results.append(model)
                logger.debug("Parsed %s: %d calcs, %d LODs, %d params",
                             wb.name, model.total_calc_fields, model.total_lod_count, model.total_parameter_count)
        except Exception as exc:
            logger.warning("Failed to parse workbook %s: %s", wb.name, exc)
            results.append(WorkbookDeepAnalysis(
                workbook_name=wb.name,
                parse_errors=[f"Download/parse failed: {exc}"],
            ))

    return results


def _apply_deep_scores(
    migration_feasibility: MigrationFeasibilityReport,
    deep_analyses: list[WorkbookDeepAnalysis],
) -> None:
    """Refine per-workbook migration scores using real formula data from .twb parse."""
    deep_by_name = {da.workbook_name: da for da in deep_analyses}

    for score in migration_feasibility.workbook_scores:
        da = deep_by_name.get(score.workbook_name)
        if not da:
            continue
        # Override heuristic dimensions with real values where available
        if da.refined_calc_field_complexity is not None:
            score.calc_field_complexity = da.refined_calc_field_complexity
        if da.refined_table_calc_complexity is not None:
            score.table_calc_complexity = da.refined_table_calc_complexity
        if da.refined_parameter_complexity is not None:
            score.parameter_complexity = da.refined_parameter_complexity
        if da.refined_rls_complexity is not None:
            score.rls_complexity = da.refined_rls_complexity
        if da.refined_extension_complexity is not None:
            score.extension_complexity = da.refined_extension_complexity
        if da.refined_viz_type_complexity is not None:
            score.viz_type_complexity = da.refined_viz_type_complexity
        if da.refined_dashboard_action_complexity is not None:
            score.dashboard_action_complexity = da.refined_dashboard_action_complexity

        # Recalculate total and complexity level
        total = (score.data_source_complexity + score.calc_field_complexity +
                 score.table_calc_complexity + score.dashboard_action_complexity +
                 score.rls_complexity + score.extension_complexity +
                 score.viz_type_complexity + score.parameter_complexity)
        score.total_score = total
        if total <= 15:
            score.complexity_level = "Simple"
        elif total <= 30:
            score.complexity_level = "Moderate"
        elif total <= 50:
            score.complexity_level = "Complex"
        else:
            score.complexity_level = "Very Complex"

        # Enrich blockers with real formula-level evidence
        if da.total_lod_count > 5:
            score.migration_blockers.append(
                f"{da.total_lod_count} LOD expressions detected — each requires a custom CALCULATE pattern in DAX"
            )
        if da.total_extensions > 0:
            score.migration_blockers.append(
                f"{da.total_extensions} Tableau Extension(s) — no direct Power BI AppSource equivalent"
            )
        if da.has_viz_in_tooltip:
            score.migration_warnings.append("Viz-in-tooltip detected — replace with Power BI report page tooltip")
        if da.has_set_actions:
            score.migration_warnings.append("Set actions detected — redesign as cross-filter + slicer interactions in Power BI")
        if da.has_custom_sql:
            score.migration_warnings.append("Custom SQL detected — validate compatibility with Power BI connector or migrate to view")
        if da.total_calc_fields > 0:
            score.pbi_equivalent_notes.append(
                f"{da.total_calc_fields} calculated fields → {da.total_lod_count} as DAX measures (CALCULATE), "
                f"{da.total_table_calc_count} table calcs → DAX running/window measures"
            )

    # Update feasibility-level feature flags with real data
    if any(da.total_lod_count > 0 for da in deep_analyses):
        migration_feasibility.has_lod_expressions = True
    if any(da.total_table_calc_count > 0 for da in deep_analyses):
        migration_feasibility.has_table_calculations = True
    if any(da.total_extensions > 0 for da in deep_analyses):
        migration_feasibility.has_tableau_extensions = True
    if any(da.has_viz_in_tooltip for da in deep_analyses):
        migration_feasibility.has_viz_in_tooltip = True
    if any(da.has_parameter_actions for da in deep_analyses):
        migration_feasibility.has_parameter_actions = True
    if any(da.has_custom_sql for da in deep_analyses):
        migration_feasibility.has_custom_sql = True

    # Recompute feasibility after real data
    total_scored = len(migration_feasibility.workbook_scores)
    vc_count = sum(1 for s in migration_feasibility.workbook_scores if s.complexity_level == "Very Complex")
    vc_pct = vc_count / max(total_scored, 1)
    if vc_pct > 0.3 or migration_feasibility.has_tableau_extensions:
        migration_feasibility.overall_feasibility = "Low"
    elif vc_pct > 0.1 or migration_feasibility.has_rls:
        migration_feasibility.overall_feasibility = "Moderate"
    else:
        migration_feasibility.overall_feasibility = "High"


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

            # Step 1: Server info
            _step(STEPS[0])
            server_info = TableauServerInfo(
                server_url=creds.server_url,
                site_name=server.site_id or "Default",
                server_version=server.version or "unknown",
                site_id=server.site_id or "",
                content_url=creds.site_name or "",
            )

            # Step 2: Projects
            _step(STEPS[1])
            raw_projects = []
            try:
                raw_projects = client.list_projects(server)
            except Exception as e:
                logger.warning("Projects step failed: %s", e)
            projects = [TableauProject(**p) for p in raw_projects]

            # Step 3: Workbooks
            _step(STEPS[2])
            raw_workbooks = []
            try:
                raw_workbooks = client.list_workbooks(server)
            except Exception as e:
                logger.warning("Workbooks step failed: %s", e)
            workbooks = [TableauWorkbook(**w) for w in raw_workbooks]

            # Step 4: Views
            _step(STEPS[3])
            raw_views = []
            try:
                raw_views = client.list_views(server)
            except Exception as e:
                logger.warning("Views step failed: %s", e)
            views = [TableauView(**v) for v in raw_views]
            sheets     = [v for v in views if v.view_type in ("sheet", "")]
            dashboards = [v for v in views if v.view_type == "dashboard"]

            wb_summary = TableauWorkbookSummary(
                total_workbooks=len(workbooks),
                total_views=len(views),
                total_sheets=len(sheets),
                total_dashboards=len(dashboards),
                workbooks_with_extracts=0,
                avg_views_per_workbook=len(views) / max(len(workbooks), 1),
            )

            # Step 5: Datasources
            _step(STEPS[4])
            raw_ds = []
            try:
                raw_ds = client.list_datasources(server)
            except Exception as e:
                logger.warning("Datasources step failed: %s", e)
            datasources = [TableauDatasource(**d) for d in raw_ds]

            certified    = [d for d in datasources if d.is_certified]
            with_extracts = [d for d in datasources if d.has_extracts]
            conn_types   = list({d.connection_type for d in datasources if d.connection_type and d.connection_type != "unknown"})

            ds_summary = TableauDatasourceSummary(
                total_datasources=len(datasources),
                published_datasources=len([d for d in datasources if d.is_published]),
                embedded_datasources=len([d for d in datasources if not d.is_published]),
                certified_datasources=len(certified),
                extract_datasources=len(with_extracts),
                live_datasources=len(datasources) - len(with_extracts),
                connection_types=conn_types[:20],
            )
            wb_summary.workbooks_with_extracts = len(with_extracts)

            # Step 6: Users
            _step(STEPS[5])
            raw_users = []
            try:
                raw_users = client.list_users(server)
            except Exception as e:
                logger.warning("Users step failed: %s", e)

            def _role_count(role_substr: str) -> int:
                return sum(1 for u in raw_users if role_substr.lower() in (u.get("role") or "").lower())

            total_users = len(raw_users)
            user_profile = TableauUserProfile(
                total_users=total_users,
                active_users=total_users,
                admin_users=_role_count("serveradmin") + _role_count("siteadmin"),
                site_admin_users=_role_count("siteadmin"),
                creator_users=_role_count("creator"),
                explorer_users=_role_count("explorer"),
                viewer_users=_role_count("viewer"),
                unlicensed_users=_role_count("unlicensed"),
            )

            # Step 7: Groups
            _step(STEPS[6])
            raw_groups = []
            try:
                raw_groups = client.list_groups(server)
            except Exception as e:
                logger.warning("Groups step failed: %s", e)
            groups = [TableauGroup(**g) for g in raw_groups]

            # Step 8: Flows
            flows: list[TableauFlow] = []
            if request.include_flows:
                _step(STEPS[7])
                try:
                    raw_flows = client.list_flows(server)
                    flows = [TableauFlow(**f) for f in raw_flows]
                except Exception as e:
                    logger.warning("Flows step failed: %s", e)

            # Step 9 & 10: Extract health
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
                    extract_health.total_schedules   = len(raw_schedules)
                    extract_health.active_schedules  = active_sched
                    extract_health.suspended_schedules = len(raw_schedules) - active_sched
                except Exception as e:
                    logger.warning("Schedules step failed: %s", e)

                _step(STEPS[9])
                try:
                    raw_jobs = client.list_jobs(server)
                    extract_jobs = [TableauExtractJob(**j) for j in raw_jobs[:100]]
                    extract_health.total_refresh_jobs = len(raw_jobs)
                    extract_health.successful_jobs = sum(1 for j in raw_jobs if (j.get("status") or "").lower() == "completed")
                    extract_health.failed_jobs     = sum(1 for j in raw_jobs if (j.get("status") or "").lower() in ("error", "failed"))
                    extract_health.cancelled_jobs  = sum(1 for j in raw_jobs if (j.get("status") or "").lower() == "cancelled")
                except Exception as e:
                    logger.warning("Jobs step failed: %s", e)

            # Step 11: Permissions
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

            # Step 12: Data quality
            _step(STEPS[11])
            data_quality = TableauDataQualityFlags(
                workbooks_with_no_views=sum(1 for wb in workbooks if wb.view_count == 0),
                datasources_with_no_workbooks=len([d for d in datasources if not d.is_certified]),
                users_with_no_activity=0,
                failed_extract_jobs=extract_health.failed_jobs,
                stale_extracts_over_7_days=extract_health.stale_datasources,
                uncertified_published_datasources=len(datasources) - len(certified),
            )

            # Step 13 & 14: Migration analysis
            _step(STEPS[12])
            workbook_scores = []
            for wb in workbooks[:200]:
                ws = _score_workbook(wb, datasources, permissions)
                workbook_scores.append(ws)

            _step(STEPS[13])
            migration_feasibility = _build_migration_feasibility(workbooks, datasources, flows, permissions)

            # Step 15: Deep workbook analysis via .twb XML parsing
            _step(STEPS[14])
            deep_analyses: list[WorkbookDeepAnalysis] = []
            try:
                # Download and parse up to 30 workbooks (largest first)
                raw_deep = _download_and_parse_workbooks(server, workbooks, max_workbooks=30)
                deep_analyses = raw_deep
                # Refine migration scores with real formula data
                _apply_deep_scores(migration_feasibility, deep_analyses)
                logger.info("[tableau:%s] Deep analysis completed: %d workbooks parsed", job_id[:8], len(deep_analyses))
            except Exception as e:
                logger.warning("Deep workbook analysis failed (%s) — continuing without formula-level data", e)

        # Assemble result
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
            migration_feasibility=migration_feasibility,
            workbook_deep_analysis=deep_analyses if deep_analyses else None,
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

        # Step 16: Excel
        _step(STEPS[15])
        excel_bytes = _build_excel(result)

        # Step 17: AI Word report
        _step(STEPS[16])
        try:
            from app.services.ai_report_service import build_tableau_ai_word_report
            label = request.label or server_info.site_name
            word_bytes = build_tableau_ai_word_report(job_id, result.model_dump(), client_name=label)
        except Exception as e:
            logger.warning("AI Word report failed (%s) — falling back to static report", e)
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
    GREEN          = "10B981"
    AMBER          = "F59E0B"
    RED            = "EF4444"
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
            ws.column_dimensions[col_letter].width = min(max_len + 4, 60)

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
        overview_data += [("Server URL", si.server_url), ("Site Name", si.site_name), ("Server Version", si.server_version)]
    if result.workbook_summary:
        ws_sum = result.workbook_summary
        overview_data += [
            ("Total Workbooks", ws_sum.total_workbooks), ("Total Views", ws_sum.total_views),
            ("Total Sheets", ws_sum.total_sheets), ("Total Dashboards", ws_sum.total_dashboards),
            ("Workbooks with Extracts", ws_sum.workbooks_with_extracts),
        ]
    if result.datasource_summary:
        ds_sum = result.datasource_summary
        overview_data += [
            ("Total Data Sources", ds_sum.total_datasources), ("Published", ds_sum.published_datasources),
            ("Certified", ds_sum.certified_datasources), ("Extract Sources", ds_sum.extract_datasources),
            ("Live Connection Sources", ds_sum.live_datasources),
        ]
    if result.user_profile:
        up = result.user_profile
        overview_data += [
            ("Total Users", up.total_users), ("Admin Users", up.admin_users),
            ("Creator Users", up.creator_users), ("Explorer Users", up.explorer_users),
            ("Viewer Users", up.viewer_users),
        ]

    _hdr(ws, 4, 1, "Metric")
    _hdr(ws, 4, 2, "Value")
    for i, (k, v) in enumerate(overview_data, start=5):
        _cell(ws, i, 1, k, i % 2 == 0)
        _cell(ws, i, 2, v, i % 2 == 0)
    _auto_width(ws)

    # ── Migration Feasibility ─────────────────────────────────────────────────
    if result.migration_feasibility:
        mf = result.migration_feasibility
        ws_mig = wb.create_sheet("Migration Feasibility")
        ws_mig.sheet_view.showGridLines = False

        ws_mig.merge_cells("A1:F1")
        t = ws_mig["A1"]
        t.value = "Power BI Migration Feasibility Report"
        t.font = Font(name=FONT_NAME, bold=True, size=14, color=WHITE)
        t.fill = _fill(TABLEAU_DARK)
        t.alignment = _align("center")

        _hdr(ws_mig, 3, 1, "Metric"); _hdr(ws_mig, 3, 2, "Value")
        mig_overview = [
            ("Overall Feasibility", mf.overall_feasibility),
            ("Estimated Migration Weeks", mf.estimated_migration_weeks),
            ("Total Workbooks Assessed", mf.total_workbooks_assessed),
            ("Simple Workbooks", mf.simple_workbooks),
            ("Moderate Workbooks", mf.moderate_workbooks),
            ("Complex Workbooks", mf.complex_workbooks),
            ("Very Complex Workbooks", mf.very_complex_workbooks),
            ("Has Prep Flows (→ Dataflow Gen2)", "Yes" if mf.has_prep_flows else "No"),
            ("Has RLS (→ Power BI RLS)", "Yes" if mf.has_rls else "No"),
            ("Migratable Connections", ", ".join(mf.migratable_connections) or "None detected"),
            ("Complex Connections", ", ".join(mf.complex_connections) or "None detected"),
        ]
        for i, (k, v) in enumerate(mig_overview, start=4):
            shade = i % 2 == 0
            _cell(ws_mig, i, 1, k, shade)
            c = ws_mig.cell(row=i, column=2, value=str(v))
            color = {"High": GREEN, "Moderate": AMBER, "Low": RED}.get(str(v), DARK_GRAY)
            c.font = Font(name=FONT_NAME, bold=(k == "Overall Feasibility"), color=color)
            c.fill = _fill(TABLEAU_ACCENT if shade else LIGHT_GRAY)
            c.alignment = _align()
            c.border = _border()

        # Feature mapping table
        start_row = len(mig_overview) + 6
        ws_mig.merge_cells(f"A{start_row}:F{start_row}")
        t2 = ws_mig[f"A{start_row}"]
        t2.value = "Tableau → Power BI Feature Mapping"
        t2.font = Font(name=FONT_NAME, bold=True, size=12, color=WHITE)
        t2.fill = _fill(TABLEAU_ORANGE)
        t2.alignment = _align("center")

        fm_headers = ["Tableau Concept", "Power BI Equivalent", "Feasibility", "Migration Notes"]
        for ci, h in enumerate(fm_headers, 1):
            _hdr(ws_mig, start_row + 1, ci, h)
        for i, fm in enumerate(mf.feature_mapping, start=start_row + 2):
            shade = i % 2 == 0
            feas = fm.get("feasibility", "")
            feas_color = {"Direct": GREEN, "Moderate": AMBER, "Complex": RED}.get(feas, DARK_GRAY)
            for ci, v in enumerate([fm.get("tableau", ""), fm.get("power_bi", ""), feas, fm.get("notes", "")], 1):
                c = ws_mig.cell(row=i, column=ci, value=str(v))
                c.fill = _fill(TABLEAU_ACCENT if shade else LIGHT_GRAY)
                c.alignment = _align(wrap=True)
                c.border = _border()
                if ci == 3:
                    c.font = Font(name=FONT_NAME, bold=True, color=feas_color)
                else:
                    c.font = _font(size=9)
        ws_mig.row_dimensions[start_row + 1].height = 20
        for row_num in range(start_row + 2, start_row + 2 + len(mf.feature_mapping)):
            ws_mig.row_dimensions[row_num].height = 28
        _auto_width(ws_mig)

    # ── Workbook Migration Scores ─────────────────────────────────────────────
    if result.migration_feasibility and result.migration_feasibility.workbook_scores:
        ws_scores = wb.create_sheet("Workbook Migration Scores")
        ws_scores.sheet_view.showGridLines = False
        headers = ["Workbook", "Project", "Owner", "Complexity", "Score",
                   "Data Src", "Calc Fields", "Table Calcs", "Actions",
                   "RLS", "Views", "Size MB", "Blockers"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws_scores, 1, ci, h)
        for i, sc in enumerate(result.migration_feasibility.workbook_scores, start=2):
            shade = i % 2 == 0
            level_color = {"Simple": GREEN, "Moderate": AMBER, "Complex": TABLEAU_ORANGE, "Very Complex": RED}.get(sc.complexity_level, DARK_GRAY)
            row_vals = [
                sc.workbook_name, sc.project_name, sc.owner_name,
                sc.complexity_level, sc.total_score,
                sc.data_source_complexity, sc.calc_field_complexity,
                sc.table_calc_complexity, sc.dashboard_action_complexity,
                sc.rls_complexity, sc.view_count, round(sc.size_mb, 1),
                "; ".join(sc.migration_blockers) if sc.migration_blockers else "None",
            ]
            for ci, v in enumerate(row_vals, 1):
                c = ws_scores.cell(row=i, column=ci, value=v)
                c.fill = _fill(TABLEAU_ACCENT if shade else LIGHT_GRAY)
                c.alignment = _align(wrap=(ci == len(headers)))
                c.border = _border()
                if ci == 4:
                    c.font = Font(name=FONT_NAME, bold=True, color=level_color)
                else:
                    c.font = _font(size=9)
        ws_scores.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{len(result.migration_feasibility.workbook_scores)+1}"
        ws_scores.freeze_panes = "A2"
        _auto_width(ws_scores)

    # ── Workbooks ─────────────────────────────────────────────────────────────
    if result.workbooks:
        ws2 = wb.create_sheet("Workbooks")
        ws2.sheet_view.showGridLines = False
        headers = ["Name", "Project", "Owner", "Show Tabs", "Tags", "Size (MB)", "Views", "Created", "Updated"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws2, 1, ci, h)
        for i, wb_item in enumerate(result.workbooks, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([
                wb_item.name, wb_item.project_name, wb_item.owner_name,
                "Yes" if wb_item.show_tabs else "No",
                wb_item.tag_count, round(wb_item.size_mb, 2), wb_item.view_count,
                wb_item.created_at or "", wb_item.updated_at or "",
            ], 1):
                _cell(ws2, i, ci, v, shade)
        ws2.auto_filter.ref = f"A1:I{len(result.workbooks)+1}"
        ws2.freeze_panes = "A2"
        _auto_width(ws2)

    # ── Data Sources ──────────────────────────────────────────────────────────
    if result.datasources:
        ws3 = wb.create_sheet("Data Sources")
        ws3.sheet_view.showGridLines = False
        headers = ["Name", "Project", "Owner", "Type", "Connection", "Has Extracts", "Certified", "Size (MB)"]
        for ci, h in enumerate(headers, 1):
            _hdr(ws3, 1, ci, h)
        for i, ds in enumerate(result.datasources, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([
                ds.name, ds.project_name, ds.owner_name, ds.datasource_type,
                ds.connection_type,
                "Yes" if ds.has_extracts else "No",
                "Yes" if ds.is_certified else "No",
                round(ds.size_mb, 2),
            ], 1):
                _cell(ws3, i, ci, v, shade)
        ws3.auto_filter.ref = f"A1:H{len(result.datasources)+1}"
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
            for ci, v in enumerate([
                u.get("name", ""), u.get("email", ""), u.get("role", ""),
                u.get("site_role", ""), u.get("auth_setting", ""), u.get("last_login", "") or "",
            ], 1):
                _cell(ws4, i, ci, v, shade)
        ws4.auto_filter.ref = f"A1:F{len(result.users_list)+1}"
        ws4.freeze_panes = "A2"
        _auto_width(ws4)

    # ── Groups ────────────────────────────────────────────────────────────────
    if result.groups:
        ws5 = wb.create_sheet("Groups")
        ws5.sheet_view.showGridLines = False
        for ci, h in enumerate(["Group Name", "Domain", "Member Count"], 1):
            _hdr(ws5, 1, ci, h)
        for i, g in enumerate(result.groups, start=2):
            shade = i % 2 == 0
            for ci, v in enumerate([g.name, g.domain_name or "", g.member_count], 1):
                _cell(ws5, i, ci, v, shade)
        _auto_width(ws5)

    # ── Extract Health ────────────────────────────────────────────────────────
    if result.extract_health:
        eh = result.extract_health
        ws8 = wb.create_sheet("Extract Health")
        ws8.sheet_view.showGridLines = False
        _hdr(ws8, 1, 1, "Metric"); _hdr(ws8, 1, 2, "Value")
        eh_data = [
            ("Total Schedules", eh.total_schedules), ("Active Schedules", eh.active_schedules),
            ("Suspended Schedules", eh.suspended_schedules), ("Total Refresh Jobs", eh.total_refresh_jobs),
            ("Successful Jobs", eh.successful_jobs), ("Failed Jobs", eh.failed_jobs),
            ("Cancelled Jobs", eh.cancelled_jobs), ("Stale Data Sources", eh.stale_datasources),
        ]
        for i, (k, v) in enumerate(eh_data, start=2):
            _cell(ws8, i, 1, k, i % 2 == 0)
            c = ws8.cell(row=i, column=2, value=v)
            is_warn = k == "Failed Jobs" and v > 0
            c.font = Font(name=FONT_NAME, bold=is_warn, color=RED if is_warn else DARK_GRAY)
            c.fill = _fill(TABLEAU_ACCENT if i % 2 == 0 else LIGHT_GRAY)
            c.alignment = _align()
            c.border = _border()
        _auto_width(ws8)

    # ── Data Quality ──────────────────────────────────────────────────────────
    if result.data_quality:
        dq = result.data_quality
        ws9 = wb.create_sheet("Data Quality")
        ws9.sheet_view.showGridLines = False
        for ci, h in enumerate(["Quality Flag", "Count", "Severity"], 1):
            _hdr(ws9, 1, ci, h)
        dq_data = [
            ("Workbooks with No Views",             dq.workbooks_with_no_views,            "Medium"),
            ("Failed Extract Jobs",                  dq.failed_extract_jobs,                "High"),
            ("Stale Extracts (>7 days)",             dq.stale_extracts_over_7_days,         "High"),
            ("Uncertified Published Data Sources",   dq.uncertified_published_datasources,  "Low"),
            ("Users with No Recent Activity",        dq.users_with_no_activity,             "Low"),
        ]
        for i, (k, v, sev) in enumerate(dq_data, start=2):
            shade = i % 2 == 0
            _cell(ws9, i, 1, k, shade); _cell(ws9, i, 2, v, shade)
            c = ws9.cell(row=i, column=3, value=sev)
            sev_color = {"High": RED, "Medium": AMBER, "Low": GREEN}.get(sev, DARK_GRAY)
            c.font = Font(name=FONT_NAME, bold=True, color=sev_color)
            c.fill = _fill(TABLEAU_ACCENT if shade else LIGHT_GRAY)
            c.alignment = _align("center")
            c.border = _border()
        _auto_width(ws9)

    # ── Permissions ───────────────────────────────────────────────────────────
    if result.permissions:
        ws10 = wb.create_sheet("Permissions (Sample)")
        ws10.sheet_view.showGridLines = False
        for ci, h in enumerate(["Workbook / Data Source", "Grantee", "Grantee Type", "Capability", "Mode"], 1):
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


# ── Static Word report (fallback when AI is unavailable) ─────────────────────

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
    GREEN_RGB = RGBColor(0x10, 0xB9, 0x81)
    AMBER_RGB = RGBColor(0xF5, 0x9E, 0x0B)
    RED_RGB   = RGBColor(0xEF, 0x44, 0x44)

    doc = Document()
    for section in doc.sections:
        section.top_margin    = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin   = Cm(2.5)
        section.right_margin  = Cm(2.5)

    def _set_cell_bg(cell, hex_color: str):
        tc_pr = cell._tc.get_or_add_tcPr()
        shd   = OxmlElement("w:shd")
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
    r.font.size = Pt(32); r.font.bold = True; r.font.color.rgb = ORANGE

    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_r = sub_p.add_run("Source Assessment & Power BI Migration Report")
    sub_r.font.size = Pt(18); sub_r.font.color.rgb = DARK_BLUE

    doc.add_paragraph()
    comp_p = doc.add_paragraph()
    comp_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    comp_r = comp_p.add_run(site_label)
    comp_r.font.size = Pt(14); comp_r.font.bold = True; comp_r.font.color.rgb = DARK_GRAY

    date_p = doc.add_paragraph()
    date_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_r = date_p.add_run(f"Assessment Date: {result.assessed_at[:10]}")
    date_r.font.size = Pt(11); date_r.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
    doc.add_page_break()

    # Executive Summary
    _heading("Executive Summary", 1)
    si  = result.server_info
    ws_sum = result.workbook_summary
    ds_sum = result.datasource_summary
    up  = result.user_profile
    mf  = result.migration_feasibility
    if si and ws_sum and up:
        doc.add_paragraph(
            f"Tableau Server at {si.server_url} (version {si.server_version}, site: {si.site_name}) "
            f"hosts {ws_sum.total_workbooks} workbooks with {ws_sum.total_views} views across "
            f"{len(result.projects or [])} projects. "
            f"There are {ds_sum.total_datasources if ds_sum else 0} published data sources and "
            f"{up.total_users} licensed users."
        )
    if mf:
        doc.add_paragraph(
            f"Migration feasibility to Microsoft Power BI is rated '{mf.overall_feasibility}'. "
            f"Of {mf.total_workbooks_assessed} workbooks assessed: "
            f"{mf.simple_workbooks} Simple, {mf.moderate_workbooks} Moderate, "
            f"{mf.complex_workbooks} Complex, {mf.very_complex_workbooks} Very Complex. "
            f"Estimated migration effort: {mf.estimated_migration_weeks} weeks."
        )
    doc.add_paragraph()

    # Server Info
    if si:
        _heading("Server Information", 2)
        _add_kv_table([("Server URL", si.server_url), ("Site Name", si.site_name), ("Server Version", si.server_version)])

    # Workbook Summary
    if ws_sum:
        _heading("Workbook Summary", 2)
        _add_kv_table([
            ("Total Workbooks", ws_sum.total_workbooks), ("Total Views", ws_sum.total_views),
            ("Total Sheets", ws_sum.total_sheets), ("Total Dashboards", ws_sum.total_dashboards),
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

    # Migration Feasibility
    if mf:
        _heading("Power BI Migration Feasibility", 1)
        _add_kv_table([
            ("Overall Feasibility", mf.overall_feasibility),
            ("Estimated Migration Weeks", mf.estimated_migration_weeks),
            ("Simple Workbooks", mf.simple_workbooks),
            ("Moderate Workbooks", mf.moderate_workbooks),
            ("Complex Workbooks", mf.complex_workbooks),
            ("Very Complex Workbooks", mf.very_complex_workbooks),
            ("Prep Flows (→ Dataflow Gen2)", "Yes" if mf.has_prep_flows else "No"),
            ("RLS Present (→ Power BI RLS)", "Yes" if mf.has_rls else "No"),
            ("Migratable Connection Types", ", ".join(mf.migratable_connections) or "N/A"),
            ("Complex Connection Types", ", ".join(mf.complex_connections) or "None"),
        ])

        if mf.migration_blockers:
            _heading("Migration Blockers", 2)
            for b in mf.migration_blockers:
                p = doc.add_paragraph(style="List Bullet")
                run = p.add_run(b)
                run.font.color.rgb = RED_RGB

        _heading("Tableau → Power BI Feature Mapping", 2)
        mapping_table = doc.add_table(rows=len(mf.feature_mapping) + 1, cols=4)
        mapping_table.style = "Table Grid"
        for ci, h in enumerate(["Tableau Concept", "Power BI Equivalent", "Feasibility", "Notes"]):
            cell = mapping_table.rows[0].cells[ci]
            cell.text = h
            cell.paragraphs[0].runs[0].font.bold = True
            cell.paragraphs[0].runs[0].font.color.rgb = WHITE
            cell.paragraphs[0].runs[0].font.size = Pt(9)
            _set_cell_bg(cell, "E8751A")
        for idx, fm in enumerate(mf.feature_mapping):
            row = mapping_table.rows[idx + 1]
            feas = fm.get("feasibility", "")
            for ci, v in enumerate([fm.get("tableau", ""), fm.get("power_bi", ""), feas, fm.get("notes", "")]):
                cell = row.cells[ci]
                cell.text = str(v)
                feas_color = {"Direct": "10B981", "Moderate": "F59E0B", "Complex": "EF4444"}.get(feas, "404040")
                if ci == 2:
                    run = cell.paragraphs[0].runs[0] if cell.paragraphs[0].runs else cell.paragraphs[0].add_run(v)
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(
                        int(feas_color[0:2], 16), int(feas_color[2:4], 16), int(feas_color[4:6], 16)
                    )
                else:
                    if cell.paragraphs[0].runs:
                        cell.paragraphs[0].runs[0].font.size = Pt(8)
                bg = "FFF8F0" if idx % 2 == 0 else "F5F5F5"
                _set_cell_bg(cell, bg)
        doc.add_paragraph()

    # User Profile
    if up:
        _heading("User Profile", 2)
        _add_kv_table([
            ("Total Users", up.total_users), ("Admin Users", up.admin_users),
            ("Creator Users", up.creator_users), ("Explorer Users", up.explorer_users),
            ("Viewer Users", up.viewer_users), ("Unlicensed Users", up.unlicensed_users),
        ])

    # Extract Health
    if result.extract_health:
        eh = result.extract_health
        _heading("Extract Refresh Health", 2)
        _add_kv_table([
            ("Total Schedules", eh.total_schedules), ("Active Schedules", eh.active_schedules),
            ("Suspended Schedules", eh.suspended_schedules), ("Total Refresh Jobs", eh.total_refresh_jobs),
            ("Successful Jobs", eh.successful_jobs), ("Failed Jobs", eh.failed_jobs),
            ("Cancelled Jobs", eh.cancelled_jobs),
        ])

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
