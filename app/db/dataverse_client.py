"""
Dataverse Web API HTTP client using MSAL for authentication.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import msal
import requests

from app.models.dataverse_requests import DataverseAuthMethod, DataverseCredentials

logger = logging.getLogger(__name__)

_API_VERSION = "v9.2"
_SCOPE_SUFFIX = "/.default"
_TIMEOUT = 30  # seconds per request


class DataverseClient:
    """Thin wrapper around the Dataverse Web API (OData v4)."""

    def __init__(self, credentials: DataverseCredentials) -> None:
        self.env_url  = credentials.environment_url.rstrip("/")
        self.base_url = f"{self.env_url}/api/data/{_API_VERSION}"
        self._creds   = credentials
        self._token: Optional[str] = None
        self._session = requests.Session()
        self._session.headers.update({
            "Accept":          "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version":    "4.0",
            "Content-Type":    "application/json",
        })

    # ── Token acquisition ─────────────────────────────────────────────────────

    def _acquire_token(self) -> str:
        creds = self._creds
        scope = f"{self.env_url}{_SCOPE_SUFFIX}"

        if creds.auth_method == DataverseAuthMethod.CLIENT_CREDENTIALS:
            msal_app = msal.ConfidentialClientApplication(
                client_id=creds.client_id,
                authority=f"https://login.microsoftonline.com/{creds.tenant_id}",
                client_credential=creds.client_secret,
            )
            result = msal_app.acquire_token_for_client(scopes=[scope])

        elif creds.auth_method == DataverseAuthMethod.USERNAME_PASSWORD:
            msal_app = msal.PublicClientApplication(
                client_id=creds.client_id,
                authority=f"https://login.microsoftonline.com/{creds.tenant_id}",
            )
            result = msal_app.acquire_token_by_username_password(
                username=creds.username,
                password=creds.password,
                scopes=[scope],
            )

        else:
            raise ValueError(f"Unsupported auth method: {creds.auth_method}")

        if "access_token" not in result:
            error_desc = result.get("error_description") or result.get("error") or "Unknown auth error"
            raise RuntimeError(f"Token acquisition failed: {error_desc}")

        return result["access_token"]

    def _get_token(self) -> str:
        if not self._token:
            self._token = self._acquire_token()
        return self._token

    def _auth_header(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self._get_token()}"}

    # ── Core HTTP helpers ─────────────────────────────────────────────────────

    def get(self, path: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        resp = self._session.get(url, headers=self._auth_header(), params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def get_value(self, path: str, params: Optional[Dict] = None) -> List[Dict]:
        """Return the 'value' array from a single OData page."""
        return self.get(path, params).get("value", [])

    def get_all(self, path: str, params: Optional[Dict] = None, max_pages: int = 10) -> List[Dict]:
        """Follow @odata.nextLink to collect all pages."""
        results: List[Dict] = []
        url: Optional[str] = f"{self.base_url}/{path.lstrip('/')}"
        page = 0
        while url and page < max_pages:
            resp = self._session.get(
                url,
                headers=self._auth_header(),
                params=params if page == 0 else None,
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            results.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
            page += 1
        return results

    def get_count(self, path: str, params: Optional[Dict] = None) -> int:
        """Return the odata count for a collection."""
        p: Dict = {"$count": "true", "$top": "1"}
        if params:
            p.update(params)
        url = f"{self.base_url}/{path.lstrip('/')}"
        resp = self._session.get(url, headers=self._auth_header(), params=p, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return data.get("@odata.count", len(data.get("value", [])))

    # ── Connection test ───────────────────────────────────────────────────────

    def test_connection(self) -> Dict[str, Any]:
        """Verify token + reachability; returns org metadata."""
        orgs = self.get_value(
            "organizations",
            {"$select": "name,version,languagecode,uniquename,url,isauditenabled,isdisabled"},
        )
        return orgs[0] if orgs else {}
