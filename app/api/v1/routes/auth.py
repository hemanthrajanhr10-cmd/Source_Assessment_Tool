"""
Auth routes.

POST /api/v1/auth/register                     — create account
POST /api/v1/auth/login                        — email + password → JWT (or MFA challenge)
POST /api/v1/auth/verify-mfa                   — submit TOTP code → JWT
POST /api/v1/auth/setup-mfa                    — generate TOTP secret + QR URI
POST /api/v1/auth/confirm-mfa                  — verify code and enable MFA
GET  /api/v1/auth/me                           — current user profile
GET  /api/v1/auth/oauth/microsoft              — start Microsoft OAuth flow
GET  /api/v1/auth/oauth/microsoft/callback     — Microsoft OAuth callback
GET  /api/v1/auth/oauth/google                 — start Google OAuth flow
GET  /api/v1/auth/oauth/google/callback        — Google OAuth callback
"""

import base64
import io
import urllib.parse
from typing import Optional

import qrcode
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.core.auth import (
    create_access_token,
    generate_mfa_secret,
    get_totp_uri,
    hash_password,
    new_user_id,
    verify_password,
    verify_totp,
)
from app.core.dependencies import get_current_user
from app.db import azure_store

router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyMFARequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class ConfirmMFARequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    mfa_required: bool = False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest):
    existing = azure_store.get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user_id = new_user_id()
    password_hash = hash_password(body.password)
    azure_store.create_user(user_id, body.email, body.full_name, password_hash)

    token = create_access_token(user_id, body.email)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    user = azure_store.get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account is disabled.")

    # If MFA is enabled, return a challenge — no token yet
    if user.get("mfa_enabled"):
        return TokenResponse(access_token="", mfa_required=True)

    token = create_access_token(user["user_id"], user["email"])
    return TokenResponse(access_token=token)


@router.post("/verify-mfa", response_model=TokenResponse)
async def verify_mfa(body: VerifyMFARequest):
    user = azure_store.get_user_by_email(body.email)
    if not user or not user.get("mfa_enabled") or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA not set up for this account.")

    if not verify_totp(user["mfa_secret"], body.code):
        raise HTTPException(status_code=401, detail="Invalid MFA code. Please try again.")

    token = create_access_token(user["user_id"], user["email"])
    return TokenResponse(access_token=token)


@router.post("/setup-mfa")
async def setup_mfa(current_user: dict = Depends(get_current_user)):
    """Generate a new MFA secret and return a QR code URI (MFA not enabled yet)."""
    secret = generate_mfa_secret()
    uri = get_totp_uri(secret, current_user["email"])

    # Generate QR code as base64 PNG
    qr = qrcode.make(uri)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    # Save secret but don't enable yet (user must confirm with a valid code first)
    azure_store.set_user_mfa(current_user["user_id"], secret, enabled=False)

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_b64}",
        "uri": uri,
    }


@router.post("/confirm-mfa")
async def confirm_mfa(body: ConfirmMFARequest, current_user: dict = Depends(get_current_user)):
    """Verify the TOTP code and enable MFA on the account."""
    user = azure_store.get_user_by_id(current_user["user_id"])
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="Run /setup-mfa first.")

    if not verify_totp(user["mfa_secret"], body.code):
        raise HTTPException(status_code=401, detail="Invalid code — check your authenticator app.")

    azure_store.set_user_mfa(current_user["user_id"], user["mfa_secret"], enabled=True)
    return {"ok": True, "message": "MFA enabled successfully."}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {
        "user_id": current_user["user_id"],
        "email": current_user["email"],
        "full_name": current_user.get("full_name"),
        "mfa_enabled": bool(current_user.get("mfa_enabled")),
        "created_at": str(current_user.get("created_at", "")),
    }


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def _oauth_upsert_user(email: str, full_name: Optional[str]) -> dict:
    """Find or create an OAuth user (no password). Returns user dict."""
    user = azure_store.get_user_by_email(email)
    if not user:
        user_id = new_user_id()
        # password_hash = "" marks this as an OAuth-only account
        azure_store.create_user(user_id, email, full_name, "")
        user = azure_store.get_user_by_id(user_id)
    return user


def _oauth_error_redirect(reason: str) -> RedirectResponse:
    fe = settings.frontend_url.rstrip("/")
    return RedirectResponse(f"{fe}/login?oauth_error={urllib.parse.quote(reason)}")


# ── Microsoft OAuth ───────────────────────────────────────────────────────────

@router.get("/oauth/microsoft", include_in_schema=False)
async def oauth_microsoft_start():
    """Redirect the browser to Microsoft Entra ID for sign-in."""
    if not settings.oauth_microsoft_client_id:
        raise HTTPException(status_code=501, detail="Microsoft OAuth is not configured on this server.")

    tenant = settings.oauth_microsoft_tenant_id
    params = urllib.parse.urlencode({
        "client_id": settings.oauth_microsoft_client_id,
        "response_type": "code",
        "redirect_uri": settings.oauth_microsoft_redirect_uri,
        "response_mode": "query",
        "scope": "openid email profile User.Read",
    })
    return RedirectResponse(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{params}"
    )


@router.get("/oauth/microsoft/callback", include_in_schema=False)
async def oauth_microsoft_callback(
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """Exchange the Microsoft auth code for a SourceSAT JWT and redirect to the frontend."""
    if error or not code:
        return _oauth_error_redirect(error or "access_denied")

    tenant = settings.oauth_microsoft_tenant_id
    # Exchange code for tokens
    token_resp = http_requests.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "client_id": settings.oauth_microsoft_client_id,
            "client_secret": settings.oauth_microsoft_client_secret.get_secret_value(),
            "code": code,
            "redirect_uri": settings.oauth_microsoft_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    if not token_resp.ok:
        return _oauth_error_redirect("token_exchange_failed")

    ms_access_token = token_resp.json().get("access_token", "")

    # Fetch user profile from Microsoft Graph
    graph_resp = http_requests.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {ms_access_token}"},
        timeout=10,
    )
    if not graph_resp.ok:
        return _oauth_error_redirect("userinfo_failed")

    ms_user = graph_resp.json()
    email = (ms_user.get("mail") or ms_user.get("userPrincipalName") or "").lower().strip()
    full_name = ms_user.get("displayName")

    if not email:
        return _oauth_error_redirect("no_email_returned")

    user = _oauth_upsert_user(email, full_name)
    if not user or not user.get("is_active"):
        return _oauth_error_redirect("account_inactive")

    jwt_token = create_access_token(user["user_id"], user["email"])
    fe = settings.frontend_url.rstrip("/")
    return RedirectResponse(f"{fe}/auth/callback?token={jwt_token}")


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/oauth/google", include_in_schema=False)
async def oauth_google_start():
    """Redirect the browser to Google for sign-in."""
    if not settings.oauth_google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth is not configured on this server.")

    params = urllib.parse.urlencode({
        "client_id": settings.oauth_google_client_id,
        "redirect_uri": settings.oauth_google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/oauth/google/callback", include_in_schema=False)
async def oauth_google_callback(
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    """Exchange the Google auth code for a SourceSAT JWT and redirect to the frontend."""
    if error or not code:
        return _oauth_error_redirect(error or "access_denied")

    # Exchange code for tokens
    token_resp = http_requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.oauth_google_client_id,
            "client_secret": settings.oauth_google_client_secret.get_secret_value(),
            "code": code,
            "redirect_uri": settings.oauth_google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    if not token_resp.ok:
        return _oauth_error_redirect("token_exchange_failed")

    google_access_token = token_resp.json().get("access_token", "")

    # Fetch user profile
    userinfo_resp = http_requests.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {google_access_token}"},
        timeout=10,
    )
    if not userinfo_resp.ok:
        return _oauth_error_redirect("userinfo_failed")

    g_user = userinfo_resp.json()
    email = (g_user.get("email") or "").lower().strip()
    full_name = g_user.get("name")

    if not email:
        return _oauth_error_redirect("no_email_returned")

    user = _oauth_upsert_user(email, full_name)
    if not user or not user.get("is_active"):
        return _oauth_error_redirect("account_inactive")

    jwt_token = create_access_token(user["user_id"], user["email"])
    fe = settings.frontend_url.rstrip("/")
    return RedirectResponse(f"{fe}/auth/callback?token={jwt_token}")
