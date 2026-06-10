"""
Tableau Workbook (.twb / .twbx) XML parser.

Extracts formula-level data that is NOT available via the Tableau REST API:
  - Calculated fields (formulas, LOD expressions, table calculations)
  - Parameters (name, type, allowable values, defaults)
  - Filters (extract / datasource / context / dimension / measure)
  - Sets and combined sets
  - Groups and hierarchies
  - Visual mark types per sheet
  - Dashboard layout and objects
  - Actions (filter / highlight / URL / set / parameter)
  - Stories and story points
  - Extensions
  - Formatting (number formats, fonts)
  - Data model relationships and join types
  - Field inventory (dimensions / measures, aliases, hidden fields)
"""

from __future__ import annotations

import io
import logging
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ── Data classes returned by the parser ──────────────────────────────────────

@dataclass
class FieldDef:
    name: str
    caption: Optional[str] = None
    datatype: str = "string"
    role: str = "dimension"          # dimension | measure
    field_type: str = "nominal"      # nominal | ordinal | quantitative | geographic
    is_hidden: bool = False
    is_calculated: bool = False
    formula: Optional[str] = None
    comment: Optional[str] = None
    default_format: Optional[str] = None


@dataclass
class CalcField:
    name: str
    caption: Optional[str] = None
    formula: str = ""
    datatype: str = "string"
    role: str = "dimension"
    is_lod: bool = False
    lod_type: Optional[str] = None   # FIXED | INCLUDE | EXCLUDE
    is_table_calc: bool = False
    table_calc_type: Optional[str] = None   # RUNNING_SUM | WINDOW | RANK | …
    dependencies: list[str] = field(default_factory=list)
    nested_lod_count: int = 0


@dataclass
class LODExpression:
    name: str
    formula: str
    lod_type: str   # FIXED | INCLUDE | EXCLUDE
    dimensions: list[str] = field(default_factory=list)
    is_nested: bool = False


@dataclass
class TableCalc:
    name: str
    formula: str
    calc_type: str   # RUNNING_SUM | WINDOW_AVG | RANK | LOOKUP | SIZE | …
    partition_fields: list[str] = field(default_factory=list)
    addressing_fields: list[str] = field(default_factory=list)


@dataclass
class Parameter:
    name: str
    caption: Optional[str] = None
    datatype: str = "string"
    current_value: Optional[str] = None
    allowable_values_type: str = "all"   # all | list | range
    list_values: list[str] = field(default_factory=list)
    range_min: Optional[str] = None
    range_max: Optional[str] = None
    range_step: Optional[str] = None


@dataclass
class FilterDef:
    field_name: str
    filter_type: str   # extract | datasource | context | dimension | measure | table-calc
    worksheet: Optional[str] = None
    condition: Optional[str] = None
    values: list[str] = field(default_factory=list)
    is_exclude: bool = False
    is_wildcard: bool = False


@dataclass
class SetDef:
    name: str
    caption: Optional[str] = None
    datasource: Optional[str] = None
    set_type: str = "fixed"       # fixed | computed | combined
    members: list[str] = field(default_factory=list)
    condition_formula: Optional[str] = None
    is_combined: bool = False
    combined_sets: list[str] = field(default_factory=list)


@dataclass
class HierarchyDef:
    name: str
    caption: Optional[str] = None
    levels: list[str] = field(default_factory=list)


@dataclass
class GroupDef:
    name: str
    caption: Optional[str] = None
    source_field: Optional[str] = None
    members: list[str] = field(default_factory=list)


@dataclass
class MarkTypeDef:
    worksheet: str
    mark_type: str   # Bar | Line | Area | Circle | Square | Map | Polygon | Density | Pie | Gantt | Text | Automatic
    has_dual_axis: bool = False
    has_viz_in_tooltip: bool = False
    tooltip_sheets: list[str] = field(default_factory=list)


@dataclass
class DashboardObject:
    object_type: str   # worksheet | text | image | blank | extension | container | web
    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None
    is_floating: bool = False


@dataclass
class DashboardDef:
    name: str
    width: Optional[int] = None
    height: Optional[int] = None
    has_device_layouts: bool = False
    device_types: list[str] = field(default_factory=list)
    objects: list[DashboardObject] = field(default_factory=list)
    has_floating_objects: bool = False


@dataclass
class ActionDef:
    name: str
    action_type: str   # filter | highlight | url | set | parameter | goto-sheet
    source_sheet: Optional[str] = None
    target_sheet: Optional[str] = None
    source_field: Optional[str] = None
    target_field: Optional[str] = None
    url: Optional[str] = None
    run_action_on: str = "select"   # select | hover | menu


@dataclass
class StoryPoint:
    caption: Optional[str] = None
    sheet_name: Optional[str] = None
    navigator_hidden: bool = False


@dataclass
class StoryDef:
    name: str
    title: Optional[str] = None
    story_points: list[StoryPoint] = field(default_factory=list)


@dataclass
class ExtensionDef:
    name: str
    url: Optional[str] = None
    version: Optional[str] = None
    worksheet: Optional[str] = None
    is_dashboard_extension: bool = False


@dataclass
class DataSourceDef:
    name: str
    caption: Optional[str] = None
    connection_type: str = "unknown"
    connection_server: Optional[str] = None
    database: Optional[str] = None
    has_custom_sql: bool = False
    custom_sql_queries: list[str] = field(default_factory=list)
    has_extract: bool = False
    join_count: int = 0
    join_types: list[str] = field(default_factory=list)   # inner | left | right | full
    blend_count: int = 0
    has_stored_proc: bool = False
    relations: list[dict] = field(default_factory=list)


@dataclass
class FormatSpec:
    scope: str   # workbook | worksheet | datasource
    target: Optional[str] = None
    format_type: str = "number"
    pattern: Optional[str] = None
    font_name: Optional[str] = None
    font_size: Optional[int] = None
    bold: bool = False
    italic: bool = False
    color: Optional[str] = None
    shading: Optional[str] = None


@dataclass
class WorkbookDeepAnalysis:
    """Full parse result for a single .twb workbook XML."""
    workbook_name: str = ""

    # §3 Data model
    datasources: list[DataSourceDef] = field(default_factory=list)
    has_data_blending: bool = False
    has_cross_database_join: bool = False

    # §4 Field inventory
    dimensions: list[FieldDef] = field(default_factory=list)
    measures: list[FieldDef] = field(default_factory=list)
    hidden_fields: list[FieldDef] = field(default_factory=list)

    # §5 Calculated fields
    calc_fields: list[CalcField] = field(default_factory=list)
    total_calc_fields: int = 0

    # §6 LOD expressions
    lod_expressions: list[LODExpression] = field(default_factory=list)
    total_lod_count: int = 0
    has_nested_lod: bool = False

    # §7 Table calculations
    table_calcs: list[TableCalc] = field(default_factory=list)
    total_table_calc_count: int = 0

    # §8 Parameters
    parameters: list[Parameter] = field(default_factory=list)
    total_parameter_count: int = 0
    has_parameter_actions: bool = False

    # §9 Filters
    filters: list[FilterDef] = field(default_factory=list)
    extract_filter_count: int = 0
    datasource_filter_count: int = 0
    context_filter_count: int = 0
    dimension_filter_count: int = 0
    measure_filter_count: int = 0

    # §10 Sorting
    sort_count: int = 0
    custom_sort_count: int = 0

    # §11 Sets
    sets: list[SetDef] = field(default_factory=list)
    has_set_actions: bool = False
    combined_set_count: int = 0

    # §12 Groups & hierarchies
    groups: list[GroupDef] = field(default_factory=list)
    hierarchies: list[HierarchyDef] = field(default_factory=list)

    # §13 Mark types
    mark_types: list[MarkTypeDef] = field(default_factory=list)
    has_viz_in_tooltip: bool = False
    has_custom_marks: bool = False
    unique_mark_types: list[str] = field(default_factory=list)

    # §14 Dashboard layout
    dashboards: list[DashboardDef] = field(default_factory=list)
    total_dashboards: int = 0
    has_floating_objects: bool = False
    has_device_layouts: bool = False

    # §15 Actions
    actions: list[ActionDef] = field(default_factory=list)
    filter_action_count: int = 0
    highlight_action_count: int = 0
    url_action_count: int = 0
    set_action_count: int = 0
    parameter_action_count: int = 0

    # §16 Formatting
    formats: list[FormatSpec] = field(default_factory=list)
    has_custom_number_formats: bool = False
    custom_font_count: int = 0

    # §20 Stories
    stories: list[StoryDef] = field(default_factory=list)
    total_stories: int = 0

    # §21 Extensions
    extensions: list[ExtensionDef] = field(default_factory=list)
    total_extensions: int = 0

    # §23 Embedded analytics
    has_javascript_api: bool = False
    has_embedding_params: bool = False

    # Parsing metadata
    parse_errors: list[str] = field(default_factory=list)
    raw_worksheet_count: int = 0


# ── LOD / table-calc detection helpers ───────────────────────────────────────

_LOD_PATTERN = re.compile(r'\b(FIXED|INCLUDE|EXCLUDE)\s*:', re.IGNORECASE)
_TABLE_CALC_KEYWORDS = re.compile(
    r'\b(RUNNING_SUM|WINDOW_AVG|WINDOW_SUM|WINDOW_MAX|WINDOW_MIN|WINDOW_COUNT|'
    r'WINDOW_MEDIAN|WINDOW_PERCENTILE|WINDOW_STDEV|WINDOW_VAR|RANK|RANK_DENSE|'
    r'RANK_MODIFIED|RANK_PERCENTILE|RANK_UNIQUE|INDEX|FIRST|LAST|LOOKUP|'
    r'PREVIOUS_VALUE|RUNNING_AVG|RUNNING_COUNT|RUNNING_MAX|RUNNING_MIN|'
    r'SIZE|TOTAL|SCRIPT_INT|SCRIPT_REAL|SCRIPT_STR|SCRIPT_BOOL)\s*\(',
    re.IGNORECASE,
)

_LOD_TYPES = {"FIXED": "FIXED", "INCLUDE": "INCLUDE", "EXCLUDE": "EXCLUDE"}
_TABLE_CALC_TYPE_MAP = {
    "RUNNING_SUM": "RUNNING_SUM", "RUNNING_AVG": "RUNNING_AVG",
    "RUNNING_COUNT": "RUNNING_COUNT", "RUNNING_MAX": "RUNNING_MAX",
    "RUNNING_MIN": "RUNNING_MIN",
    "WINDOW_AVG": "WINDOW_AVG", "WINDOW_SUM": "WINDOW_SUM",
    "WINDOW_MAX": "WINDOW_MAX", "WINDOW_MIN": "WINDOW_MIN",
    "WINDOW_COUNT": "WINDOW_COUNT", "WINDOW_MEDIAN": "WINDOW_MEDIAN",
    "RANK": "RANK", "RANK_DENSE": "RANK_DENSE",
    "INDEX": "INDEX", "FIRST": "FIRST", "LAST": "LAST",
    "LOOKUP": "LOOKUP", "PREVIOUS_VALUE": "PREVIOUS_VALUE",
    "SIZE": "SIZE", "TOTAL": "TOTAL",
}

_CONNECTION_TYPE_MAP = {
    "sqlserver": "SQL Server", "mssql": "SQL Server",
    "postgres": "PostgreSQL", "mysql": "MySQL",
    "oracle": "Oracle", "bigquery": "BigQuery",
    "snowflake": "Snowflake", "redshift": "Redshift",
    "athena": "Athena", "databricks": "Databricks",
    "excel-direct": "Excel", "csv": "CSV/Flat File",
    "textscan": "Text File", "hyper": "Tableau Extract",
    "tde": "Tableau Extract", "salesforce": "Salesforce",
    "sharepoint-excel": "SharePoint Excel",
    "web-data-connector": "Web Data Connector",
    "google-sheets": "Google Sheets",
    "azuresql": "Azure SQL",
}


def _norm_conn_type(raw: str) -> str:
    low = raw.lower()
    return _CONNECTION_TYPE_MAP.get(low, raw)


def _detect_lod(formula: str) -> tuple[bool, Optional[str], int]:
    """Returns (is_lod, lod_type, nested_count)."""
    matches = _LOD_PATTERN.findall(formula)
    if not matches:
        return False, None, 0
    lod_type = _LOD_TYPES.get(matches[0].upper(), matches[0].upper())
    return True, lod_type, len(matches)


def _detect_table_calc(formula: str) -> tuple[bool, Optional[str]]:
    """Returns (is_table_calc, calc_type)."""
    m = _TABLE_CALC_KEYWORDS.search(formula)
    if not m:
        return False, None
    keyword = m.group(1).upper()
    return True, _TABLE_CALC_TYPE_MAP.get(keyword, keyword)


def _extract_field_refs(formula: str) -> list[str]:
    """Pull [Field Name] style references from a formula."""
    return re.findall(r'\[([^\]]+)\]', formula)


# ── Main parser class ─────────────────────────────────────────────────────────

class TwbParser:
    """Parse a .twb XML string or .twbx ZIP bytes into WorkbookDeepAnalysis."""

    def __init__(self, workbook_name: str = ""):
        self._name = workbook_name
        self._result = WorkbookDeepAnalysis(workbook_name=workbook_name)

    # ── Entry points ─────────────────────────────────────────────────────────

    @classmethod
    def from_bytes(cls, data: bytes, workbook_name: str = "") -> WorkbookDeepAnalysis:
        """Accept raw .twb XML bytes or .twbx ZIP bytes."""
        parser = cls(workbook_name)
        try:
            xml_bytes = parser._extract_xml(data)
            root = ET.fromstring(xml_bytes)
            parser._parse_root(root)
        except Exception as exc:
            logger.warning("TWB parse error for %s: %s", workbook_name, exc)
            parser._result.parse_errors.append(str(exc))
        return parser._result

    def _extract_xml(self, data: bytes) -> bytes:
        """If data is a ZIP (.twbx), extract the embedded .twb file."""
        if data[:2] == b'PK':
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                twb_names = [n for n in zf.namelist() if n.endswith('.twb')]
                if not twb_names:
                    raise ValueError("No .twb found inside .twbx archive")
                return zf.read(twb_names[0])
        return data

    # ── Root dispatcher ───────────────────────────────────────────────────────

    def _parse_root(self, root: ET.Element) -> None:
        r = self._result
        # workbook name from xml attribute
        if not r.workbook_name:
            r.workbook_name = root.get('source-build', 'unknown')

        # §3 data sources
        for ds_el in root.findall('.//datasources/datasource'):
            self._parse_datasource(ds_el)

        # §4–7 fields / calcs (inside datasource columns)
        # already handled in _parse_datasource; collect parameters separately
        for param_el in root.findall(".//column[@param-domain-type]"):
            self._parse_parameter(param_el)
        # also look in datasource for parameters section
        for param_el in root.findall(".//datasource[@name='Parameters']/column"):
            self._parse_parameter(param_el)

        # §8 parameters standalone section
        params_ds = root.find(".//datasource[@name='Parameters']")
        if params_ds is not None:
            for col in params_ds:
                if col.tag == 'column':
                    self._parse_parameter(col)

        # §9 filters
        for ws_el in root.findall('.//worksheets/worksheet'):
            self._parse_worksheet_filters(ws_el)
        for ds_el in root.findall('.//datasources/datasource'):
            self._parse_datasource_filters(ds_el)

        # §10 sorting
        for sort_el in root.findall('.//sort'):
            r.sort_count += 1
            if sort_el.get('type') == 'explicit':
                r.custom_sort_count += 1

        # §11 sets
        for set_el in root.findall('.//set'):
            self._parse_set(set_el)

        # §12 groups & hierarchies
        for grp_el in root.findall('.//group'):
            self._parse_group(grp_el)
        for h_el in root.findall('.//drill-path'):
            self._parse_hierarchy(h_el)

        # §13 mark types (per worksheet)
        for ws_el in root.findall('.//worksheets/worksheet'):
            self._parse_worksheet_marks(ws_el)
            r.raw_worksheet_count += 1

        # §14 dashboards
        for db_el in root.findall('.//dashboards/dashboard'):
            self._parse_dashboard(db_el)

        # §15 actions
        for act_el in root.findall('.//actions/action'):
            self._parse_action(act_el)

        # §16 formatting
        for fmt_el in root.findall('.//format'):
            self._parse_format(fmt_el)

        # §20 stories
        for story_el in root.findall('.//stories/story'):
            self._parse_story(story_el)

        # §21 extensions
        for ext_el in root.findall('.//zone[@type="addin"]') + root.findall('.//zone[@type="extension"]'):
            self._parse_extension_zone(ext_el)
        for ext_el in root.findall('.//extensions/extension'):
            self._parse_extension_def(ext_el)
        for ext_el in root.findall('.//dashboard-extension'):
            self._parse_dashboard_extension(ext_el)

        # §23 embedded analytics detection
        self._detect_embedding(root)

        # Aggregate counts
        self._finalize_counts()

    # ── §3 Data sources ───────────────────────────────────────────────────────

    def _parse_datasource(self, ds_el: ET.Element) -> None:
        r = self._result
        ds_name = ds_el.get('name', '')
        ds_caption = ds_el.get('caption', ds_name)

        # skip the parameters pseudo-datasource (handled separately)
        if ds_name == 'Parameters':
            return

        ds = DataSourceDef(name=ds_name, caption=ds_caption)

        # connection type
        conn_el = ds_el.find('.//connection')
        named_conn = ds_el.find('.//named-connection/connection')
        if named_conn is not None:
            conn_el = named_conn

        if conn_el is not None:
            raw_class = conn_el.get('class', 'unknown')
            ds.connection_type = _norm_conn_type(raw_class)
            ds.connection_server = conn_el.get('server')
            ds.database = conn_el.get('dbname') or conn_el.get('database')

        # detect multi-connection (data blending / cross-db join)
        named_conns = ds_el.findall('.//named-connection')
        if len(named_conns) > 1:
            r.has_cross_database_join = True

        # relations / joins
        for rel_el in ds_el.findall('.//relation'):
            rel_type = rel_el.get('type', '')
            if rel_type == 'join':
                join_type = rel_el.get('join', 'inner')
                ds.join_count += 1
                if join_type not in ds.join_types:
                    ds.join_types.append(join_type)
                ds.relations.append({
                    "type": "join",
                    "join_type": join_type,
                    "table": rel_el.get('table', ''),
                })
            elif rel_type == 'union':
                ds.relations.append({"type": "union"})
            elif rel_type == 'table':
                tbl_name = rel_el.get('name') or rel_el.get('table', '')
                if tbl_name:
                    ds.relations.append({"type": "table", "name": tbl_name})

        # custom SQL detection
        for text_el in ds_el.findall('.//relation[@type="text"]'):
            sql = text_el.text or ''
            if sql.strip().upper().startswith('SELECT'):
                ds.has_custom_sql = True
                ds.custom_sql_queries.append(sql[:500])

        # stored procedures
        for sp_el in ds_el.findall('.//relation[@type="stored-proc"]'):
            ds.has_stored_proc = True

        # extract
        if ds_el.find('.//extract') is not None:
            ds.has_extract = True

        # blending indicator
        if ds_el.get('source-platform') == 'win' and ds_el.find('.//connection[@class="federated"]') is not None:
            r.has_data_blending = True

        r.datasources.append(ds)

        # parse fields/calcs from this datasource
        for col_el in ds_el.findall('.//column'):
            self._parse_column(col_el, ds_name)

    def _parse_column(self, col_el: ET.Element, ds_name: str) -> None:
        r = self._result
        name = col_el.get('name', '')
        caption = col_el.get('caption')
        datatype = col_el.get('datatype', 'string')
        role = col_el.get('role', 'dimension')
        field_type = col_el.get('type', 'nominal')
        hidden = col_el.get('hidden', 'false').lower() == 'true'

        # skip internal tableau columns
        if name.startswith('[') and name.endswith(']'):
            plain = name[1:-1]
        else:
            plain = name

        calc_el = col_el.find('calculation')
        formula = None
        if calc_el is not None:
            formula = calc_el.get('formula', '')

        fd = FieldDef(
            name=plain,
            caption=caption,
            datatype=datatype,
            role=role,
            field_type=field_type,
            is_hidden=hidden,
            is_calculated=formula is not None,
            formula=formula,
        )

        if hidden:
            r.hidden_fields.append(fd)
        elif role == 'measure':
            r.measures.append(fd)
        else:
            r.dimensions.append(fd)

        # if calculated, build CalcField entry
        if formula is not None and formula.strip():
            self._build_calc_field(plain, caption, formula, datatype, role)

    def _build_calc_field(self, name: str, caption: Optional[str],
                          formula: str, datatype: str, role: str) -> None:
        r = self._result
        is_lod, lod_type, nested_count = _detect_lod(formula)
        is_tc, tc_type = _detect_table_calc(formula)
        deps = _extract_field_refs(formula)

        cf = CalcField(
            name=name,
            caption=caption,
            formula=formula,
            datatype=datatype,
            role=role,
            is_lod=is_lod,
            lod_type=lod_type,
            is_table_calc=is_tc,
            table_calc_type=tc_type,
            dependencies=deps,
            nested_lod_count=nested_count,
        )
        r.calc_fields.append(cf)

        if is_lod:
            lod = LODExpression(
                name=name,
                formula=formula,
                lod_type=lod_type or 'FIXED',
                dimensions=[d for d in deps if not d.startswith(':')],
                is_nested=nested_count > 1,
            )
            r.lod_expressions.append(lod)
            if nested_count > 1:
                r.has_nested_lod = True

        if is_tc:
            tc = TableCalc(
                name=name,
                formula=formula,
                calc_type=tc_type or 'UNKNOWN',
            )
            r.table_calcs.append(tc)

    # ── §8 Parameters ─────────────────────────────────────────────────────────

    def _parse_parameter(self, col_el: ET.Element) -> None:
        r = self._result
        name = col_el.get('name', '').strip('[]')
        if not name or name in {p.name for p in r.parameters}:
            return

        caption = col_el.get('caption')
        datatype = col_el.get('datatype', 'string')
        current = col_el.get('value') or col_el.get('current-value')
        domain_type = col_el.get('param-domain-type', 'all')

        param = Parameter(
            name=name,
            caption=caption,
            datatype=datatype,
            current_value=current,
            allowable_values_type=domain_type,
        )

        # list values
        for member_el in col_el.findall('.//members/member'):
            v = member_el.get('value', '')
            param.list_values.append(v)

        # range
        range_el = col_el.find('.//range')
        if range_el is not None:
            param.range_min = range_el.get('granularity') or range_el.get('min')
            param.range_max = range_el.get('max')
            param.range_step = range_el.get('step-size')

        r.parameters.append(param)

    # ── §9 Filters ────────────────────────────────────────────────────────────

    def _parse_worksheet_filters(self, ws_el: ET.Element) -> None:
        ws_name = ws_el.get('name', '')
        for f_el in ws_el.findall('.//filter'):
            self._add_filter(f_el, ws_name)

    def _parse_datasource_filters(self, ds_el: ET.Element) -> None:
        ds_name = ds_el.get('name', '')
        for f_el in ds_el.findall('.//filter'):
            self._add_filter(f_el, None, ds_name)

    def _add_filter(self, f_el: ET.Element, worksheet: Optional[str],
                    datasource: Optional[str] = None) -> None:
        r = self._result
        field_name = f_el.get('column', f_el.get('field', ''))
        filter_class = f_el.get('class', 'categorical')

        # determine filter type heuristically
        if datasource and not worksheet:
            filter_type = 'datasource'
            r.datasource_filter_count += 1
        elif f_el.get('context', 'false').lower() == 'true':
            filter_type = 'context'
            r.context_filter_count += 1
        elif filter_class in ('quantitative', 'range'):
            filter_type = 'measure'
            r.measure_filter_count += 1
        elif filter_class in ('categorical', 'set', 'relative-date', 'date'):
            filter_type = 'dimension'
            r.dimension_filter_count += 1
        else:
            filter_type = 'dimension'
            r.dimension_filter_count += 1

        values = [m.get('value', '') for m in f_el.findall('.//members/member')]
        is_exclude = f_el.get('exclude', 'false').lower() == 'true'
        is_wildcard = f_el.find('.//wildcard') is not None or filter_class == 'wildcard'

        fd = FilterDef(
            field_name=field_name.strip('[]'),
            filter_type=filter_type,
            worksheet=worksheet,
            values=values[:50],
            is_exclude=is_exclude,
            is_wildcard=is_wildcard,
        )
        r.filters.append(fd)

    # ── §11 Sets ──────────────────────────────────────────────────────────────

    def _parse_set(self, set_el: ET.Element) -> None:
        r = self._result
        name = set_el.get('name', '').strip('[]')
        if not name:
            return
        caption = set_el.get('caption')
        ds_name = set_el.get('datasource')

        # combined set?
        is_combined = set_el.find('.//combined-set') is not None
        combined_sets: list[str] = []
        for cs in set_el.findall('.//combined-set'):
            combined_sets.append(cs.get('name', '').strip('[]'))
        if is_combined:
            r.combined_set_count += 1

        members: list[str] = [m.get('value', '') for m in set_el.findall('.//members/member')]
        condition_el = set_el.find('.//condition')
        condition = condition_el.get('op') if condition_el is not None else None

        set_type = 'combined' if is_combined else ('computed' if condition else 'fixed')
        sd = SetDef(
            name=name,
            caption=caption,
            datasource=ds_name,
            set_type=set_type,
            members=members,
            condition_formula=condition,
            is_combined=is_combined,
            combined_sets=combined_sets,
        )
        r.sets.append(sd)

    # ── §12 Groups & hierarchies ──────────────────────────────────────────────

    def _parse_group(self, grp_el: ET.Element) -> None:
        r = self._result
        name = grp_el.get('name', '').strip('[]')
        if not name:
            return
        caption = grp_el.get('caption')
        source = grp_el.get('field', '').strip('[]') or None
        members = [g.get('value', '') for g in grp_el.findall('.//groupfilter[@member]')]
        # also direct member children
        for gf in grp_el.findall('./groupfilter'):
            for mf in gf.findall('.//groupfilter[@member]'):
                v = mf.get('member', '')
                if v:
                    members.append(v)

        gd = GroupDef(name=name, caption=caption, source_field=source, members=members[:100])
        r.groups.append(gd)

    def _parse_hierarchy(self, dp_el: ET.Element) -> None:
        r = self._result
        name = dp_el.get('name', '')
        if not name:
            return
        caption = dp_el.get('caption')
        levels = [f.get('name', '').strip('[]') for f in dp_el.findall('.//field')]
        hd = HierarchyDef(name=name, caption=caption, levels=levels)
        r.hierarchies.append(hd)

    # ── §13 Mark types ────────────────────────────────────────────────────────

    def _parse_worksheet_marks(self, ws_el: ET.Element) -> None:
        r = self._result
        ws_name = ws_el.get('name', '')
        mark_el = ws_el.find('.//mark')
        if mark_el is None:
            mark_el = ws_el.find('.//pane/mark')
        mark_type = (mark_el.get('class', 'Automatic') if mark_el is not None else 'Automatic')

        # normalise
        mark_type = mark_type.capitalize()

        has_dual = ws_el.find('.//dual-map') is not None
        has_vit = ws_el.find('.//viz-in-tooltip') is not None
        tooltip_sheets: list[str] = []
        for vit_el in ws_el.findall('.//viz-in-tooltip/sheet'):
            tooltip_sheets.append(vit_el.get('name', ''))

        if has_vit:
            r.has_viz_in_tooltip = True

        if mark_type not in ('Automatic', 'Bar', 'Line', 'Circle'):
            r.has_custom_marks = True

        mt = MarkTypeDef(
            worksheet=ws_name,
            mark_type=mark_type,
            has_dual_axis=has_dual,
            has_viz_in_tooltip=has_vit,
            tooltip_sheets=tooltip_sheets,
        )
        r.mark_types.append(mt)

        if mark_type not in r.unique_mark_types:
            r.unique_mark_types.append(mark_type)

    # ── §14 Dashboard layout ──────────────────────────────────────────────────

    def _parse_dashboard(self, db_el: ET.Element) -> None:
        r = self._result
        name = db_el.get('name', '')
        w = db_el.get('maxwidth') or db_el.get('width')
        h = db_el.get('maxheight') or db_el.get('height')

        dd = DashboardDef(
            name=name,
            width=int(w) if w else None,
            height=int(h) if h else None,
        )

        # device layouts
        device_els = db_el.findall('.//device-layout')
        if device_els:
            dd.has_device_layouts = True
            r.has_device_layouts = True
            for dev in device_els:
                dt = dev.get('device-type', dev.get('name', ''))
                if dt not in dd.device_types:
                    dd.device_types.append(dt)

        # objects / zones
        for zone_el in db_el.findall('.//zone'):
            obj_type = zone_el.get('type', 'worksheet')
            is_floating = zone_el.get('fixed', 'false').lower() == 'true'

            x = zone_el.get('x')
            y = zone_el.get('y')
            w_z = zone_el.get('w')
            h_z = zone_el.get('h')

            obj = DashboardObject(
                object_type=obj_type,
                name=zone_el.get('name') or zone_el.get('id'),
                x=float(x) if x else None,
                y=float(y) if y else None,
                w=float(w_z) if w_z else None,
                h=float(h_z) if h_z else None,
                is_floating=is_floating,
            )
            dd.objects.append(obj)
            if is_floating:
                dd.has_floating_objects = True
                r.has_floating_objects = True

        r.dashboards.append(dd)

    # ── §15 Actions ───────────────────────────────────────────────────────────

    def _parse_action(self, act_el: ET.Element) -> None:
        r = self._result
        name = act_el.get('name', '')
        act_type_raw = act_el.get('type', '').lower()
        run_on = act_el.get('run-action-on', 'select')

        # source / target
        source = None
        target = None
        src_sheets = act_el.findall('.//source-sheets/source-sheet')
        if src_sheets:
            source = src_sheets[0].get('name', '')
        tgt_sheet_el = act_el.find('.//target-sheet')
        if tgt_sheet_el is not None:
            target = tgt_sheet_el.get('name', '')

        url = act_el.get('url') or (act_el.find('.//url') is not None and act_el.find('.//url').text)
        if url is True:
            url = None

        # map type
        if 'filter' in act_type_raw:
            act_type = 'filter'
            r.filter_action_count += 1
        elif 'highlight' in act_type_raw:
            act_type = 'highlight'
            r.highlight_action_count += 1
        elif 'url' in act_type_raw or url:
            act_type = 'url'
            r.url_action_count += 1
        elif 'set' in act_type_raw:
            act_type = 'set'
            r.set_action_count += 1
            r.has_set_actions = True
        elif 'parameter' in act_type_raw:
            act_type = 'parameter'
            r.parameter_action_count += 1
            r.has_parameter_actions = True
        else:
            act_type = act_type_raw or 'filter'
            r.filter_action_count += 1

        ad = ActionDef(
            name=name,
            action_type=act_type,
            source_sheet=source,
            target_sheet=target,
            url=str(url) if url else None,
            run_action_on=run_on,
        )
        r.actions.append(ad)

    # ── §16 Formatting ────────────────────────────────────────────────────────

    def _parse_format(self, fmt_el: ET.Element) -> None:
        r = self._result
        attr = fmt_el.get('attr', '')
        value = fmt_el.get('value', '')

        if attr in ('number-format', 'date-format', 'percent-format'):
            if value not in ('#,##0', '0', '0.00', 'General'):
                r.has_custom_number_formats = True
                r.formats.append(FormatSpec(
                    scope='worksheet',
                    format_type='number',
                    pattern=value,
                ))

        if attr == 'font-family' and value not in ('Tableau', '', 'Arial', 'Calibri', 'Segoe UI'):
            r.custom_font_count += 1
            r.formats.append(FormatSpec(
                scope='worksheet',
                format_type='font',
                font_name=value,
            ))

    # ── §20 Stories ───────────────────────────────────────────────────────────

    def _parse_story(self, story_el: ET.Element) -> None:
        r = self._result
        name = story_el.get('name', '')
        title_el = story_el.find('.//title/run')
        title = title_el.text if title_el is not None else None

        sd = StoryDef(name=name, title=title)
        for sp_el in story_el.findall('.//story-point'):
            caption = sp_el.get('caption', '')
            sheet_el = sp_el.find('.//story-point-content')
            sheet_name = sheet_el.get('name') if sheet_el is not None else None
            nav = sp_el.get('navigator-hidden', 'false').lower() == 'true'
            sd.story_points.append(StoryPoint(caption=caption, sheet_name=sheet_name, navigator_hidden=nav))

        r.stories.append(sd)

    # ── §21 Extensions ────────────────────────────────────────────────────────

    def _parse_extension_zone(self, zone_el: ET.Element) -> None:
        r = self._result
        ws = zone_el.get('name', '')
        url_el = zone_el.find('.//addin-url') or zone_el.find('.//url')
        url = url_el.text if url_el is not None else zone_el.get('url', '')
        r.extensions.append(ExtensionDef(name=ws or 'unknown', url=url, worksheet=ws))

    def _parse_extension_def(self, ext_el: ET.Element) -> None:
        r = self._result
        name = ext_el.get('name', ext_el.get('id', 'unknown'))
        url = ext_el.get('url', '')
        version = ext_el.get('version', '')
        r.extensions.append(ExtensionDef(name=name, url=url, version=version))

    def _parse_dashboard_extension(self, ext_el: ET.Element) -> None:
        r = self._result
        name = ext_el.get('name', ext_el.get('id', 'unknown'))
        url = ext_el.get('url', '')
        version = ext_el.get('version', '')
        r.extensions.append(ExtensionDef(name=name, url=url, version=version, is_dashboard_extension=True))

    # ── §23 Embedded analytics detection ─────────────────────────────────────

    def _detect_embedding(self, root: ET.Element) -> None:
        r = self._result
        # JS API usage hinted by trusted-tickets or embed params
        for el in root.iter():
            attrs = (el.get('trusted-ticket', '') + el.get('embed', '') +
                     el.get('javascript', '') + (el.text or ''))
            if 'tableauSoftware' in attrs or 'viz.tableau.com' in attrs:
                r.has_javascript_api = True
            if 'embed=yes' in attrs.lower() or ':embed=y' in attrs.lower():
                r.has_embedding_params = True

    # ── Finalize ──────────────────────────────────────────────────────────────

    def _finalize_counts(self) -> None:
        r = self._result
        r.total_calc_fields = len(r.calc_fields)
        r.total_lod_count = len(r.lod_expressions)
        r.total_table_calc_count = len(r.table_calcs)
        r.total_parameter_count = len(r.parameters)
        r.total_dashboards = len(r.dashboards)
        r.total_stories = len(r.stories)
        r.total_extensions = len(r.extensions)

        # de-duplicate parameters (Parameters datasource may add twice)
        seen: set[str] = set()
        unique_params: list[Parameter] = []
        for p in r.parameters:
            if p.name not in seen:
                seen.add(p.name)
                unique_params.append(p)
        r.parameters = unique_params
        r.total_parameter_count = len(r.parameters)

        # de-duplicate extensions
        seen_ext: set[str] = set()
        unique_ext: list[ExtensionDef] = []
        for e in r.extensions:
            key = f"{e.name}|{e.url}"
            if key not in seen_ext:
                seen_ext.add(key)
                unique_ext.append(e)
        r.extensions = unique_ext
        r.total_extensions = len(r.extensions)

        # has_parameter_actions from actions list
        if any(a.action_type == 'parameter' for a in r.actions):
            r.has_parameter_actions = True


# ── Convenience function ──────────────────────────────────────────────────────

def parse_twb(data: bytes, workbook_name: str = "") -> WorkbookDeepAnalysis:
    """Parse .twb or .twbx bytes and return a WorkbookDeepAnalysis."""
    return TwbParser.from_bytes(data, workbook_name)
