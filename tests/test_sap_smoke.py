"""
SAP Integration Smoke Test Suite
=================================
10 tests — one per SAP system variant.

Each test:
  1. Builds a mock SapAssessmentRequest with valid stub credentials.
  2. Calls test_connection() and asserts it succeeds.
  3. Creates a job and runs the full assessment (synchronously, via asyncio.run).
  4. Fetches the stored result and asserts:
       - status == "completed"
       - All 6 common assessment dimensions are non-null
       - The variant-specific block is present and non-null
       - All asserted numeric fields are non-negative integers or floats

Run with:
    pytest tests/test_sap_smoke.py -v

No live SAP system required — all responses are from the mock data layer.
"""

import asyncio
import time
import pytest

from pydantic import SecretStr

from app.models.sap_requests import (
    SapAssessmentRequest,
    SapRfcParams,
    SapHanaParams,
    SapPiPoParams,
    SapSuccessFactorsParams,
    SapODataParams,
    SapAssessmentResult,
)
from app.services import sap_assessment_service as svc


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _rfc(host: str = "sap-host.corp.local") -> SapRfcParams:
    return SapRfcParams(host=host, sysnr="00", client="100", username="basis_user", password=SecretStr("s3cr3t!"))


def _run_job(request: SapAssessmentRequest) -> dict:
    """Create job, run assessment synchronously, return the completed job dict."""
    job_id = svc.create_job(request)
    asyncio.run(svc.run_assessment(job_id, request))
    job = svc.get_job(job_id)
    assert job is not None, "Job was not persisted."
    return job


def _assert_common_dimensions(result_dict: dict) -> SapAssessmentResult:
    """Parse and validate all 6 common assessment dimensions are populated."""
    result = SapAssessmentResult(**result_dict)

    assert result.system_info is not None, "system_info is None"
    assert result.system_info.system_id, "system_id is empty"
    assert result.system_info.basis_release, "basis_release is empty"

    assert result.object_inventory is not None, "object_inventory is None"
    assert result.object_inventory.total_repository_objects >= 0
    assert result.object_inventory.custom_ratio_pct >= 0.0

    assert result.data_volumes is not None, "data_volumes is None"

    assert result.user_profile is not None, "user_profile is None"
    assert result.user_profile.active_users >= 0

    assert result.performance is not None, "performance is None"
    assert result.performance.avg_response_ms >= 0

    assert result.extraction_readiness is not None, "extraction_readiness is None"
    assert isinstance(result.extraction_readiness.supported_methods, list)

    return result


# ── Test report helper ────────────────────────────────────────────────────────

class SmokeTestReport:
    """Collects per-test timings for the final summary printed by the fixture."""
    results: list[dict] = []

    @classmethod
    def record(cls, variant: str, status: str, duration_ms: float, error: str = "") -> None:
        cls.results.append({"variant": variant, "status": status, "duration_ms": round(duration_ms, 1), "error": error})


# ── Individual smoke tests ────────────────────────────────────────────────────

class TestSapEccSmoke:
    """SAP ECC — RFC connectivity, module volumes, Z-table ratio, ABAP programs."""

    VARIANT = "ecc"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True
        assert "SID" in result["message"] or len(result["message"]) > 5

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(variant=self.VARIANT, label="ECC Smoke Test", rfc=_rfc())
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.ecc is not None, "ECC variant block is None"
        assert result.ecc.z_table_count >= 0
        assert result.ecc.abap_program_count >= 0
        assert 0.0 <= result.ecc.z_table_ratio_pct <= 100.0
        assert len(result.ecc.transport_landscape) > 0
        assert "FI" in result.ecc.module_volumes
        assert all(v >= 0 for v in result.ecc.module_volumes.values())

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapS4HanaSmoke:
    """SAP S/4HANA — RFC + optional OData, Fiori apps, BAdIs, migration objects."""

    VARIANT = "s4hana"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            label="S/4HANA Smoke Test",
            rfc=_rfc(),
            odata=SapODataParams(api_base_url="https://s4hana.corp.local/sap/opu/odata"),
        )
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.s4hana is not None, "S/4HANA variant block is None"
        assert result.s4hana.fiori_app_count >= 0
        assert result.s4hana.activated_business_functions >= 0
        assert result.s4hana.badi_count >= 0
        assert result.s4hana.migration_object_count >= 0
        assert isinstance(result.s4hana.embedded_hana, bool)

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapBwSmoke:
    """SAP BW / BW4HANA — InfoProviders, Process Chains, DTPs, delta mechanisms."""

    VARIANT = "bw"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(variant=self.VARIANT, label="BW Smoke Test", rfc=_rfc())
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.bw is not None, "BW variant block is None"
        assert result.bw.info_cube_count >= 0
        assert result.bw.dso_adso_count >= 0
        assert result.bw.process_chain_count >= 0
        assert result.bw.dtp_count >= 0
        assert result.bw.query_workbook_count >= 0
        assert isinstance(result.bw.delta_mechanism_types, list)

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapHanaSmoke:
    """SAP HANA (standalone) — JDBC, schemas, column/row store, calculation views."""

    VARIANT = "hana"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            hana=SapHanaParams(host="hana.corp.local", port=30015, instance_number="00", schema="SYSTEM", username="SYSTEM", password=SecretStr("s3cr3t!")),
        )
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            label="HANA Smoke Test",
            hana=SapHanaParams(host="hana.corp.local", port=30015, instance_number="00", schema="SYSTEM", username="SYSTEM", password=SecretStr("s3cr3t!")),
        )
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.hana is not None, "HANA variant block is None"
        assert result.hana.schema_count >= 0
        assert result.hana.column_store_tables >= 0
        assert result.hana.row_store_tables >= 0
        assert result.hana.calculation_views >= 0
        assert result.hana.total_data_volume_gb >= 0.0
        assert result.hana.replication_status

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapCrmSmoke:
    """SAP CRM — Business Partners, IC profiles, campaigns, middleware queues."""

    VARIANT = "crm"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(variant=self.VARIANT, label="CRM Smoke Test", rfc=_rfc())
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.crm is not None, "CRM variant block is None"
        assert result.crm.business_partner_count >= 0
        assert result.crm.middleware_queues >= 0
        assert result.crm.campaign_objects >= 0

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapSrmSmoke:
    """SAP SRM — Vendors, shopping carts, POs, catalog items, backend connections."""

    VARIANT = "srm"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(variant=self.VARIANT, label="SRM Smoke Test", rfc=_rfc())
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.srm is not None, "SRM variant block is None"
        assert result.srm.vendor_master_count >= 0
        assert result.srm.shopping_cart_count >= 0
        assert result.srm.purchase_order_count >= 0
        assert result.srm.catalog_items >= 0
        assert result.srm.backend_system_connections >= 0

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapScmSmoke:
    """SAP SCM / APO — liveCache, planning areas, models, CIF systems."""

    VARIANT = "scm"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(variant=self.VARIANT, label="SCM/APO Smoke Test", rfc=_rfc())
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.scm is not None, "SCM variant block is None"
        assert result.scm.live_cache_status
        assert result.scm.planning_area_count >= 0
        assert result.scm.cif_connected_systems >= 0

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapPiPoSmoke:
    """SAP PI/PO — REST, iFlows, interfaces, adapters, message monitoring."""

    VARIANT = "pi_po"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            pi_po=SapPiPoParams(host="pi-host.corp.local", port=50000, username="piuser", password=SecretStr("s3cr3t!"), use_https=True),
        )
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            label="PI/PO Smoke Test",
            pi_po=SapPiPoParams(host="pi-host.corp.local", port=50000, username="piuser", password=SecretStr("s3cr3t!"), use_https=True),
        )
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.pi_po is not None, "PI/PO variant block is None"
        assert result.pi_po.interface_count >= 0
        assert result.pi_po.avg_daily_messages >= 0
        assert 0.0 <= result.pi_po.error_rate_pct <= 100.0
        assert isinstance(result.pi_po.adapter_types, list)
        assert len(result.pi_po.adapter_types) > 0

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapMdgSmoke:
    """SAP MDG — Governed entities, workflow rules, change requests, consolidation."""

    VARIANT = "mdg"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(variant=self.VARIANT, rfc=_rfc())
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(variant=self.VARIANT, label="MDG Smoke Test", rfc=_rfc())
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.mdg is not None, "MDG variant block is None"
        assert result.mdg.governed_entity_types >= 0
        assert result.mdg.workflow_rule_count >= 0
        assert result.mdg.governance_model
        assert result.mdg.open_change_requests >= 0

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


class TestSapSuccessFactorsSmoke:
    """SAP SuccessFactors — OData/OAuth2, modules, employees, MDF objects."""

    VARIANT = "successfactors"

    def test_connection_succeeds(self):
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            successfactors=SapSuccessFactorsParams(
                api_url="https://api.successfactors.com",
                company_id="ACME_CORP",
                client_id="cli-1234",
                client_secret=SecretStr("s3cr3t!"),
                user_id="admin@acme.com",
            ),
        )
        result = svc.test_connection(req)
        assert result["success"] is True

    def test_full_assessment(self):
        t0 = time.perf_counter()
        req = SapAssessmentRequest(
            variant=self.VARIANT,
            label="SuccessFactors Smoke Test",
            successfactors=SapSuccessFactorsParams(
                api_url="https://api.successfactors.com",
                company_id="ACME_CORP",
                client_id="cli-1234",
                client_secret=SecretStr("s3cr3t!"),
                user_id="admin@acme.com",
            ),
        )
        job = _run_job(req)

        assert job["status"] == "completed", f"Job failed: {job.get('error')}"
        result = _assert_common_dimensions(job["results"])

        assert result.successfactors is not None, "SuccessFactors variant block is None"
        assert result.successfactors.employee_count >= 0
        assert result.successfactors.mdf_object_count >= 0
        assert isinstance(result.successfactors.active_modules, list)
        assert len(result.successfactors.active_modules) > 0
        assert result.successfactors.replication_status

        duration = (time.perf_counter() - t0) * 1000
        SmokeTestReport.record(self.VARIANT, "PASS", duration)


# ── Summary fixture ───────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def smoke_test_summary():
    """Print a pass/fail summary table after all smoke tests complete."""
    yield
    if not SmokeTestReport.results:
        return

    print("\n" + "=" * 70)
    print("  SAP SMOKE TEST SUMMARY")
    print("=" * 70)
    print(f"  {'Variant':<20} {'Status':<8} {'Duration':>12}")
    print("  " + "-" * 44)
    for r in SmokeTestReport.results:
        status_sym = "PASS" if r["status"] == "PASS" else "FAIL"
        error_note = f"  ← {r['error']}" if r["error"] else ""
        print(f"  {r['variant']:<20} {status_sym:<8} {r['duration_ms']:>9.1f} ms{error_note}")
    print("=" * 70)
    passing = sum(1 for r in SmokeTestReport.results if r["status"] == "PASS")
    print(f"  {passing}/{len(SmokeTestReport.results)} tests passed")
    print("=" * 70 + "\n")


# ── Error-handling tests ──────────────────────────────────────────────────────

class TestSapConnectionErrors:
    """Validate that missing credentials return clear, actionable error messages."""

    def test_rfc_missing_username_fails(self):
        req = SapAssessmentRequest(
            variant="ecc",
            rfc=SapRfcParams(host="host.corp.local", sysnr="00", client="100", username="", password=SecretStr("pwd")),
        )
        result = svc.test_connection(req)
        assert result["success"] is False
        assert "username" in result["message"].lower() or "password" in result["message"].lower()

    def test_rfc_empty_host_fails(self):
        req = SapAssessmentRequest(
            variant="bw",
            rfc=SapRfcParams(host="", sysnr="00", client="100", username="user", password=SecretStr("pwd")),
        )
        result = svc.test_connection(req)
        assert result["success"] is False

    def test_hana_missing_credentials_fails(self):
        req = SapAssessmentRequest(
            variant="hana",
            hana=SapHanaParams(host="hana.corp.local", port=30015, instance_number="00", schema="SYSTEM", username="", password=SecretStr("")),
        )
        result = svc.test_connection(req)
        assert result["success"] is False
        assert len(result["message"]) > 0
