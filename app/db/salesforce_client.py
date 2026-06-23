"""
Salesforce multi-API client.

Supports:
  • REST API   – sObjects, SOQL queries, Named Credentials
  • Metadata API – custom objects, fields, layouts, validation rules, flows
  • Tooling API  – Apex classes, test results, debug logs, code coverage
  • Bulk API v2  – job listing, data volume signals
  • Analytics    – reports, dashboards (Connect API)
  • Security     – users, profiles, permission sets, roles
  • Automation   – flows, process builder, workflow rules
  • Integrations – connected apps, named credentials, platform events

Authentication:
  username_password (with security_token) → SOAP /services/Soap/u/{version}
  username_password (with client_id/secret) → OAuth /services/oauth2/token
  oauth_client_credentials   → POST to /services/oauth2/token (client_credentials grant)
  connected_app_token        → caller supplies access_token directly
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

import requests

from app.models.salesforce_requests import SalesforceAuthMethod, SalesforceCredentials

logger = logging.getLogger(__name__)

_TIMEOUT = 30

_SOAP_BODY = """<?xml version="1.0" encoding="utf-8" ?>
<env:Envelope
        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"
        xmlns:urn="urn:partner.soap.sforce.com">
    <env:Header>
        <urn:CallOptions>
            <urn:client>assessment-tool</urn:client>
            <urn:defaultNamespace>sf</urn:defaultNamespace>
        </urn:CallOptions>
    </env:Header>
    <env:Body>
        <n1:login xmlns:n1="urn:partner.soap.sforce.com">
            <n1:username>{username}</n1:username>
            <n1:password>{password}</n1:password>
        </n1:login>
    </env:Body>
</env:Envelope>"""


def _xml_val(xml: str, tag: str) -> Optional[str]:
    m = re.search(rf"<{tag}>(.*?)</{tag}>", xml)
    return m.group(1) if m else None


class SalesforceClient:
    """Thin, multi-surface Salesforce API client."""

    def __init__(self, credentials: SalesforceCredentials) -> None:
        self.instance_url = (credentials.instance_url or "").rstrip("/")
        self.api_version  = credentials.api_version or "59.0"
        self._creds       = credentials
        self._token: Optional[str] = None
        self._session = requests.Session()
        self._session.headers.update({
            "Accept":       "application/json",
            "Content-Type": "application/json",
        })
        self._authenticate()

    # ── Authentication ────────────────────────────────────────────────────────

    def _soap_login(self, login_base: str) -> None:
        """SOAP partner API login — works without a Connected App consumer key."""
        soap_url = f"{login_base}/services/Soap/u/{self.api_version}"
        c = self._creds
        body = _SOAP_BODY.format(
            username=c.username,
            password=(c.password or "") + (c.security_token or ""),
        )
        resp = self._session.post(
            soap_url,
            data=body.encode("utf-8"),
            headers={
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction":   "login",
            },
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            exc_msg = _xml_val(resp.text, "sf:exceptionMessage") or resp.text
            raise RuntimeError(f"Salesforce SOAP login failed: {exc_msg}")

        session_id = _xml_val(resp.text, "sessionId")
        server_url = _xml_val(resp.text, "serverUrl")
        if not session_id or not server_url:
            exc_msg = _xml_val(resp.text, "sf:exceptionMessage") or resp.text[:300]
            raise RuntimeError(f"Salesforce SOAP login failed: {exc_msg}")

        self._token = session_id
        # serverUrl: https://<instance>/services/Soap/u/...  → extract base
        self.instance_url = "https://" + server_url.replace("https://", "").split("/")[0].replace("-api", "")

    def _authenticate(self) -> None:
        c = self._creds
        if c.auth_method == SalesforceAuthMethod.CONNECTED_APP_TOKEN:
            if not c.access_token:
                raise ValueError("access_token is required for connected_app_token auth.")
            if not self.instance_url:
                raise ValueError("instance_url is required for connected_app_token auth.")
            self._token = c.access_token
            return

        if c.auth_method == SalesforceAuthMethod.USERNAME_PASSWORD:
            if not c.username or not c.password:
                raise ValueError("username and password are required.")

            domain = (c.domain or "login").strip().lower()
            if domain == "login":
                login_base = "https://login.salesforce.com"
            elif domain == "test":
                login_base = "https://test.salesforce.com"
            else:
                login_base = f"https://{domain}.my.salesforce.com"

            # Prefer SOAP when a security_token is supplied — SOAP works without
            # a Connected App consumer key, which many orgs don't expose.
            # Fall back to OAuth only when client_id + client_secret are provided.
            if c.security_token and not c.client_id:
                self._soap_login(login_base)
                return

            token_url = f"{login_base}/services/oauth2/token"
            data: Dict = {
                "grant_type": "password",
                "username":   c.username,
                "password":   (c.password or "") + (c.security_token or ""),
            }
            if c.client_id:
                data["client_id"] = c.client_id
            if c.client_secret:
                data["client_secret"] = c.client_secret

        elif c.auth_method == SalesforceAuthMethod.OAUTH_CLIENT_CREDS:
            if not c.client_id or not c.client_secret:
                raise ValueError("client_id and client_secret are required.")
            if not self.instance_url:
                raise ValueError("instance_url is required for oauth_client_credentials auth.")
            token_url = f"{self.instance_url}/services/oauth2/token"
            data = {
                "grant_type":    "client_credentials",
                "client_id":     c.client_id,
                "client_secret": c.client_secret,
            }
        else:
            raise ValueError(f"Unsupported auth method: {c.auth_method}")

        # OAuth token endpoint requires application/x-www-form-urlencoded — override
        # the session-level Content-Type: application/json header explicitly.
        resp = self._session.post(
            token_url, data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_TIMEOUT,
        )
        if resp.status_code != 200:
            try:
                detail = resp.json().get("error_description") or resp.json().get("error") or resp.text
            except Exception:
                detail = resp.text
            raise RuntimeError(f"Salesforce OAuth failed: {detail}")

        payload = resp.json()
        self._token = payload.get("access_token")
        if payload.get("instance_url"):
            self.instance_url = payload["instance_url"].rstrip("/")

    def _auth_header(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    # ── Core HTTP helpers ─────────────────────────────────────────────────────

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        url  = f"{self.instance_url}{path}"
        resp = self._session.get(url, headers=self._auth_header(), params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: Dict) -> Any:
        url  = f"{self.instance_url}{path}"
        resp = self._session.post(url, headers=self._auth_header(), json=body, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def _soql(self, query: str) -> List[Dict]:
        """Execute a SOQL query and return all records (handles pagination)."""
        path    = f"/services/data/v{self.api_version}/query"
        result  = self._get(path, params={"q": query})
        records = result.get("records", [])
        next_url = result.get("nextRecordsUrl")
        while next_url:
            page = self._get(next_url)
            records.extend(page.get("records", []))
            next_url = page.get("nextRecordsUrl")
        return records

    def _tooling_get(self, path: str, params: Optional[Dict] = None) -> Any:
        return self._get(f"/services/data/v{self.api_version}/tooling{path}", params=params)

    def _tooling_soql(self, query: str) -> List[Dict]:
        result  = self._tooling_get("/query", params={"q": query})
        records = result.get("records", [])
        next_url = result.get("nextRecordsUrl")
        while next_url:
            page = self._get(next_url)
            records.extend(page.get("records", []))
            next_url = page.get("nextRecordsUrl")
        return records

    def _metadata_describe(self) -> Dict:
        return self._get(f"/services/data/v{self.api_version}/sobjects")

    # ── Connection test ───────────────────────────────────────────────────────

    def test_connection(self) -> Dict[str, Any]:
        """Quick connectivity + org identity check."""
        info = self._get(f"/services/data/v{self.api_version}/")
        org  = self.get_org_info()
        return {
            "api_version": self.api_version,
            "org_id":      org.get("Id"),
            "org_name":    org.get("Name"),
            "org_type":    org.get("OrganizationType"),
            "instance":    org.get("InstanceName"),
        }

    # ── REST API surface ──────────────────────────────────────────────────────

    def get_org_info(self) -> Dict:
        rows = self._soql(
            "SELECT Id, Name, OrganizationType, InstanceName, IsSandbox "
            "FROM Organization LIMIT 1"
        )
        return rows[0] if rows else {}

    def get_sobject_list(self) -> List[Dict]:
        """Return list of all sObjects (standard + custom)."""
        result = self._metadata_describe()
        return result.get("sobjects", [])

    def get_sobject_describe(self, api_name: str) -> Dict:
        return self._get(f"/services/data/v{self.api_version}/sobjects/{api_name}/describe")

    def get_named_credentials(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, PrincipalType, Protocol "
                "FROM NamedCredential LIMIT 200"
            )
        except Exception as exc:
            logger.warning("Named credentials query failed: %s", exc)
            return []

    # ── Metadata API surface ──────────────────────────────────────────────────

    def get_custom_objects(self) -> List[Dict]:
        """Custom objects from sObject list."""
        all_objs = self.get_sobject_list()
        return [o for o in all_objs if o.get("custom")]

    def get_standard_objects(self) -> List[Dict]:
        all_objs = self.get_sobject_list()
        return [o for o in all_objs if not o.get("custom") and o.get("queryable")]

    def get_custom_fields_for_object(self, api_name: str) -> List[Dict]:
        try:
            desc = self.get_sobject_describe(api_name)
            return [f for f in desc.get("fields", []) if f.get("custom")]
        except Exception as exc:
            logger.warning("Could not describe %s: %s", api_name, exc)
            return []

    def get_validation_rules(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, EntityDefinition.QualifiedApiName, ValidationName, Active "
                "FROM ValidationRule LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("Validation rule query failed: %s", exc)
            return []

    def get_record_types(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, SobjectType, Name, IsActive "
                "FROM RecordType LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("RecordType query failed: %s", exc)
            return []

    def get_page_layouts(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, EntityDefinitionId "
                "FROM Layout LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("Layout query failed: %s", exc)
            return []

    # ── Tooling API surface ───────────────────────────────────────────────────

    def get_apex_classes(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Status, IsValid, LengthWithoutComments, ApiVersion "
                "FROM ApexClass LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("ApexClass query failed: %s", exc)
            return []

    def get_apex_triggers(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, TableEnumOrId, Status, IsValid "
                "FROM ApexTrigger LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("ApexTrigger query failed: %s", exc)
            return []

    def get_apex_test_results(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT ApexClass.Name, Outcome, NumTestsRan, NumFailures "
                "FROM ApexTestRunResult ORDER BY CreatedDate DESC LIMIT 50"
            )
        except Exception as exc:
            logger.warning("ApexTestRunResult query failed: %s", exc)
            return []

    def get_code_coverage(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered "
                "FROM ApexCodeCoverage LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("Code coverage query failed: %s", exc)
            return []

    # ── Bulk API v2 surface ───────────────────────────────────────────────────

    def get_bulk_jobs(self) -> List[Dict]:
        try:
            result = self._get(f"/services/data/v{self.api_version}/jobs/ingest")
            return result.get("records", [])
        except Exception as exc:
            logger.warning("Bulk jobs query failed: %s", exc)
            return []

    def get_bulk_query_jobs(self) -> List[Dict]:
        try:
            result = self._get(f"/services/data/v{self.api_version}/jobs/query")
            return result.get("records", [])
        except Exception as exc:
            logger.warning("Bulk query jobs failed: %s", exc)
            return []

    # ── Analytics / Connect API surface ──────────────────────────────────────

    def get_reports(self) -> List[Dict]:
        try:
            result = self._get(f"/services/data/v{self.api_version}/analytics/reports")
            return result if isinstance(result, list) else []
        except Exception as exc:
            logger.warning("Reports query failed: %s", exc)
            return []

    def get_dashboards(self) -> List[Dict]:
        try:
            result = self._get(f"/services/data/v{self.api_version}/analytics/dashboards")
            return result if isinstance(result, list) else []
        except Exception as exc:
            logger.warning("Dashboards query failed: %s", exc)
            return []

    # ── Security surface ──────────────────────────────────────────────────────

    def get_users(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, Username, IsActive, Profile.Name, UserType, "
                "LastLoginDate, CreatedDate "
                "FROM User WHERE IsActive = true LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("User query failed: %s", exc)
            return []

    def get_inactive_users(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, Username, LastLoginDate "
                "FROM User WHERE IsActive = false LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("Inactive user query failed: %s", exc)
            return []

    def get_profiles(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, UserType, Description "
                "FROM Profile LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Profile query failed: %s", exc)
            return []

    def get_permission_sets(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, Label, IsCustom, Type "
                "FROM PermissionSet WHERE IsOwnedByProfile = false LIMIT 500"
            )
        except Exception as exc:
            logger.warning("PermissionSet query failed: %s", exc)
            return []

    def get_roles(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, DeveloperName, ParentRoleId "
                "FROM UserRole LIMIT 500"
            )
        except Exception as exc:
            logger.warning("UserRole query failed: %s", exc)
            return []

    def get_sharing_rules_count(self) -> int:
        try:
            result = self._soql(
                "SELECT COUNT() FROM SharingCriteriaRule LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    # ── Automation surface ────────────────────────────────────────────────────

    def get_flows(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, MasterLabel, ProcessType, Status, ApiVersion "
                "FROM Flow LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("Flow query failed: %s", exc)
            return []

    def get_workflow_rules(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, TableEnumOrId, IsActive "
                "FROM WorkflowRule LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("WorkflowRule query failed: %s", exc)
            return []

    def get_process_builders(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, MasterLabel, ProcessType, Status "
                "FROM Flow WHERE ProcessType = 'Workflow' LIMIT 500"
            )
        except Exception as exc:
            logger.warning("ProcessBuilder query failed: %s", exc)
            return []

    # ── Integration surface ───────────────────────────────────────────────────

    def get_connected_apps(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Description "
                "FROM ConnectedApplication LIMIT 200"
            )
        except Exception as exc:
            logger.warning("ConnectedApplication query failed: %s", exc)
            return []

    def get_platform_events(self) -> List[Dict]:
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("__e")]
        except Exception as exc:
            logger.warning("Platform event query failed: %s", exc)
            return []
