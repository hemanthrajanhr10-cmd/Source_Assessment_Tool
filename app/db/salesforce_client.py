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

    # ── Org limits ────────────────────────────────────────────────────────────

    def get_org_limits(self) -> Dict:
        """Return /limits/ — API call budgets, storage, etc."""
        try:
            return self._get(f"/services/data/v{self.api_version}/limits/")
        except Exception as exc:
            logger.warning("Org limits query failed: %s", exc)
            return {}

    # ── Licenses & packages ───────────────────────────────────────────────────

    def get_user_licenses(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, LicenseDefinitionKey, TotalLicenses, UsedLicenses "
                "FROM UserLicense ORDER BY UsedLicenses DESC LIMIT 100"
            )
        except Exception as exc:
            logger.warning("UserLicense query failed: %s", exc)
            return []

    def get_installed_packages(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix, "
                "SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion "
                "FROM InstalledSubscriberPackage LIMIT 200"
            )
        except Exception as exc:
            logger.warning("InstalledSubscriberPackage query failed: %s", exc)
            return []

    # ── Metadata model extensions ─────────────────────────────────────────────

    def get_custom_metadata_types(self) -> List[Dict]:
        """Custom metadata types — objects with __mdt suffix."""
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("__mdt")]
        except Exception as exc:
            logger.warning("Custom metadata types query failed: %s", exc)
            return []

    def get_custom_settings(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, Visibility "
                "FROM CustomObject WHERE CustomSettingsType != null LIMIT 200"
            )
        except Exception as exc:
            logger.warning("Custom settings query failed: %s", exc)
            return []

    def get_external_objects(self) -> List[Dict]:
        """External objects — __x suffix (Salesforce Connect)."""
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("__x")]
        except Exception as exc:
            logger.warning("External objects query failed: %s", exc)
            return []

    def get_change_data_capture_objects(self) -> List[Dict]:
        """Change Data Capture event objects — __ChangeEvent suffix."""
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("__ChangeEvent")]
        except Exception as exc:
            logger.warning("CDC objects query failed: %s", exc)
            return []

    # ── Automation extensions ─────────────────────────────────────────────────

    def get_all_flow_versions(self) -> List[Dict]:
        """All Flow versions (active + obsolete) for version-accumulation analysis."""
        try:
            return self._tooling_soql(
                "SELECT Id, MasterLabel, ProcessType, Status, VersionNumber, ApiVersion, "
                "TriggerType, TriggerObjectOrEventApiName "
                "FROM Flow ORDER BY MasterLabel, VersionNumber DESC LIMIT 5000"
            )
        except Exception as exc:
            logger.warning("Flow versions query failed: %s", exc)
            return []

    def get_duplicate_rules(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, IsActive, SobjectType "
                "FROM DuplicateRule LIMIT 200"
            )
        except Exception as exc:
            logger.warning("DuplicateRule query failed: %s", exc)
            return []

    def get_assignment_rules(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, SobjectType, Active "
                "FROM AssignmentRule LIMIT 200"
            )
        except Exception as exc:
            logger.warning("AssignmentRule query failed: %s", exc)
            return []

    # ── Operations ────────────────────────────────────────────────────────────

    def get_scheduled_jobs(self) -> List[Dict]:
        """Scheduled Apex jobs via CronTrigger."""
        try:
            return self._soql(
                "SELECT Id, JobType, CronJobDetail.Name, State, NextFireTime "
                "FROM CronTrigger LIMIT 200"
            )
        except Exception as exc:
            logger.warning("CronTrigger query failed: %s", exc)
            return []

    def get_queues(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, Type, Email "
                "FROM Group WHERE Type = 'Queue' LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Queue query failed: %s", exc)
            return []

    def get_email_services(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, FunctionName, IsActive "
                "FROM EmailServicesFunction LIMIT 200"
            )
        except Exception as exc:
            logger.warning("EmailServicesFunction query failed: %s", exc)
            return []

    # ── Security extensions ───────────────────────────────────────────────────

    def get_admin_users(self) -> List[Dict]:
        """Active users assigned System Administrator profile."""
        try:
            return self._soql(
                "SELECT Id, Name, Username, LastLoginDate "
                "FROM User WHERE Profile.Name = 'System Administrator' "
                "AND IsActive = true LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Admin user query failed: %s", exc)
            return []

    def get_login_policy(self) -> Dict:
        """Org password & lockout policy."""
        try:
            rows = self._soql(
                "SELECT Id, ComplexityRequirement, HistoryRestriction, LockoutInterval, "
                "MaxLoginAttempts, MinPasswordLength, ObscureSecretAnswer, PasswordExpiration "
                "FROM PasswordPolicy LIMIT 1"
            )
            return rows[0] if rows else {}
        except Exception as exc:
            logger.warning("PasswordPolicy query failed: %s", exc)
            return {}

    def get_org_settings(self) -> Dict:
        """Extended org settings including ChatterEnabled."""
        try:
            rows = self._soql(
                "SELECT Id, Name, OrganizationType, ChatterEnabled, IsSandbox, "
                "InstanceName, LanguageLocaleKey, DefaultLocaleSidKey, TimeZoneSidKey "
                "FROM Organization LIMIT 1"
            )
            return rows[0] if rows else {}
        except Exception as exc:
            logger.warning("Org settings query failed: %s", exc)
            return {}

    # ── Apex code analysis ────────────────────────────────────────────────────

    def get_apex_class_sizes(self) -> List[Dict]:
        """Apex classes ordered by size — for complexity analysis."""
        try:
            return self._tooling_soql(
                "SELECT Id, Name, LengthWithoutComments, ApiVersion, Status, IsValid "
                "FROM ApexClass ORDER BY LengthWithoutComments DESC LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("ApexClass sizes query failed: %s", exc)
            return []

    def get_async_apex_jobs(self) -> List[Dict]:
        """Recent async Apex job history (last 30 days) — Batch, Scheduled, Queueable."""
        try:
            return self._tooling_soql(
                "SELECT Id, JobType, Status, ApexClass.Name "
                "FROM AsyncApexJob "
                "WHERE CreatedDate = LAST_N_DAYS:30 "
                "ORDER BY CreatedDate DESC LIMIT 500"
            )
        except Exception as exc:
            logger.warning("AsyncApexJob query failed: %s", exc)
            return []

    # ════════════════════════════════════════════════════════════════════════════
    # EXTENDED METADATA — 110 additional extraction methods
    # ════════════════════════════════════════════════════════════════════════════

    # ── Group A: UI Components ────────────────────────────────────────────────

    def get_visualforce_pages(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, MasterLabel, ApiVersion, IsAvailableInTouch "
                "FROM ApexPage ORDER BY Name LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("ApexPage query failed: %s", exc)
            return []

    def get_visualforce_components(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, MasterLabel, ApiVersion "
                "FROM ApexComponent ORDER BY Name LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("ApexComponent query failed: %s", exc)
            return []

    def get_aura_components(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, MasterLabel, ApiVersion "
                "FROM AuraDefinitionBundle ORDER BY DeveloperName LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("AuraDefinitionBundle query failed: %s", exc)
            return []

    def get_lwc_bundles(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, MasterLabel, ApiVersion "
                "FROM LightningComponentBundle ORDER BY DeveloperName LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("LightningComponentBundle query failed: %s", exc)
            return []

    def get_static_resources(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, ContentType, BodyLength, CacheControl "
                "FROM StaticResource ORDER BY BodyLength DESC LIMIT 500"
            )
        except Exception as exc:
            logger.warning("StaticResource query failed: %s", exc)
            return []

    def get_email_templates(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, DeveloperName, TemplateType, IsActive, FolderId "
                "FROM EmailTemplate ORDER BY Name LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("EmailTemplate query failed: %s", exc)
            return []

    def get_lightning_pages(self) -> List[Dict]:
        """FlexiPage — Lightning Record/App/Home pages."""
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, MasterLabel, Type, EntityDefinitionId "
                "FROM FlexiPage ORDER BY Type, DeveloperName LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("FlexiPage query failed: %s", exc)
            return []

    def get_quick_actions(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Label, Type, SobjectType "
                "FROM QuickActionDefinition ORDER BY SobjectType LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("QuickActionDefinition query failed: %s", exc)
            return []

    def get_custom_tabs(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Label "
                "FROM CustomTab ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("CustomTab query failed: %s", exc)
            return []

    def get_app_menu_items(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, Label, IsVisible "
                "FROM AppMenuItem ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("AppMenuItem query failed: %s", exc)
            return []

    def get_list_views(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, SobjectType, IsSoqlCompatible "
                "FROM ListView ORDER BY SobjectType LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("ListView query failed: %s", exc)
            return []

    def get_global_value_sets(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, MasterLabel "
                "FROM GlobalValueSet ORDER BY DeveloperName LIMIT 500"
            )
        except Exception as exc:
            logger.warning("GlobalValueSet query failed: %s", exc)
            return []

    def get_custom_labels(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Category, Language "
                "FROM ExternalString ORDER BY Name LIMIT 5000"
            )
        except Exception as exc:
            logger.warning("ExternalString (CustomLabel) query failed: %s", exc)
            return []

    # ── Group B: Field Schema Analysis ────────────────────────────────────────

    def get_formula_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName, DataType "
                "FROM FieldDefinition WHERE DataType = 'Formula' LIMIT 5000"
            )
        except Exception as exc:
            logger.warning("Formula field query failed: %s", exc)
            return []

    def get_encrypted_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE IsEncrypted = true LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("Encrypted field query failed: %s", exc)
            return []

    def get_external_id_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName, IsUnique "
                "FROM FieldDefinition WHERE IsExternalId = true LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("External ID field query failed: %s", exc)
            return []

    def get_required_custom_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName, DataType "
                "FROM FieldDefinition WHERE IsNillable = false AND IsCustom = true LIMIT 5000"
            )
        except Exception as exc:
            logger.warning("Required custom field query failed: %s", exc)
            return []

    def get_unique_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE IsUnique = true AND IsCustom = true LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("Unique field query failed: %s", exc)
            return []

    def get_rollup_summary_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE DataType = 'Summary' LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("Rollup summary field query failed: %s", exc)
            return []

    def get_geolocation_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE DataType = 'Location' LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Geolocation field query failed: %s", exc)
            return []

    def get_big_objects(self) -> List[Dict]:
        """Big Objects (__b suffix)."""
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("__b")]
        except Exception as exc:
            logger.warning("Big object query failed: %s", exc)
            return []

    def get_field_sets(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, EntityDefinitionId "
                "FROM FieldSet ORDER BY DeveloperName LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("FieldSet query failed: %s", exc)
            return []

    # ── Group C: Security Deep Dive ───────────────────────────────────────────

    def get_permission_set_groups(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, DeveloperName, MasterLabel, Status "
                "FROM PermissionSetGroup ORDER BY DeveloperName LIMIT 500"
            )
        except Exception as exc:
            logger.warning("PermissionSetGroup query failed: %s", exc)
            return []

    def get_custom_permissions(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, MasterLabel, IsExposedToGuests "
                "FROM CustomPermission ORDER BY DeveloperName LIMIT 500"
            )
        except Exception as exc:
            logger.warning("CustomPermission query failed: %s", exc)
            return []

    def get_auth_providers(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, FriendlyName, ProviderType "
                "FROM AuthProvider ORDER BY ProviderType LIMIT 100"
            )
        except Exception as exc:
            logger.warning("AuthProvider query failed: %s", exc)
            return []

    def get_certificates(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, ExpirationDate, KeySize "
                "FROM Certificate ORDER BY ExpirationDate LIMIT 100"
            )
        except Exception as exc:
            logger.warning("Certificate query failed: %s", exc)
            return []

    def get_remote_site_settings(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, EndpointUrl, IsActive, Description "
                "FROM RemoteSiteSetting ORDER BY EndpointUrl LIMIT 500"
            )
        except Exception as exc:
            logger.warning("RemoteSiteSetting query failed: %s", exc)
            return []

    def get_cors_whitelist(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, UrlPattern "
                "FROM CorsWhitelistOrigin ORDER BY UrlPattern LIMIT 200"
            )
        except Exception as exc:
            logger.warning("CorsWhitelistOrigin query failed: %s", exc)
            return []

    def get_csp_trusted_sites(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, EndpointUrl, IsActive, Context "
                "FROM CspTrustedSite ORDER BY EndpointUrl LIMIT 200"
            )
        except Exception as exc:
            logger.warning("CspTrustedSite query failed: %s", exc)
            return []

    def get_mfa_user_count(self) -> int:
        try:
            result = self._soql(
                "SELECT COUNT() FROM UserAuthFactor "
                "WHERE Type IN ('TOTP', 'U2F', 'WEBAUTHN') LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_public_groups(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, DeveloperName, Type "
                "FROM Group WHERE Type = 'Regular' ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Public group query failed: %s", exc)
            return []

    def get_recent_login_history(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, UserId, Application, Browser, Platform, LoginType, Status "
                "FROM LoginHistory ORDER BY LoginTime DESC LIMIT 100"
            )
        except Exception as exc:
            logger.warning("LoginHistory query failed: %s", exc)
            return []

    def get_setup_audit_trail(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Action, Section, Display, CreatedDate "
                "FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 50"
            )
        except Exception as exc:
            logger.warning("SetupAuditTrail query failed: %s", exc)
            return []

    def get_trusted_ip_ranges(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT IpStartAddress, IpEndAddress "
                "FROM LoginIpRange ORDER BY IpStartAddress LIMIT 200"
            )
        except Exception as exc:
            logger.warning("LoginIpRange query failed: %s", exc)
            return []

    def get_external_credentials(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, Label, AuthenticationProtocol "
                "FROM ExternalCredential ORDER BY DeveloperName LIMIT 200"
            )
        except Exception as exc:
            logger.warning("ExternalCredential query failed: %s", exc)
            return []

    def get_object_permissions_with_modify_all(self) -> List[Dict]:
        """Object permissions granting Modify All Records (beyond profiles)."""
        try:
            return self._soql(
                "SELECT Parent.Name, SobjectType, PermissionsModifyAllRecords, PermissionsViewAllRecords "
                "FROM ObjectPermissions "
                "WHERE PermissionsModifyAllRecords = true AND Parent.IsOwnedByProfile = false "
                "ORDER BY SobjectType LIMIT 200"
            )
        except Exception as exc:
            logger.warning("ObjectPermissions (ModifyAll) query failed: %s", exc)
            return []

    # ── Group D: Automation Deep Dive ─────────────────────────────────────────

    def get_approval_processes(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, TableEnumOrId, State, Description "
                "FROM ProcessDefinition WHERE Type = 'Approval' ORDER BY TableEnumOrId LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Approval ProcessDefinition query failed: %s", exc)
            return []

    def get_email_alerts(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Description "
                "FROM WorkflowAlert ORDER BY Name LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("WorkflowAlert query failed: %s", exc)
            return []

    def get_workflow_field_updates(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, TableEnumOrId, FieldDefinitionId "
                "FROM WorkflowFieldUpdate ORDER BY TableEnumOrId LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("WorkflowFieldUpdate query failed: %s", exc)
            return []

    def get_outbound_messages(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, EndpointUrl "
                "FROM WorkflowOutboundMessage ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("WorkflowOutboundMessage query failed: %s", exc)
            return []

    def get_workflow_tasks(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Subject, Priority, Status "
                "FROM WorkflowTask ORDER BY Subject LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("WorkflowTask query failed: %s", exc)
            return []

    def get_time_triggers(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, TimeOffset, OffsetOrigin "
                "FROM WorkflowTimeTrigger LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("WorkflowTimeTrigger query failed: %s", exc)
            return []

    def get_macro_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM Macro LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_quick_text_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM QuickText LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_milestone_types(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, IsActive "
                "FROM MilestoneType ORDER BY Name LIMIT 100"
            )
        except Exception as exc:
            logger.warning("MilestoneType query failed: %s", exc)
            return []

    def get_entitlement_processes(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, IsActive, IsVersionDefault "
                "FROM EntitlementProcess ORDER BY Name LIMIT 100"
            )
        except Exception as exc:
            logger.warning("EntitlementProcess query failed: %s", exc)
            return []

    def get_escalation_rules(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, Name, Active "
                "FROM EscalationRule ORDER BY Name LIMIT 100"
            )
        except Exception as exc:
            logger.warning("EscalationRule query failed: %s", exc)
            return []

    # ── Group E: Integration Extended ─────────────────────────────────────────

    def get_external_services(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, Label "
                "FROM ExternalServiceRegistration ORDER BY DeveloperName LIMIT 200"
            )
        except Exception as exc:
            logger.warning("ExternalServiceRegistration query failed: %s", exc)
            return []

    def get_streaming_channels(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, IsDynamic "
                "FROM StreamingChannel ORDER BY Name LIMIT 200"
            )
        except Exception as exc:
            logger.warning("StreamingChannel query failed: %s", exc)
            return []

    def get_push_topics(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, ApiVersion, IsActive, Query "
                "FROM PushTopic ORDER BY Name LIMIT 200"
            )
        except Exception as exc:
            logger.warning("PushTopic query failed: %s", exc)
            return []

    def get_event_bus_members(self) -> List[Dict]:
        """Platform event channel subscriptions."""
        try:
            return self._tooling_soql(
                "SELECT Id, FilterFormula "
                "FROM PlatformEventChannelMember LIMIT 200"
            )
        except Exception as exc:
            logger.warning("PlatformEventChannelMember query failed: %s", exc)
            return []

    def get_email_services_addresses(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, LocalPart, EmailDomainName, IsActive "
                "FROM EmailServicesAddress ORDER BY LocalPart LIMIT 200"
            )
        except Exception as exc:
            logger.warning("EmailServicesAddress query failed: %s", exc)
            return []

    def get_connected_app_policies(self) -> List[Dict]:
        """Connected apps with OAuth policy details."""
        try:
            return self._tooling_soql(
                "SELECT Id, Name, RefreshTokenValidityPeriod "
                "FROM ConnectedApplication ORDER BY Name LIMIT 200"
            )
        except Exception as exc:
            logger.warning("ConnectedApplication policies query failed: %s", exc)
            return []

    def get_org_email_addresses(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Address, DisplayName, IsAllowAllProfiles "
                "FROM OrgEmailAddresses ORDER BY Address LIMIT 100"
            )
        except Exception as exc:
            logger.warning("OrgEmailAddresses query failed: %s", exc)
            return []

    def get_canvas_app_count(self) -> int:
        try:
            result = self._tooling_soql(
                "SELECT COUNT() FROM CanvasApplicationDetail LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_oauth_token_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM OauthToken LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_active_remote_site_count(self) -> int:
        try:
            result = self._tooling_soql(
                "SELECT COUNT() FROM RemoteSiteSetting WHERE IsActive = true LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    # ── Group F: Reporting Extended ───────────────────────────────────────────

    def get_report_types(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, DeveloperName, Label "
                "FROM ReportType ORDER BY Label LIMIT 500"
            )
        except Exception as exc:
            logger.warning("ReportType query failed: %s", exc)
            return []

    def get_report_folders(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, DeveloperName, AccessType "
                "FROM Folder WHERE Type = 'Report' ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Report folder query failed: %s", exc)
            return []

    def get_dashboard_folders(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, DeveloperName, AccessType "
                "FROM Folder WHERE Type = 'Dashboard' ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Dashboard folder query failed: %s", exc)
            return []

    def get_document_folders(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, DeveloperName "
                "FROM Folder WHERE Type = 'Document' ORDER BY Name LIMIT 500"
            )
        except Exception as exc:
            logger.warning("Document folder query failed: %s", exc)
            return []

    def get_dashboard_component_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM DashboardComponent LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_report_type_count(self) -> int:
        try:
            result = self._tooling_soql("SELECT COUNT() FROM ReportType LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_sharing_criteria_rule_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM SharingCriteriaRule LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_sharing_owner_rule_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM SharingOwnerRule LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    # ── Group G: Operations & Monitoring ──────────────────────────────────────

    def get_event_log_files(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, EventType, LogDate, LogFileLength "
                "FROM EventLogFile WHERE LogDate = LAST_N_DAYS:7 "
                "ORDER BY LogDate DESC LIMIT 200"
            )
        except Exception as exc:
            logger.warning("EventLogFile query failed: %s", exc)
            return []

    def get_apex_log_count(self) -> int:
        try:
            result = self._tooling_soql("SELECT COUNT() FROM ApexLog LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_apex_log_size_mb(self) -> float:
        try:
            result = self._tooling_soql(
                "SELECT SUM(LogLength) total FROM ApexLog LIMIT 1"
            )
            if result:
                total_b = result[0].get("total") or 0
                return round(total_b / 1024 / 1024, 2)
            return 0.0
        except Exception:
            return 0.0

    def get_flow_interview_errors(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, GUID, InterviewStatus "
                "FROM FlowInterview WHERE InterviewStatus = 'Error' LIMIT 200"
            )
        except Exception as exc:
            logger.warning("FlowInterview error query failed: %s", exc)
            return []

    def get_apex_job_failures_30d(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, JobType, Status, ExtendedStatus, ApexClass.Name "
                "FROM AsyncApexJob "
                "WHERE Status = 'Failed' AND CreatedDate = LAST_N_DAYS:30 LIMIT 100"
            )
        except Exception as exc:
            logger.warning("AsyncApexJob failures query failed: %s", exc)
            return []

    def get_batch_job_summary(self) -> List[Dict]:
        """Async Apex job counts grouped by type and status (last 30 days)."""
        try:
            return self._tooling_soql(
                "SELECT JobType, Status, COUNT(Id) cnt "
                "FROM AsyncApexJob WHERE CreatedDate = LAST_N_DAYS:30 "
                "GROUP BY JobType, Status LIMIT 50"
            )
        except Exception as exc:
            logger.warning("Batch job summary query failed: %s", exc)
            return []

    def get_api_event_log_summary(self) -> List[Dict]:
        """Event log files by event type (last 7 days)."""
        try:
            return self._soql(
                "SELECT EventType, COUNT(Id) cnt "
                "FROM EventLogFile WHERE LogDate = LAST_N_DAYS:7 "
                "GROUP BY EventType ORDER BY COUNT(Id) DESC LIMIT 25"
            )
        except Exception as exc:
            logger.warning("EventLogFile summary query failed: %s", exc)
            return []

    def get_governor_event_count(self) -> int:
        """Recent Apex execution event log count (proxy for governor limit exposure)."""
        try:
            result = self._soql(
                "SELECT COUNT() FROM EventLogFile "
                "WHERE EventType = 'ApexExecution' AND LogDate = LAST_N_DAYS:7 LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_debug_log_retention(self) -> List[Dict]:
        """Active debug log monitors (trace flags)."""
        try:
            return self._tooling_soql(
                "SELECT Id, LogType, DebugLevel.DeveloperName, ExpirationDate "
                "FROM TraceFlag ORDER BY ExpirationDate DESC LIMIT 50"
            )
        except Exception as exc:
            logger.warning("TraceFlag query failed: %s", exc)
            return []

    # ── Group H: Data Quality Extended ───────────────────────────────────────

    def get_picklist_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE DataType = 'Picklist' AND IsCustom = true LIMIT 5000"
            )
        except Exception as exc:
            logger.warning("Picklist field query failed: %s", exc)
            return []

    def get_multi_picklist_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE DataType = 'MultiselectPicklist' AND IsCustom = true LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("MultiselectPicklist field query failed: %s", exc)
            return []

    def get_large_text_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName, Length "
                "FROM FieldDefinition WHERE DataType IN ('LongTextArea', 'RichTextArea') LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("Large text area field query failed: %s", exc)
            return []

    def get_currency_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName "
                "FROM FieldDefinition WHERE DataType = 'Currency' AND IsCustom = true LIMIT 2000"
            )
        except Exception as exc:
            logger.warning("Currency field query failed: %s", exc)
            return []

    def get_lookup_fields(self) -> List[Dict]:
        try:
            return self._tooling_soql(
                "SELECT Id, QualifiedApiName, EntityDefinition.QualifiedApiName, RelationshipName "
                "FROM FieldDefinition WHERE DataType IN ('Lookup', 'MasterDetail', 'Hierarchy') LIMIT 5000"
            )
        except Exception as exc:
            logger.warning("Lookup/MasterDetail field query failed: %s", exc)
            return []

    def get_history_enabled_objects(self) -> List[Dict]:
        """sObjects with field history tracking (objects ending in 'History')."""
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("History") and not o.get("name", "").startswith("Feed")]
        except Exception as exc:
            logger.warning("History objects query failed: %s", exc)
            return []

    def get_feed_enabled_objects(self) -> List[Dict]:
        """sObjects with Chatter feed tracking (objects ending in 'Feed')."""
        try:
            all_objs = self.get_sobject_list()
            return [o for o in all_objs if o.get("name", "").endswith("Feed")]
        except Exception as exc:
            logger.warning("Feed objects query failed: %s", exc)
            return []

    def get_field_history_tracking_count(self) -> int:
        try:
            result = self._tooling_soql(
                "SELECT COUNT() FROM FieldDefinition WHERE IsAuditTrailEnabled = true LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_relationship_field_count(self) -> int:
        try:
            result = self._tooling_soql(
                "SELECT COUNT() FROM FieldDefinition "
                "WHERE DataType IN ('Lookup', 'MasterDetail') LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    # ── Group I: Experience Cloud & Collaboration ─────────────────────────────

    def get_experience_sites(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, Status, UrlPathPrefix, Type "
                "FROM Network ORDER BY Name LIMIT 50"
            )
        except Exception as exc:
            logger.warning("Network (Experience sites) query failed: %s", exc)
            return []

    def get_chatter_groups(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, MemberCount, CollaborationType, IsArchived "
                "FROM CollaborationGroup ORDER BY MemberCount DESC LIMIT 200"
            )
        except Exception as exc:
            logger.warning("CollaborationGroup query failed: %s", exc)
            return []

    def get_content_version_count(self) -> int:
        try:
            result = self._soql(
                "SELECT COUNT() FROM ContentVersion WHERE IsLatest = true LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_content_document_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM ContentDocument LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_knowledge_article_count(self) -> int:
        try:
            result = self._soql(
                "SELECT COUNT() FROM KnowledgeArticleVersion "
                "WHERE PublishStatus = 'Online' LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_topic_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM Topic LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_document_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM Document LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_public_group_member_count(self) -> int:
        try:
            result = self._soql("SELECT COUNT() FROM GroupMember LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    # ── Group J: Business Objects ─────────────────────────────────────────────

    def get_price_books(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, IsActive, IsStandard "
                "FROM Pricebook2 ORDER BY Name LIMIT 100"
            )
        except Exception as exc:
            logger.warning("Pricebook2 query failed: %s", exc)
            return []

    def get_active_products(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, ProductCode, IsActive, Family "
                "FROM Product2 WHERE IsActive = true ORDER BY Name LIMIT 1000"
            )
        except Exception as exc:
            logger.warning("Product2 query failed: %s", exc)
            return []

    def get_opportunity_stages(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, MasterLabel, IsActive, IsClosed, IsWon, Probability "
                "FROM OpportunityStage ORDER BY SortOrder LIMIT 50"
            )
        except Exception as exc:
            logger.warning("OpportunityStage query failed: %s", exc)
            return []

    def get_lead_statuses(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, MasterLabel, IsConverted, IsDefault "
                "FROM LeadStatus ORDER BY SortOrder LIMIT 50"
            )
        except Exception as exc:
            logger.warning("LeadStatus query failed: %s", exc)
            return []

    def get_case_statuses(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, MasterLabel, IsClosed, IsDefault "
                "FROM CaseStatus ORDER BY SortOrder LIMIT 50"
            )
        except Exception as exc:
            logger.warning("CaseStatus query failed: %s", exc)
            return []

    def get_sales_processes(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, IsActive, Description "
                "FROM SalesProcess ORDER BY Name LIMIT 50"
            )
        except Exception as exc:
            logger.warning("SalesProcess query failed: %s", exc)
            return []

    def get_fiscal_year_settings(self) -> Dict:
        try:
            rows = self._soql(
                "SELECT Id, IsStandardYear, StartMonth, FiscalYearNameScheme "
                "FROM FiscalYearSettings LIMIT 1"
            )
            return rows[0] if rows else {}
        except Exception as exc:
            logger.warning("FiscalYearSettings query failed: %s", exc)
            return {}

    def get_business_hours(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, IsActive, IsDefault, TimeZoneSidKey "
                "FROM BusinessHours ORDER BY Name LIMIT 50"
            )
        except Exception as exc:
            logger.warning("BusinessHours query failed: %s", exc)
            return []

    def get_holidays(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, Name, ActivityDate, IsRecurrence "
                "FROM Holiday ORDER BY ActivityDate LIMIT 100"
            )
        except Exception as exc:
            logger.warning("Holiday query failed: %s", exc)
            return []

    def get_territory_model_count(self) -> int:
        """Enterprise Territory Management (ETM) territory models."""
        try:
            result = self._soql("SELECT COUNT() FROM Territory2Model LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_forecasting_types(self) -> List[Dict]:
        try:
            return self._soql(
                "SELECT Id, DeveloperName, MasterLabel, IsActive "
                "FROM ForecastingType ORDER BY DeveloperName LIMIT 50"
            )
        except Exception as exc:
            logger.warning("ForecastingType query failed: %s", exc)
            return []

    def get_currency_settings(self) -> List[Dict]:
        """Multi-currency ISO codes and conversion rates."""
        try:
            return self._soql(
                "SELECT Id, IsoCode, IsActive, ConversionRate "
                "FROM CurrencyType WHERE IsActive = true ORDER BY IsoCode LIMIT 100"
            )
        except Exception as exc:
            logger.warning("CurrencyType query failed: %s", exc)
            return []

    # ── Group K: Compliance & Governance ──────────────────────────────────────

    def get_field_permissions_count(self) -> int:
        """Total field-level security assignments."""
        try:
            result = self._soql("SELECT COUNT() FROM FieldPermissions LIMIT 1")
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_risky_system_permissions(self) -> List[Dict]:
        """Permission sets with Modify All Data or View All Data (non-profile)."""
        try:
            return self._soql(
                "SELECT PermissionSet.Name, PermissionsModifyAllData, PermissionsViewAllData, "
                "PermissionsAuthorApex, PermissionsManageUsers "
                "FROM SetupEntityAccess "
                "WHERE SetupEntityType = 'PermissionSet' LIMIT 1"
            )
        except Exception:
            try:
                return self._soql(
                    "SELECT Id, Name, PermissionsModifyAllData, PermissionsViewAllData "
                    "FROM PermissionSet "
                    "WHERE PermissionsModifyAllData = true AND IsOwnedByProfile = false LIMIT 200"
                )
            except Exception as exc:
                logger.warning("Risky permission sets query failed: %s", exc)
                return []

    def get_language_settings(self) -> List[Dict]:
        """Translation Workbench enabled languages."""
        try:
            return self._soql(
                "SELECT Id, Language, UserLanguage, IsActive "
                "FROM TranslationLanguageSettings WHERE IsActive = true ORDER BY Language LIMIT 50"
            )
        except Exception as exc:
            logger.warning("TranslationLanguageSettings query failed: %s", exc)
            return []

    def get_data_classification_count(self) -> int:
        """Fields with Data Classification / Sensitivity labels."""
        try:
            result = self._tooling_soql(
                "SELECT COUNT() FROM FieldDefinition "
                "WHERE SecurityClassification != null LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0

    def get_expired_certificates(self) -> List[Dict]:
        """Certificates expiring within 90 days or already expired."""
        from datetime import datetime, timedelta, timezone as tz
        cutoff = (datetime.now(tz.utc) + timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            return self._soql(
                f"SELECT Id, Name, ExpirationDate, KeySize "
                f"FROM Certificate WHERE ExpirationDate <= {cutoff} ORDER BY ExpirationDate LIMIT 100"
            )
        except Exception as exc:
            logger.warning("Expired certificate query failed: %s", exc)
            return []

    def get_sharing_settings_summary(self) -> Dict:
        """Sharing rule counts (criteria-based + owner-based)."""
        criteria_count = self.get_sharing_criteria_rule_count()
        owner_count    = self.get_sharing_owner_rule_count()
        return {
            "criteria_based_count": criteria_count,
            "owner_based_count":    owner_count,
            "total":                criteria_count + owner_count,
        }

    def get_login_flow_count(self) -> int:
        """Login Flow count — authentication policy flows."""
        try:
            result = self._tooling_soql(
                "SELECT COUNT() FROM LoginFlow LIMIT 1"
            )
            return result[0].get("expr0", 0) if result else 0
        except Exception:
            return 0
