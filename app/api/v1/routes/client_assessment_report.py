"""Client Assessment Report API route.

POST /api/v1/client-assessment-report/generate
  Accepts the full client data payload and returns a .docx download.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.v1.routes.auth import get_current_user
from app.models.client_assessment_report import ClientAssessmentReportRequest
from app.services.client_assessment_report_service import build_client_assessment_report

router = APIRouter(
    prefix="/api/v1/client-assessment-report",
    tags=["Client Assessment Report"],
)

WORD_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

AuthDep = Depends(get_current_user)


@router.post(
    "/generate",
    summary="Generate a Client Assessment Report (.docx)",
    response_class=Response,
)
async def generate_report(
    payload: ClientAssessmentReportRequest,
    _user=AuthDep,
) -> Response:
    doc_bytes = build_client_assessment_report(payload)
    safe_name  = payload.client_name.replace(" ", "_").replace("/", "-")
    filename   = f"Assessment_Report_-_{safe_name}.docx"
    return Response(
        content=doc_bytes,
        media_type=WORD_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
