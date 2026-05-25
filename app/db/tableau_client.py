"""
Tableau REST API client using tableauserverclient (TSC).

Supports:
  - Tableau Server (on-prem)
  - Tableau Cloud (formerly Tableau Online)
  - Auth: Personal Access Token (PAT) or Username/Password
"""

from __future__ import annotations

import logging
from typing import Optional

log = logging.getLogger(__name__)

try:
    import tableauserverclient as TSC
    _TSC_AVAILABLE = True
except ImportError:
    _TSC_AVAILABLE = False
    log.warning("tableauserverclient not installed — Tableau assessment unavailable")


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _build_auth(
    server_url: str,
    site_name: str,
    username: Optional[str],
    password: Optional[str],
    token_name: Optional[str],
    token_secret: Optional[str],
):
    """Return (TSC.Server, TSC.TableauAuth) based on available credentials."""
    if not _TSC_AVAILABLE:
        raise RuntimeError("tableauserverclient is not installed. Run: pip install tableauserverclient")

    server = TSC.Server(server_url, use_server_version=True)
    server.add_http_options({"verify": False})  # allow self-signed certs on-prem

    if token_name and token_secret:
        auth = TSC.PersonalAccessTokenAuth(
            token_name=token_name,
            personal_access_token=token_secret,
            site_id=site_name or "",
        )
    elif username and password:
        auth = TSC.TableauAuth(
            username=username,
            password=password,
            site_id=site_name or "",
        )
    else:
        raise ValueError("Provide either (token_name + token_secret) or (username + password).")

    return server, auth


# ── Connection test ───────────────────────────────────────────────────────────

def test_connection(
    server_url: str,
    site_name: Optional[str],
    username: Optional[str],
    password: Optional[str],
    token_name: Optional[str],
    token_secret: Optional[str],
) -> dict:
    """
    Sign in and return basic server/site info.
    Returns: {success, message, server_version?, site_name?, site_id?}
    """
    try:
        server, auth = _build_auth(server_url, site_name or "", username, password, token_name, token_secret)
        with server.auth.sign_in(auth):
            version = server.version
            site = server.site_id
            return {
                "success": True,
                "message": f"Connected to Tableau Server {version} — site: {site or 'Default'}",
                "server_version": version,
                "site_id": site,
            }
    except Exception as exc:
        log.warning("Tableau connection test failed: %s", exc)
        return {"success": False, "message": str(exc)}


# ── Enumeration helpers ───────────────────────────────────────────────────────

def get_server_info(server) -> dict:
    """Return minimal server metadata while signed in."""
    return {
        "server_version": server.version,
        "site_id": server.site_id,
        "baseurl": server.baseurl,
    }


def list_workbooks(server) -> list[dict]:
    all_wbs, _ = server.workbooks.get()
    result = []
    for wb in all_wbs:
        result.append({
            "id": wb.id,
            "name": wb.name,
            "project_name": getattr(wb, "project_name", "") or "",
            "owner_name": getattr(wb, "owner_name", "") or "",
            "created_at": str(wb.created_at) if wb.created_at else None,
            "updated_at": str(wb.updated_at) if wb.updated_at else None,
            "show_tabs": bool(wb.show_tabs),
            "tag_count": len(wb.tags) if wb.tags else 0,
            "size_mb": getattr(wb, "size", 0) or 0,
        })
    return result


def list_views(server) -> list[dict]:
    all_views, _ = server.views.get()
    result = []
    for v in all_views:
        result.append({
            "id": v.id,
            "name": v.name,
            "workbook_name": getattr(v, "workbook_name", "") or "",
            "owner_name": getattr(v, "owner_name", "") or "",
            "view_type": getattr(v, "view_type", "sheet") or "sheet",
            "total_views": getattr(v, "total_views", 0) or 0,
        })
    return result


def list_datasources(server) -> list[dict]:
    all_ds, _ = server.datasources.get()
    result = []
    for ds in all_ds:
        result.append({
            "id": ds.id,
            "name": ds.name,
            "project_name": getattr(ds, "project_name", "") or "",
            "owner_name": getattr(ds, "owner_name", "") or "",
            "datasource_type": getattr(ds, "datasource_type", "") or "",
            "content_url": getattr(ds, "content_url", "") or "",
            "created_at": str(ds.created_at) if ds.created_at else None,
            "updated_at": str(ds.updated_at) if ds.updated_at else None,
            "is_certified": bool(getattr(ds, "is_certified", False)),
            "is_published": True,
            "size_mb": getattr(ds, "size", 0) or 0,
            "connection_type": getattr(ds, "datasource_type", "unknown") or "unknown",
            "has_extracts": bool(getattr(ds, "has_extracts", False)),
            "tag_count": len(ds.tags) if ds.tags else 0,
        })
    return result


def list_users(server) -> list[dict]:
    all_users, _ = server.users.get()
    result = []
    for u in all_users:
        result.append({
            "id": u.id,
            "name": u.name,
            "email": getattr(u, "email", "") or "",
            "role": getattr(u, "role", "") or "",
            "auth_setting": getattr(u, "auth_setting", "") or "",
            "last_login": str(u.last_login) if getattr(u, "last_login", None) else None,
            "site_role": getattr(u, "site_role", "") or "",
        })
    return result


def list_groups(server) -> list[dict]:
    all_groups, _ = server.groups.get()
    result = []
    for g in all_groups:
        member_count = 0
        try:
            members, _ = server.groups.populate_users(g)
            member_count = len(members) if members else 0
        except Exception:
            pass
        result.append({
            "id": g.id,
            "name": g.name,
            "domain_name": getattr(g, "domain_name", None),
            "member_count": member_count,
        })
    return result


def list_projects(server) -> list[dict]:
    all_projects, _ = server.projects.get()
    result = []
    for p in all_projects:
        result.append({
            "id": p.id,
            "name": p.name,
            "description": getattr(p, "description", None),
            "content_permissions": getattr(p, "content_permissions", "ManagedByOwner") or "ManagedByOwner",
        })
    return result


def list_flows(server) -> list[dict]:
    try:
        all_flows, _ = server.flows.get()
        result = []
        for f in all_flows:
            result.append({
                "id": f.id,
                "name": f.name,
                "project_name": getattr(f, "project_name", "") or "",
                "owner_name": getattr(f, "owner_name", "") or "",
                "created_at": str(f.created_at) if getattr(f, "created_at", None) else None,
                "updated_at": str(f.updated_at) if getattr(f, "updated_at", None) else None,
            })
        return result
    except Exception as exc:
        log.warning("Flows enumeration failed (may not be supported on this server): %s", exc)
        return []


def list_schedules(server) -> list[dict]:
    try:
        all_schedules, _ = server.schedules.get()
        result = []
        for s in all_schedules:
            result.append({
                "id": s.id,
                "name": s.name,
                "schedule_type": getattr(s, "schedule_type", "") or "",
                "state": getattr(s, "state", "") or "",
                "priority": getattr(s, "priority", 0) or 0,
                "execution_order": getattr(s, "execution_order", "") or "",
            })
        return result
    except Exception as exc:
        log.warning("Schedules enumeration failed: %s", exc)
        return []


def list_jobs(server) -> list[dict]:
    """List recent background jobs (extract refreshes etc.)."""
    try:
        all_jobs, _ = server.jobs.get()
        result = []
        for j in all_jobs:
            result.append({
                "id": j.id,
                "type": getattr(j, "type", "") or "",
                "status": getattr(j, "status", "") or "",
                "priority": getattr(j, "priority", 0) or 0,
                "workbook_name": None,
                "datasource_name": None,
                "created_at": str(j.created_at) if getattr(j, "created_at", None) else None,
                "completed_at": str(j.completed_at) if getattr(j, "completed_at", None) else None,
            })
        return result
    except Exception as exc:
        log.warning("Jobs enumeration failed: %s", exc)
        return []


def get_workbook_permissions(server, workbook_id: str) -> list[dict]:
    """Get permissions for a single workbook."""
    try:
        wb = TSC.WorkbookItem(project_id="")
        wb._id = workbook_id
        server.workbooks.populate_permissions(wb)
        result = []
        for rule in wb.permissions:
            grantee = rule.grantee
            for cap_name, cap_mode in rule.capabilities.items():
                result.append({
                    "grantee_name": getattr(grantee, "name", str(grantee.id)),
                    "grantee_type": rule.grantee_type,
                    "capability_name": cap_name,
                    "capability_mode": cap_mode,
                })
        return result
    except Exception as exc:
        log.warning("Permission fetch for workbook %s failed: %s", workbook_id, exc)
        return []
