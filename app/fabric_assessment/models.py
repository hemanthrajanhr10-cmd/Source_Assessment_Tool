"""
Data models for the Fabric Semantic Model extraction pipeline.

All shapes are implemented as standard dataclasses for compatibility with
the rest of the application (which mixes dataclasses and Pydantic models).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ComplexityTier = Literal["SIMPLE", "MODERATE", "COMPLEX", "HIGHLY_COMPLEX", "CIRCULAR"]


@dataclass
class MeasureInfo:
    name: str
    table: str
    dax_expression: str
    description: str | None
    display_folder: str | None
    format_string: str | None
    is_hidden: bool
    complexity: ComplexityTier
    dependency_depth: int          # 0 = SIMPLE; -1 = CIRCULAR (undefined depth)
    dependency_chain: list[str]    # ordered: this measure → root dependency


@dataclass
class CalculatedColumnInfo:
    name: str
    table: str
    dax_expression: str
    data_type: str
    is_hidden: bool


@dataclass
class CalculatedTableInfo:
    name: str
    dax_expression: str


@dataclass
class SemanticModelAssessment:
    workspace_id: str
    dataset_id: str
    model_name: str
    compatibility_level: int
    default_mode: str
    tables: list[dict[str, Any]]
    measures: list[MeasureInfo]
    calculated_tables: list[CalculatedTableInfo]
    calculated_columns: list[CalculatedColumnInfo]
    relationships: list[dict[str, Any]]
    extraction_duration_seconds: float
    extracted_at: str                          # ISO 8601
    warnings: list[str] = field(default_factory=list)
