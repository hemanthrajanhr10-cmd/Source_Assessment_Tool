"""
fabric_assessment — Async Fabric Semantic Model extraction pipeline.

Public surface
--------------
    from app.fabric_assessment.extractor import (
        extract_semantic_model,       # async
        extract_semantic_model_sync,  # sync shim
    )
    from app.fabric_assessment.models import SemanticModelAssessment
"""

from app.fabric_assessment.extractor import (
    extract_semantic_model,
    extract_semantic_model_sync,
)
from app.fabric_assessment.models import (
    CalculatedColumnInfo,
    CalculatedTableInfo,
    MeasureInfo,
    SemanticModelAssessment,
)

__all__ = [
    "extract_semantic_model",
    "extract_semantic_model_sync",
    "SemanticModelAssessment",
    "MeasureInfo",
    "CalculatedColumnInfo",
    "CalculatedTableInfo",
]
