"""Pydantic models for the Client Assessment Report generator."""

from typing import List, Optional
from pydantic import BaseModel


class DataSource(BaseModel):
    name: str
    category: str = ""
    type: str = ""
    integration_method: str = ""
    description: str = ""


class HighVolumeTable(BaseModel):
    schema_name: str = "dbo"
    name: str
    row_count: str = ""
    activity: str = "High"


class DatabaseDetail(BaseModel):
    name: str
    schema_count: str = "-"
    table_count: str = "-"
    view_count: str = "-"
    stored_proc_count: str = "-"
    function_count: str = "0"
    data_size: str = "-"
    observations: List[str] = []
    high_volume_tables: List[HighVolumeTable] = []


class SemanticModelInfo(BaseModel):
    table_count: str = "-"
    measure_count: str = "-"
    relationship_count: str = "-"
    role_count: str = "0"


class ReportItem(BaseModel):
    platform: str = "Power BI"
    workspace: str = "-"
    name: str
    description: str = ""


class OutboundSystem(BaseModel):
    category: str
    name: str
    type: str = ""
    connection: str = ""
    description: str = ""


class IntermediateSystem(BaseModel):
    layer: str = ""
    name: str
    role: str = ""


class PainPoint(BaseModel):
    label: str = ""
    description: str


class CostComparison(BaseModel):
    category: str
    current_cost: str
    proposed_cost: str


class ROIItem(BaseModel):
    category: str
    current: str
    proposed: str
    benefit: str


class MigrationTask(BaseModel):
    task: str
    hours: str


class ResourceSplit(BaseModel):
    resource: str
    hours: str


class SourceRecommendation(BaseModel):
    source_name: str
    recommendations: List[str] = []


class ClientAssessmentReportRequest(BaseModel):
    client_name: str
    industry: str = ""
    architecture_description: str = ""
    user_count: str = ""
    dev_count: str = ""

    data_sources: List[DataSource] = []
    databases: List[DatabaseDetail] = []

    etl_tool: str = "SQL Agent Jobs and SSIS"
    etl_job_count: str = ""
    etl_jobs: List[str] = []

    reporting_tool: str = "Power BI"
    semantic_model: Optional[SemanticModelInfo] = None
    reports: List[ReportItem] = []

    outbound_systems: List[OutboundSystem] = []
    intermediate_systems: List[IntermediateSystem] = []

    pain_points: List[PainPoint] = []
    fabric_benefits: List[str] = []
    source_recommendations: List[SourceRecommendation] = []
    data_flow_steps: List[str] = []

    proposed_capacity: str = "F16"
    region: str = "Central US"
    reserved_price: str = ""
    paygo_price: str = ""
    project_duration: str = "3 Months"

    cost_comparison: List[CostComparison] = []
    roi_table: List[ROIItem] = []
    migration_tasks: List[MigrationTask] = []
    resource_split: List[ResourceSplit] = []
    deliverables: List[str] = []
