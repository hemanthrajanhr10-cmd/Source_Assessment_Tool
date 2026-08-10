"""
Infor ION API client — multi-engine (M3 / LN / CSI) assessment extraction.

Authentication:
  OAuth 2.0 client_credentials flow against the Infor ION API Gateway.
  Token endpoint: POST {ion_api_url}/as/token.oauth2
  The bearer token is then passed in Authorization: Bearer {token} on every
  subsequent call.

Engine-specific API surfaces:
  M3  : /M3/m3api-rest/v2/execute/{ProgramName}/{TransactionName}
        Key programs: MRS001 (catalog), MRS002 (table structure),
                      MRS003 (field metadata), MDBREADMI (data read)
  LN  : /ln/{TenantId}/BOD-API/   — BOD catalog
        VRC customisation via LN Component Tools API
  CSI : MSSQL-based schema queries via ION Grid REST

Mock mode:
  When INFOR_MOCK=1 (or credentials contain ion_api_url="mock://"),
  the client returns pre-built fixture payloads covering M3, LN, and CSI.
  This allows unit-testing pipeline parsing logic without a live Infor tenant.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

import requests

from app.models.infor_requests import (
    EDITION_ENGINE_MAP,
    InforEngine,
    InforIonCredentials,
)

logger = logging.getLogger(__name__)

_MOCK_MODE = os.getenv("INFOR_MOCK", "0") == "1"

_TOKEN_PATH = "/as/token.oauth2"
_M3_EXEC_PATH = "/M3/m3api-rest/v2/execute"

# ── OAuth token ───────────────────────────────────────────────────────────────

class InforIonClient:
    """
    Thin wrapper around requests that handles:
      - OAuth 2.0 client_credentials token acquisition
      - Bearer-token injection for all subsequent calls
      - Transparent mock mode for dev/test
    """

    def __init__(self, creds: InforIonCredentials, mock: bool = False) -> None:
        self._creds = creds
        self._mock = mock or _MOCK_MODE or creds.ion_api_url.startswith("mock://")
        self._token: Optional[str] = None
        self._session = requests.Session()
        self._base = creds.ion_api_url.rstrip("/")

    # ── Auth ──────────────────────────────────────────────────────────────────

    def authenticate(self) -> str:
        """Acquire an OAuth 2.0 bearer token. Returns the access_token string."""
        if self._mock:
            self._token = "mock-token-infor-ion"
            return self._token

        url = f"{self._base}{_TOKEN_PATH}"
        data: dict[str, str] = {
            "grant_type": "client_credentials",
            "client_id": self._creds.client_id,
            "client_secret": self._creds.client_secret.get_secret_value(),
        }
        # Some ION deployments require resource-owner credentials alongside client_credentials
        if self._creds.username:
            data["grant_type"] = "password"
            data["username"] = self._creds.username
            data["password"] = self._creds.password.get_secret_value() if self._creds.password else ""

        resp = self._session.post(url, data=data, timeout=30)
        resp.raise_for_status()
        self._token = resp.json()["access_token"]
        return self._token

    def _headers(self) -> dict[str, str]:
        if not self._token:
            raise RuntimeError("Not authenticated — call authenticate() first")
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        if self._mock:
            return None  # callers fall through to mock data
        url = f"{self._base}{path}"
        resp = self._session.get(url, headers=self._headers(), params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> Any:
        if self._mock:
            return None
        url = f"{self._base}{path}"
        resp = self._session.post(url, headers=self._headers(), json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ── Engine detection ──────────────────────────────────────────────────────

    def detect_engine(self, edition: Optional[str] = None) -> Optional[InforEngine]:
        """
        Determine the underlying engine.
        Priority:
          1. edition slug matched against EDITION_ENGINE_MAP
          2. Probe ION tenant catalog for installed application IDs
          3. Return None if undetermined (caller must fail loudly)
        """
        if edition:
            slug = edition.strip().lower().replace(" ", "_").replace("-", "_")
            if slug in EDITION_ENGINE_MAP:
                return EDITION_ENGINE_MAP[slug]

        # Probe tenant application catalog
        catalog = self._fetch_tenant_app_catalog()
        return _infer_engine_from_catalog(catalog)

    def _fetch_tenant_app_catalog(self) -> list[str]:
        """Return list of application IDs installed in the tenant."""
        if self._mock:
            return _MOCK_TENANT_CATALOG
        try:
            data = self._get(f"/IONAPI/rest/os/tenants/{self._creds.tenant_id}/applications")
            if data and isinstance(data, dict):
                apps = data.get("applications", data.get("items", []))
                return [a.get("id", a.get("applicationId", "")) for a in apps if isinstance(a, dict)]
        except Exception as exc:
            logger.warning("Could not fetch tenant catalog: %s", exc)
        return []

    def get_tenant_info(self) -> dict[str, Any]:
        """Fetch basic tenant/environment metadata."""
        if self._mock:
            return _MOCK_TENANT_INFO
        try:
            data = self._get(f"/IONAPI/rest/os/tenants/{self._creds.tenant_id}")
            return data or {}
        except Exception as exc:
            logger.warning("get_tenant_info failed: %s", exc)
            return {}

    # ── M3 API surface ────────────────────────────────────────────────────────

    def m3_mrs001_catalog(self, max_records: int = 2000) -> list[dict]:
        """MRS001 — program / table catalog."""
        if self._mock:
            return _MOCK_M3_MRS001[:max_records]
        try:
            resp = self._post(f"{_M3_EXEC_PATH}/MRS001MI/LstPrograms", {
                "maxRecords": max_records,
                "outputFields": ["PGNM", "PGAL", "PGTP", "PGMF"],
            })
            return (resp or {}).get("results", [])
        except Exception as exc:
            logger.warning("m3_mrs001_catalog: %s", exc)
            return []

    def m3_mrs002_table_structure(self, table_name: str) -> list[dict]:
        """MRS002 — table structure for a given M3 table."""
        if self._mock:
            return _MOCK_M3_MRS002.get(table_name, [])
        try:
            resp = self._post(f"{_M3_EXEC_PATH}/MRS002MI/GetTableInfo", {
                "TABN": table_name,
                "outputFields": ["TABN", "TABQ", "TAIL", "TABS"],
            })
            return (resp or {}).get("results", [])
        except Exception as exc:
            logger.warning("m3_mrs002_table_structure(%s): %s", table_name, exc)
            return []

    def m3_mrs003_field_metadata(self, table_name: str) -> list[dict]:
        """MRS003 — field-level metadata for a given M3 table."""
        if self._mock:
            return _MOCK_M3_MRS003.get(table_name, [])
        try:
            resp = self._post(f"{_M3_EXEC_PATH}/MRS003MI/GetFieldInfo", {
                "TABN": table_name,
                "outputFields": ["FLNM", "FLTP", "FLDL", "FMND"],
            })
            return (resp or {}).get("results", [])
        except Exception as exc:
            logger.warning("m3_mrs003_field_metadata(%s): %s", table_name, exc)
            return []

    def m3_mdbreadmi_verify(self, table_name: str = "MITMAS") -> bool:
        """MDBREADMI — verify data-read access against a canonical table."""
        if self._mock:
            return True
        try:
            resp = self._post(f"{_M3_EXEC_PATH}/MDBREADMI/Select", {
                "FLDI": "ITNO",
                "KFIX": table_name,
                "maxRecords": 1,
            })
            return resp is not None
        except Exception as exc:
            logger.warning("m3_mdbreadmi_verify: %s", exc)
            return False

    def m3_custom_programs(self) -> list[dict]:
        """Return list of customer-prefixed (Z/X/Y) programs."""
        if self._mock:
            return _MOCK_M3_CUSTOM_PROGRAMS
        catalog = self.m3_mrs001_catalog(max_records=5000)
        return [
            p for p in catalog
            if isinstance(p.get("PGNM"), str)
            and p["PGNM"][:1].upper() in ("Z", "X", "Y")
        ]

    def m3_multi_site(self) -> dict:
        """Fetch multi-company / multi-site complexity via CRS100MI / CRS008MI."""
        if self._mock:
            return _MOCK_M3_MULTI_SITE
        result: dict[str, Any] = {}
        for program, tx, key in [
            ("CRS100MI", "LstCompanies", "companies"),
            ("CRS008MI", "LstFacilities", "facilities"),
        ]:
            try:
                resp = self._post(f"{_M3_EXEC_PATH}/{program}/{tx}", {"maxRecords": 500})
                result[key] = (resp or {}).get("results", [])
            except Exception as exc:
                logger.warning("m3_multi_site %s/%s: %s", program, tx, exc)
                result[key] = []
        return result

    # ── LN API surface ────────────────────────────────────────────────────────

    def ln_bod_catalog(self) -> list[dict]:
        """Return the ION BOD catalog for the LN tenant."""
        if self._mock:
            return _MOCK_LN_BOD_CATALOG
        try:
            data = self._get(
                f"/ION/userresource/2.0/ConnectionPoints",
                params={"tenantid": self._creds.tenant_id, "type": "BOD"},
            )
            return (data or {}).get("items", [])
        except Exception as exc:
            logger.warning("ln_bod_catalog: %s", exc)
            return []

    def ln_vrc_customizations(self) -> list[dict]:
        """Return VRC (Version/Release/Customization) packages from LN."""
        if self._mock:
            return _MOCK_LN_VRC
        try:
            data = self._get(f"/LN/{self._creds.tenant_id}/bsp/tools/vrc/packages")
            return (data or {}).get("packages", [])
        except Exception as exc:
            logger.warning("ln_vrc_customizations: %s", exc)
            return []

    def ln_companies(self) -> list[dict]:
        """Fetch LN company entities."""
        if self._mock:
            return _MOCK_LN_COMPANIES
        try:
            data = self._get(f"/LN/{self._creds.tenant_id}/bsp/tools/companies")
            return (data or {}).get("companies", [])
        except Exception as exc:
            logger.warning("ln_companies: %s", exc)
            return []

    def ln_ion_connections(self) -> list[dict]:
        """List ION integration connection points for the LN environment."""
        if self._mock:
            return _MOCK_LN_ION_CONNECTIONS
        try:
            data = self._get(
                "/ION/userresource/2.0/ConnectionPoints",
                params={"tenantid": self._creds.tenant_id},
            )
            return (data or {}).get("items", [])
        except Exception as exc:
            logger.warning("ln_ion_connections: %s", exc)
            return []

    def ln_packages(self) -> list[dict]:
        """Fetch installed LN packages / modules."""
        if self._mock:
            return _MOCK_LN_PACKAGES
        try:
            data = self._get(f"/LN/{self._creds.tenant_id}/bsp/tools/packages")
            return (data or {}).get("packages", [])
        except Exception as exc:
            logger.warning("ln_packages: %s", exc)
            return []

    # ── CSI / SyteLine API surface ────────────────────────────────────────────

    def csi_schema(self) -> dict:
        """Fetch SyteLine schema metadata via ION Grid REST."""
        if self._mock:
            return _MOCK_CSI_SCHEMA
        try:
            data = self._get(
                f"/SyteLine/{self._creds.tenant_id}/api/metadata/schema",
                params={"tenantid": self._creds.tenant_id},
            )
            return data or {}
        except Exception as exc:
            logger.warning("csi_schema: %s", exc)
            return {}

    def csi_custom_objects(self) -> list[dict]:
        """Return CSI custom tables, views and stored procedures."""
        if self._mock:
            return _MOCK_CSI_CUSTOM_OBJECTS
        try:
            data = self._get(
                f"/SyteLine/{self._creds.tenant_id}/api/metadata/custom-objects"
            )
            return (data or {}).get("objects", [])
        except Exception as exc:
            logger.warning("csi_custom_objects: %s", exc)
            return []

    def csi_sites(self) -> list[dict]:
        """Return CSI site configuration."""
        if self._mock:
            return _MOCK_CSI_SITES
        try:
            data = self._get(f"/SyteLine/{self._creds.tenant_id}/api/sites")
            return (data or {}).get("sites", [])
        except Exception as exc:
            logger.warning("csi_sites: %s", exc)
            return []

    # ── Platform / Infor OS checks (all engines) ──────────────────────────────

    def ion_api_health(self) -> dict:
        """Check ION API gateway health."""
        if self._mock:
            return _MOCK_ION_HEALTH
        try:
            data = self._get("/IONAPI/rest/os/health")
            return data or {}
        except Exception as exc:
            logger.warning("ion_api_health: %s", exc)
            return {}

    def mingle_users(self) -> list[dict]:
        """Fetch Ming.le user list (first page)."""
        if self._mock:
            return _MOCK_MINGLE_USERS
        try:
            data = self._get(
                f"/IONAPI/rest/user-management/users",
                params={"tenantid": self._creds.tenant_id, "count": 500},
            )
            return (data or {}).get("items", [])
        except Exception as exc:
            logger.warning("mingle_users: %s", exc)
            return []

    def data_fabric_catalog(self) -> dict:
        """Check Infor Data Fabric catalog availability."""
        if self._mock:
            return _MOCK_DATA_FABRIC
        try:
            data = self._get(
                f"/DataFabric/{self._creds.tenant_id}/api/catalog/summary"
            )
            return data or {}
        except Exception as exc:
            logger.warning("data_fabric_catalog: %s", exc)
            return {}

    def birst_workbooks(self) -> list[dict]:
        """List Birst BI workbooks/spaces."""
        if self._mock:
            return _MOCK_BIRST
        try:
            data = self._get("/birst/rest/v1/spaces")
            return (data or {}).get("spaces", [])
        except Exception as exc:
            logger.warning("birst_workbooks: %s", exc)
            return []

    def coleman_ai_usage(self) -> dict:
        """Check Coleman AI deployment status."""
        if self._mock:
            return _MOCK_COLEMAN
        try:
            data = self._get(
                f"/ColemanAI/{self._creds.tenant_id}/api/status"
            )
            return data or {}
        except Exception as exc:
            logger.warning("coleman_ai_usage: %s", exc)
            return {}

    def ion_message_volume(self) -> dict:
        """Return ION integration bus daily message routing stats."""
        if self._mock:
            return _MOCK_ION_MESSAGES
        try:
            data = self._get(
                "/ION/userresource/2.0/MessageStats",
                params={"tenantid": self._creds.tenant_id, "period": "day"},
            )
            return data or {}
        except Exception as exc:
            logger.warning("ion_message_volume: %s", exc)
            return {}

    def grc_status(self) -> dict:
        """Check Infor GRC policy / control configuration."""
        if self._mock:
            return _MOCK_GRC
        try:
            data = self._get(f"/GRC/{self._creds.tenant_id}/api/controls/summary")
            return data or {}
        except Exception as exc:
            logger.warning("grc_status: %s", exc)
            return {}


# ── Engine inference from catalog ─────────────────────────────────────────────

def _infer_engine_from_catalog(app_ids: list[str]) -> Optional[InforEngine]:
    """Map tenant application IDs to an engine label."""
    joined = " ".join(app_ids).upper()
    if any(k in joined for k in ("M3", "MRS", "MDBREADMI", "MOVEX")):
        return "m3"
    if any(k in joined for k in ("LN", "BAAN", "BOD", "VRC")):
        return "ln"
    if any(k in joined for k in ("CSI", "SYTELINE", "SL")):
        return "csi"
    return None


# ── Mock fixture data ─────────────────────────────────────────────────────────

_MOCK_TENANT_CATALOG = [
    "M3", "M3_MDBREADMI", "MRS001", "MRS002", "MRS003",
    "MINGLE", "ION_API", "DATA_FABRIC", "BIRST",
]

_MOCK_TENANT_INFO = {
    "tenantId": "DEMO_TST",
    "tenantName": "DEMO Tenant (Mock)",
    "environment": "TEST",
    "ionApiVersion": "2024.01",
    "status": "active",
}

# ── M3 mock fixtures ──────────────────────────────────────────────────────────

_MOCK_M3_MRS001 = [
    # Standard programs
    {"PGNM": "MMS200",  "PGAL": "Item Master",              "PGTP": "01", "PGMF": "N"},
    {"PGNM": "OIS100",  "PGAL": "Customer Order Entry",     "PGTP": "01", "PGMF": "N"},
    {"PGNM": "PPS200",  "PGAL": "Purchase Order Entry",     "PGTP": "01", "PGMF": "N"},
    {"PGNM": "MWS410",  "PGAL": "Warehouse Order Proposal", "PGTP": "01", "PGMF": "N"},
    {"PGNM": "RPS010",  "PGAL": "Supply Planning",          "PGTP": "01", "PGMF": "N"},
    {"PGNM": "ARS100",  "PGAL": "Accounts Receivable",      "PGTP": "01", "PGMF": "N"},
    {"PGNM": "APS100",  "PGAL": "Accounts Payable",         "PGTP": "01", "PGMF": "N"},
    {"PGNM": "GLS010",  "PGAL": "General Ledger",           "PGTP": "01", "PGMF": "N"},
    {"PGNM": "FCS200",  "PGAL": "Forecasting",              "PGTP": "01", "PGMF": "N"},
    {"PGNM": "MNS095",  "PGAL": "User Settings",            "PGTP": "01", "PGMF": "N"},
    # Custom programs (customer extensions)
    {"PGNM": "ZMMS200", "PGAL": "Custom Item Master Ext",   "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "ZOIS100", "PGAL": "Custom Order Entry Ext",   "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "ZRPS010", "PGAL": "Custom Planning Ext",      "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "ZARC100", "PGAL": "Custom AR Extension",      "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "XGLS100", "PGAL": "Partner GL Extension",     "PGTP": "01", "PGMF": "Y"},
]

_MOCK_M3_MRS002: dict[str, list[dict]] = {
    "MITMAS": [
        {"TABN": "MITMAS", "TABQ": "Item Master",    "TAIL": "ITNO,ITDS,STAT,ITTY,ITGR,INCI", "TABS": "KEY:CONO,ITNO"},
        {"TABN": "MITBAL", "TABQ": "Item Balance",   "TAIL": "ITNO,WHLO,STQT,ALQT,PLQT",     "TABS": "KEY:CONO,WHLO,ITNO"},
    ],
    "OOHEAD": [
        {"TABN": "OOHEAD", "TABQ": "Order Header",   "TAIL": "ORNO,ORTP,CUNO,ORST,OREF",     "TABS": "KEY:CONO,ORNO"},
    ],
}

_MOCK_M3_MRS003: dict[str, list[dict]] = {
    "MITMAS": [
        {"FLNM": "CONO", "FLTP": "N", "FLDL": 3,  "FMND": "Y"},
        {"FLNM": "ITNO", "FLTP": "A", "FLDL": 15, "FMND": "Y"},
        {"FLNM": "ITDS", "FLTP": "A", "FLDL": 30, "FMND": "N"},
        {"FLNM": "STAT", "FLTP": "N", "FLDL": 2,  "FMND": "N"},
        {"FLNM": "ITTY", "FLTP": "A", "FLDL": 3,  "FMND": "N"},
        {"FLNM": "ITGR", "FLTP": "A", "FLDL": 8,  "FMND": "N"},
        {"FLNM": "INCI", "FLTP": "N", "FLDL": 1,  "FMND": "N"},
    ],
}

_MOCK_M3_CUSTOM_PROGRAMS = [
    {"PGNM": "ZMMS200",  "PGAL": "Custom Item Master Extension",  "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "ZOIS100",  "PGAL": "Custom Order Entry Extension",  "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "ZRPS010",  "PGAL": "Custom Planning Extension",     "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "ZARC100",  "PGAL": "Custom AR Extension",           "PGTP": "01", "PGMF": "Y"},
    {"PGNM": "XGLS100",  "PGAL": "Partner GL Extension",          "PGTP": "01", "PGMF": "Y"},
]

_MOCK_M3_MULTI_SITE = {
    "companies": [
        {"CONO": "100", "CONM": "DEMO Corp"},
        {"CONO": "200", "CONM": "DEMO Europe GmbH"},
        {"CONO": "300", "CONM": "DEMO Asia Ltd"},
    ],
    "facilities": [
        {"CONO": "100", "FACI": "F10", "FACN": "Main Facility"},
        {"CONO": "100", "FACI": "F20", "FACN": "East Facility"},
        {"CONO": "200", "FACI": "F30", "FACN": "Europe Facility"},
    ],
}

# ── LN mock fixtures ──────────────────────────────────────────────────────────

_MOCK_LN_BOD_CATALOG = [
    {"bodVerb": "Sync",     "bodNoun": "ItemMaster",          "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Sync",     "bodNoun": "CustomerPartyMaster", "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Sync",     "bodNoun": "SupplierPartyMaster", "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Process",  "bodNoun": "PurchaseOrder",       "direction": "inbound",  "appId": "LN"},
    {"bodVerb": "Process",  "bodNoun": "SalesOrder",          "direction": "inbound",  "appId": "LN"},
    {"bodVerb": "Acknowledge", "bodNoun": "ReceiveDelivery",  "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Sync",     "bodNoun": "ChartOfAccounts",     "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Sync",     "bodNoun": "GeneralLedger",       "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Process",  "bodNoun": "Invoice",             "direction": "inbound",  "appId": "LN"},
    {"bodVerb": "Sync",     "bodNoun": "WorkOrder",           "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Sync",     "bodNoun": "MaintenanceOrder",    "direction": "outbound", "appId": "LN"},
    {"bodVerb": "Get",      "bodNoun": "ProjectMaster",       "direction": "outbound", "appId": "LN"},
]

_MOCK_LN_VRC = [
    {"packageCode": "ZCU", "packageDescription": "Customer Customizations", "componentCount": 47, "modificationCount": 23},
    {"packageCode": "ZIT", "packageDescription": "IT Department Extensions", "componentCount": 12, "modificationCount": 8},
    {"packageCode": "ZFI", "packageDescription": "Finance Custom Reports",  "componentCount": 9,  "modificationCount": 4},
]

_MOCK_LN_COMPANIES = [
    {"companyId": "100", "companyName": "DEMO Corp",        "type": "financial",   "currency": "USD"},
    {"companyId": "200", "companyName": "DEMO Europe",      "type": "financial",   "currency": "EUR"},
    {"companyId": "300", "companyName": "DEMO Logistics",   "type": "logistical",  "currency": "USD"},
    {"companyId": "400", "companyName": "DEMO Manufacturing", "type": "logistical","currency": "USD"},
]

_MOCK_LN_ION_CONNECTIONS = [
    {"id": "cp001", "name": "LN to SF",      "type": "BOD", "status": "active",   "direction": "outbound"},
    {"id": "cp002", "name": "CRM to LN",     "type": "BOD", "status": "active",   "direction": "inbound"},
    {"id": "cp003", "name": "LN to Birst",   "type": "DATA","status": "active",   "direction": "outbound"},
    {"id": "cp004", "name": "WMS to LN",     "type": "BOD", "status": "inactive", "direction": "inbound"},
    {"id": "cp005", "name": "LN to eComm",   "type": "API", "status": "active",   "direction": "outbound"},
]

_MOCK_LN_PACKAGES = [
    {"id": "FIN", "name": "Financials", "version": "10.6", "active": True},
    {"id": "MFG", "name": "Manufacturing", "version": "10.6", "active": True},
    {"id": "LOG", "name": "Logistics", "version": "10.6", "active": True},
    {"id": "HRM", "name": "HR Management", "version": "10.6", "active": False},
    {"id": "CRM", "name": "CRM", "version": "10.6", "active": True},
    {"id": "PJM", "name": "Project Management", "version": "10.6", "active": True},
]

# ── CSI mock fixtures ─────────────────────────────────────────────────────────

_MOCK_CSI_SCHEMA = {
    "tableCount": 842,
    "customTableCount": 37,
    "viewCount": 214,
    "storedProcedureCount": 1203,
    "triggerCount": 89,
    "indexCount": 2847,
    "userDefinedFieldCount": 156,
    "eventHandlerCount": 43,
    "customFormCount": 28,
}

_MOCK_CSI_CUSTOM_OBJECTS = [
    {"name": "UD_ItemExtension",       "type": "table",             "custom": True},
    {"name": "UD_CustomerNotes",       "type": "table",             "custom": True},
    {"name": "UD_PriceMatrix",         "type": "table",             "custom": True},
    {"name": "UD_OrderWorkflow",       "type": "table",             "custom": True},
    {"name": "vUD_ItemSummary",        "type": "view",              "custom": True},
    {"name": "usp_UD_GenerateInvoice", "type": "stored_procedure",  "custom": True},
    {"name": "usp_UD_ShipCalc",        "type": "stored_procedure",  "custom": True},
]

_MOCK_CSI_SITES = [
    {"siteId": "MAIN",    "siteName": "Main Distribution", "country": "US"},
    {"siteId": "EAST",    "siteName": "East Coast Hub",    "country": "US"},
    {"siteId": "EUROPE",  "siteName": "European Ops",      "country": "DE"},
]

# ── Platform / Infor OS mock fixtures ─────────────────────────────────────────

_MOCK_ION_HEALTH = {
    "status": "healthy",
    "version": "2024.01",
    "uptime": "99.8%",
    "latencyMs": 42,
}

_MOCK_MINGLE_USERS = [
    {"userId": "jsmith",   "email": "jsmith@demo.com",   "role": "admin",    "mfaEnabled": True},
    {"userId": "ajones",   "email": "ajones@demo.com",   "role": "user",     "mfaEnabled": True},
    {"userId": "bwilson",  "email": "bwilson@demo.com",  "role": "user",     "mfaEnabled": False},
    {"userId": "clee",     "email": "clee@demo.com",     "role": "user",     "mfaEnabled": False},
    {"userId": "dkim",     "email": "dkim@demo.com",     "role": "manager",  "mfaEnabled": True},
]

_MOCK_DATA_FABRIC = {
    "present": True,
    "catalogAssetCount": 284,
    "domainCount": 7,
    "glossaryTermCount": 412,
    "lastRefreshed": "2026-06-20T08:00:00Z",
}

_MOCK_BIRST = [
    {"id": "ws001", "name": "Financial Analytics",  "type": "workspace", "active": True},
    {"id": "ws002", "name": "Supply Chain KPIs",    "type": "workspace", "active": True},
    {"id": "ws003", "name": "Sales Dashboard",      "type": "workspace", "active": True},
]

_MOCK_COLEMAN = {
    "deployed": True,
    "activeModels": 4,
    "totalPredictions": 12847,
    "lastActivity": "2026-06-24T14:32:00Z",
}

_MOCK_ION_MESSAGES = {
    "dailyMessageCount": 48320,
    "peakHour": "09:00",
    "errorRate": 0.002,
    "topVerbs": {"Sync": 28000, "Process": 15000, "Acknowledge": 5320},
}

_MOCK_GRC = {
    "configured": True,
    "controlCount": 47,
    "activeControlCount": 39,
    "openRisks": 8,
    "complianceScore": 83.0,
}
