"""
Databricks Workspace REST API client.

Auth: Personal Access Token (PAT) passed as Bearer token.
Base URL: the workspace host (e.g. https://adb-xxx.azuredatabricks.net).
API versions: 2.0, 2.1, 2.2 — all workspace-level.
"""

from typing import Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.core.logging import get_logger

logger = get_logger(__name__)

_TIMEOUT = 30  # seconds per request


class DatabricksClient:
    """Thin wrapper around the Databricks Workspace REST API."""

    def __init__(self, workspace_url: str, access_token: str) -> None:
        # Normalise: strip trailing slash
        self.base_url = workspace_url.rstrip("/")
        self._token = access_token
        self._session = self._build_session()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _build_session(self) -> requests.Session:
        s = requests.Session()
        s.headers.update({
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        })
        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        s.mount("https://", HTTPAdapter(max_retries=retry))
        s.mount("http://",  HTTPAdapter(max_retries=retry))
        return s

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        resp = self._session.get(url, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        resp = self._session.post(url, json=body or {}, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()

    # ── Workspace / Auth ──────────────────────────────────────────────────────

    def get_workspace_config(self) -> dict:
        """GET /api/2.0/workspace-conf — key workspace settings."""
        try:
            return self._get("/api/2.0/workspace-conf", params={
                "keys": "enableIpAccessLists,enableTokensConfig,enforceWorkspaceConfiguration"
            })
        except Exception:
            return {}

    def get_current_user(self) -> dict:
        """GET /api/2.0/preview/scim/v2/Me — caller identity."""
        return self._get("/api/2.0/preview/scim/v2/Me")

    # ── Clusters ──────────────────────────────────────────────────────────────

    def list_clusters(self) -> list[dict]:
        """GET /api/2.1/clusters/list — all clusters."""
        data = self._get("/api/2.1/clusters/list")
        return data.get("clusters", [])

    def list_cluster_policies(self) -> list[dict]:
        """GET /api/2.0/policies/clusters/list."""
        try:
            data = self._get("/api/2.0/policies/clusters/list")
            return data.get("policies", [])
        except Exception:
            return []

    def list_instance_pools(self) -> list[dict]:
        """GET /api/2.0/instance-pools/list."""
        try:
            data = self._get("/api/2.0/instance-pools/list")
            return data.get("instance_pools", [])
        except Exception:
            return []

    # ── SQL Warehouses ────────────────────────────────────────────────────────

    def list_warehouses(self) -> list[dict]:
        """GET /api/2.0/sql/warehouses."""
        data = self._get("/api/2.0/sql/warehouses")
        return data.get("warehouses", [])

    # ── Jobs ──────────────────────────────────────────────────────────────────

    def list_jobs(self, expand_tasks: bool = True) -> list[dict]:
        """GET /api/2.1/jobs/list — paginated; collects all pages."""
        jobs: list[dict] = []
        params: dict = {"limit": 100, "expand_tasks": str(expand_tasks).lower()}
        while True:
            data = self._get("/api/2.1/jobs/list", params=params)
            jobs.extend(data.get("jobs", []))
            if not data.get("has_more") or not data.get("next_page_token"):
                break
            params["page_token"] = data["next_page_token"]
        return jobs

    def list_job_runs(self, active_only: bool = True) -> list[dict]:
        """GET /api/2.1/jobs/runs/list — only recent active runs."""
        try:
            data = self._get("/api/2.1/jobs/runs/list", params={
                "active_only": str(active_only).lower(),
                "limit": 25,
            })
            return data.get("runs", [])
        except Exception:
            return []

    # ── Delta Live Tables ─────────────────────────────────────────────────────

    def list_pipelines(self) -> list[dict]:
        """GET /api/2.0/pipelines."""
        try:
            data = self._get("/api/2.0/pipelines")
            return data.get("statuses", [])
        except Exception:
            return []

    # ── Unity Catalog ─────────────────────────────────────────────────────────

    def get_metastore_summary(self) -> dict:
        """GET /api/2.1/unity-catalog/metastore_summary."""
        try:
            return self._get("/api/2.1/unity-catalog/metastore_summary")
        except Exception:
            return {}

    def list_catalogs(self) -> list[dict]:
        """GET /api/2.1/unity-catalog/catalogs."""
        try:
            data = self._get("/api/2.1/unity-catalog/catalogs")
            return data.get("catalogs", [])
        except Exception:
            return []

    def list_schemas(self, catalog_name: str) -> list[dict]:
        """GET /api/2.1/unity-catalog/schemas?catalog_name=..."""
        try:
            data = self._get(
                "/api/2.1/unity-catalog/schemas",
                params={"catalog_name": catalog_name},
            )
            return data.get("schemas", [])
        except Exception:
            return []

    def list_tables(self, catalog_name: str, schema_name: str, max_results: int = 200) -> list[dict]:
        """GET /api/2.1/unity-catalog/tables — limited to avoid overload."""
        try:
            data = self._get(
                "/api/2.1/unity-catalog/tables",
                params={
                    "catalog_name": catalog_name,
                    "schema_name": schema_name,
                    "max_results": max_results,
                },
            )
            return data.get("tables", [])
        except Exception:
            return []

    def list_external_locations(self) -> list[dict]:
        """GET /api/2.1/unity-catalog/external-locations."""
        try:
            data = self._get("/api/2.1/unity-catalog/external-locations")
            return data.get("external_locations", [])
        except Exception:
            return []

    def list_storage_credentials(self) -> list[dict]:
        """GET /api/2.1/unity-catalog/storage-credentials."""
        try:
            data = self._get("/api/2.1/unity-catalog/storage-credentials")
            return data.get("storage_credentials", [])
        except Exception:
            return []

    def list_volumes(self, catalog_name: str, schema_name: str) -> list[dict]:
        """GET /api/2.1/unity-catalog/volumes."""
        try:
            data = self._get(
                "/api/2.1/unity-catalog/volumes",
                params={"catalog_name": catalog_name, "schema_name": schema_name},
            )
            return data.get("volumes", [])
        except Exception:
            return []

    def list_delta_sharing_recipients(self) -> list[dict]:
        """GET /api/2.1/unity-catalog/recipients."""
        try:
            data = self._get("/api/2.1/unity-catalog/recipients")
            return data.get("recipients", [])
        except Exception:
            return []

    # ── Users / Identity (SCIM) ───────────────────────────────────────────────

    def list_users(self, max_results: int = 1000) -> list[dict]:
        """GET /api/2.0/preview/scim/v2/Users."""
        try:
            data = self._get(
                "/api/2.0/preview/scim/v2/Users",
                params={"count": max_results, "startIndex": 1},
            )
            return data.get("Resources", [])
        except Exception:
            return []

    def list_groups(self) -> list[dict]:
        """GET /api/2.0/preview/scim/v2/Groups."""
        try:
            data = self._get(
                "/api/2.0/preview/scim/v2/Groups",
                params={"count": 500, "startIndex": 1},
            )
            return data.get("Resources", [])
        except Exception:
            return []

    def list_service_principals(self) -> list[dict]:
        """GET /api/2.0/preview/scim/v2/ServicePrincipals."""
        try:
            data = self._get(
                "/api/2.0/preview/scim/v2/ServicePrincipals",
                params={"count": 500, "startIndex": 1},
            )
            return data.get("Resources", [])
        except Exception:
            return []

    # ── Security ──────────────────────────────────────────────────────────────

    def list_tokens(self) -> list[dict]:
        """GET /api/2.0/token/list — PAT inventory."""
        try:
            data = self._get("/api/2.0/token/list")
            return data.get("token_infos", [])
        except Exception:
            return []

    def get_token_management_config(self) -> dict:
        """GET /api/2.0/token-management/settings."""
        try:
            return self._get("/api/2.0/token-management/settings")
        except Exception:
            return {}

    def list_ip_access_lists(self) -> list[dict]:
        """GET /api/2.0/ip-access-lists."""
        try:
            data = self._get("/api/2.0/ip-access-lists")
            return data.get("ip_access_lists", [])
        except Exception:
            return []

    def list_secret_scopes(self) -> list[dict]:
        """GET /api/2.0/secrets/scopes/list."""
        try:
            data = self._get("/api/2.0/secrets/scopes/list")
            return data.get("scopes", [])
        except Exception:
            return []

    # ── Integrations / Repos ──────────────────────────────────────────────────

    def list_git_credentials(self) -> list[dict]:
        """GET /api/2.0/git-credentials."""
        try:
            data = self._get("/api/2.0/git-credentials")
            return data.get("credentials", [])
        except Exception:
            return []

    def list_repos(self) -> list[dict]:
        """GET /api/2.0/repos."""
        try:
            data = self._get("/api/2.0/repos")
            return data.get("repos", [])
        except Exception:
            return []

    # ── MLflow / Model Serving ────────────────────────────────────────────────

    def list_mlflow_experiments(self, max_results: int = 200) -> list[dict]:
        """GET /api/2.0/mlflow/experiments/search."""
        try:
            data = self._post("/api/2.0/mlflow/experiments/search", {
                "max_results": max_results,
            })
            return data.get("experiments", [])
        except Exception:
            return []

    def list_registered_models(self, max_results: int = 200) -> list[dict]:
        """GET /api/2.0/mlflow/registered-models/list."""
        try:
            data = self._get("/api/2.0/mlflow/registered-models/list", params={
                "max_results": max_results,
            })
            return data.get("registered_models", [])
        except Exception:
            return []

    def list_serving_endpoints(self) -> list[dict]:
        """GET /api/2.0/serving-endpoints."""
        try:
            data = self._get("/api/2.0/serving-endpoints")
            return data.get("endpoints", [])
        except Exception:
            return []

    def list_vector_search_indexes(self) -> list[dict]:
        """GET /api/2.0/vector-search/indexes."""
        try:
            data = self._get("/api/2.0/vector-search/indexes", params={"page_size": 100})
            return data.get("vector_index", [])
        except Exception:
            return []

    # ── DBFS (legacy pattern detection) ──────────────────────────────────────

    def list_dbfs_mounts(self) -> list[dict]:
        """GET /api/2.0/dbfs/list?path=/mnt — detect legacy DBFS mounts."""
        try:
            data = self._get("/api/2.0/dbfs/list", params={"path": "/mnt"})
            return data.get("files", [])
        except Exception:
            return []
