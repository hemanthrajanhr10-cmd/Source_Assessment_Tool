"""
Auth routes.

POST /api/v1/auth/register                     — create account
POST /api/v1/auth/login                        — email + password → JWT (or MFA challenge)
POST /api/v1/auth/verify-mfa                   — submit TOTP code → JWT
POST /api/v1/auth/setup-mfa                    — generate TOTP secret + QR URI
POST /api/v1/auth/confirm-mfa                  — verify code and enable MFA
GET  /api/v1/auth/me                           — current user profile
GET  /api/v1/auth/oauth/providers              — which OAuth providers are configured
GET  /api/v1/auth/oauth/microsoft              — start Microsoft OAuth flow
GET  /api/v1/auth/oauth/microsoft/callback     — Microsoft OAuth callback
GET  /api/v1/auth/oauth/google                 — start Google OAuth flow
GET  /api/v1/auth/oauth/google/callback        — Google OAuth callback
GET  /api/v1/auth/oauth/apple                  — start Apple Sign In flow
POST /api/v1/auth/oauth/apple/callback         — Apple Sign In callback (Apple posts form data)
"""

import base64
import io
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Optional

import qrcode
import requests as http_requests
from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field

from jose import jwt as jose_jwt
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
from app.core.email_utils import send_new_user_notification
from app.db import azure_store

router = APIRouter()


# ── IP / location helpers ─────────────────────────────────────────────────────

def _strip_port(raw: str) -> str:
    """Remove port from 'host:port' or '[::1]:port' style strings."""
    raw = raw.strip()
    if raw.startswith("["):
        # IPv6 with port: [::1]:port
        return raw[1:raw.index("]")]
    if raw.count(":") == 1:
        # IPv4 with port: 1.2.3.4:56789
        return raw.split(":")[0]
    return raw


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, honouring X-Forwarded-For if present."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return _strip_port(forwarded.split(",")[0])
    if request.client:
        return _strip_port(request.client.host)
    return "unknown"


def _resolve_location(ip: str) -> str:
    """Return 'City, Region, Country' for an IP via ip-api.com (free, no key)."""
    ip = _strip_port(ip)
    if not ip or ip in ("unknown", "127.0.0.1", "::1"):
        return "localhost"
    try:
        resp = http_requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,city,regionName,country",
            timeout=4,
        )
        if resp.ok:
            data = resp.json()
            if data.get("status") == "success":
                parts = [data.get("city"), data.get("regionName"), data.get("country")]
                return ", ".join(p for p in parts if p) or ip
    except Exception:
        pass
    return ip


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

@router.post("/register", status_code=201)
async def register(body: RegisterRequest):
    existing = azure_store.get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user_id = new_user_id()
    password_hash = hash_password(body.password)
    azure_store.create_user(user_id, body.email, body.full_name, password_hash)

    # Mark account inactive until admin sets the retention period
    azure_store.deactivate_user(user_id)

    # Notify admin — email contains a form to set the retention period
    send_new_user_notification(body.email, body.full_name, user_id)

    return {
        "message": "Account created. Your account is pending activation by an administrator. "
                   "You will be able to log in once access has been granted."
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request):
    user = azure_store.get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Auto-expire if retention period has lapsed
    expires_at = user.get("expires_at")
    if expires_at is not None:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(tz=timezone.utc) > expires_at:
            azure_store.expire_stale_users()
            # Re-fetch to get updated is_active
            user = azure_store.get_user_by_email(body.email)

    if not user.get("is_active"):
        # Distinguish expired retention from pending-activation so the frontend
        # can offer a "Request Extension" flow specifically for expired accounts.
        has_expiry = user.get("expires_at") is not None
        if has_expiry:
            raise HTTPException(
                status_code=403,
                detail="retention_expired",
            )
        raise HTTPException(
            status_code=403,
            detail="Account is pending activation by an administrator."
        )

    # If MFA is enabled, return a challenge — no token yet (login info updated after MFA)
    if user.get("mfa_enabled"):
        return TokenResponse(access_token="", mfa_required=True)

    ip = _get_client_ip(request)
    azure_store.update_user_login_info(user["user_id"], ip, _resolve_location(ip))

    token = create_access_token(user["user_id"], user["email"])
    return TokenResponse(access_token=token)


@router.post("/verify-mfa", response_model=TokenResponse)
async def verify_mfa(body: VerifyMFARequest, request: Request):
    user = azure_store.get_user_by_email(body.email)
    if not user or not user.get("mfa_enabled") or not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA not set up for this account.")

    if not verify_totp(user["mfa_secret"], body.code):
        raise HTTPException(status_code=401, detail="Invalid MFA code. Please try again.")

    ip = _get_client_ip(request)
    azure_store.update_user_login_info(user["user_id"], ip, _resolve_location(ip))

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
    expires_at = current_user.get("expires_at")
    expires_at_str = None
    days_remaining = None
    if expires_at is not None:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        expires_at_str = expires_at.isoformat()
        delta = expires_at - datetime.now(tz=timezone.utc)
        days_remaining = max(0, delta.days)
    return {
        "user_id": current_user["user_id"],
        "email": current_user["email"],
        "full_name": current_user.get("full_name"),
        "mfa_enabled": bool(current_user.get("mfa_enabled")),
        "created_at": str(current_user.get("created_at", "")),
        "last_login_ip": current_user.get("last_login_ip"),
        "last_login_location": current_user.get("last_login_location"),
        "expires_at": expires_at_str,
        "days_remaining": days_remaining,
    }


# ── OAuth providers status ────────────────────────────────────────────────────

@router.get("/oauth/providers")
async def oauth_providers():
    """Return which OAuth providers are configured and available."""
    return {
        "microsoft": bool(settings.oauth_microsoft_client_id),
        "google": bool(settings.oauth_google_client_id),
        "apple": bool(
            settings.oauth_apple_client_id
            and settings.oauth_apple_team_id
            and settings.oauth_apple_key_id
            and settings.oauth_apple_private_key.get_secret_value()
        ),
    }


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def _oauth_upsert_user(email: str, full_name: Optional[str]) -> dict:
    """Find or create an OAuth user (no password). Returns user dict."""
    user = azure_store.get_user_by_email(email)
    if not user:
        user_id = new_user_id()
        # password_hash = "" marks this as an OAuth-only account
        azure_store.create_user(user_id, email, full_name, "")
        # New OAuth users start inactive until admin sets a retention period
        azure_store.deactivate_user(user_id)
        send_new_user_notification(email, full_name, user_id)
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
    request: Request,
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

    ip = _get_client_ip(request)
    azure_store.update_user_login_info(user["user_id"], ip, _resolve_location(ip))

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
    request: Request,
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

    ip = _get_client_ip(request)
    azure_store.update_user_login_info(user["user_id"], ip, _resolve_location(ip))

    jwt_token = create_access_token(user["user_id"], user["email"])
    fe = settings.frontend_url.rstrip("/")
    return RedirectResponse(f"{fe}/auth/callback?token={jwt_token}")


# ── Apple Sign In ─────────────────────────────────────────────────────────────

def _apple_client_secret() -> str:
    """Generate an Apple client_secret JWT valid for 6 months."""
    private_key = settings.oauth_apple_private_key.get_secret_value()
    now = int(time.time())
    payload = {
        "iss": settings.oauth_apple_team_id,
        "iat": now,
        "exp": now + 15_552_000,  # 180 days
        "aud": "https://appleid.apple.com",
        "sub": settings.oauth_apple_client_id,
    }
    return jose_jwt.encode(
        payload,
        private_key,
        algorithm="ES256",
        headers={"kid": settings.oauth_apple_key_id},
    )


@router.get("/oauth/apple", include_in_schema=False)
async def oauth_apple_start():
    """Redirect the browser to Apple for sign-in."""
    if not settings.oauth_apple_client_id:
        raise HTTPException(status_code=501, detail="Apple Sign In is not configured on this server.")

    params = urllib.parse.urlencode({
        "client_id": settings.oauth_apple_client_id,
        "redirect_uri": settings.oauth_apple_redirect_uri,
        "response_type": "code id_token",
        "scope": "name email",
        "response_mode": "form_post",
    })
    return RedirectResponse(f"https://appleid.apple.com/auth/authorize?{params}")


@router.post("/oauth/apple/callback", include_in_schema=False)
async def oauth_apple_callback(
    request: Request,
    code: Optional[str] = Form(default=None),
    id_token: Optional[str] = Form(default=None),
    error: Optional[str] = Form(default=None),
    user: Optional[str] = Form(default=None),
):
    """Apple posts form data back to the callback URI. Decode id_token for the email."""
    if error or not code or not id_token:
        return _oauth_error_redirect(error or "access_denied")

    try:
        import json as _json_mod
        # Decode the JWT payload without signature verification
        parts = id_token.split(".")
        if len(parts) < 2:
            raise ValueError("invalid id_token")
        padding = 4 - len(parts[1]) % 4
        payload_bytes = base64.urlsafe_b64decode(parts[1] + "=" * (padding % 4))
        claims = _json_mod.loads(payload_bytes)
        email = (claims.get("email") or "").lower().strip()
    except Exception:
        return _oauth_error_redirect("token_decode_failed")

    if not email:
        return _oauth_error_redirect("no_email_returned")

    # Apple sends the user's name only on the very first sign-in
    full_name: Optional[str] = None
    if user:
        try:
            import json as _json
            user_data = _json.loads(user)
            name = user_data.get("name", {})
            parts = [name.get("firstName", ""), name.get("lastName", "")]
            full_name = " ".join(p for p in parts if p).strip() or None
        except Exception:
            pass

    sat_user = _oauth_upsert_user(email, full_name)
    if not sat_user or not sat_user.get("is_active"):
        return _oauth_error_redirect("account_inactive")

    ip = _get_client_ip(request)
    azure_store.update_user_login_info(sat_user["user_id"], ip, _resolve_location(ip))

    jwt_token = create_access_token(sat_user["user_id"], sat_user["email"])
    fe = settings.frontend_url.rstrip("/")
    return RedirectResponse(f"{fe}/auth/callback?token={jwt_token}", status_code=303)


# ── Admin: set retention period ──────────────────────────────────────────────

@router.get("/admin/set-retention", response_class=HTMLResponse, include_in_schema=False)
async def admin_set_retention_form(user_id: str = Query(...)):
    """
    Renders a browser-hosted form so the admin can set the retention period.
    Linked from the notification email (Outlook blocks in-email forms).
    """
    user = azure_store.get_user_by_id(user_id)
    if not user:
        return HTMLResponse(
            _admin_page("Error", "User not found.", success=False),
            status_code=404,
        )
    display = user.get("full_name") or user.get("email", user_id)
    email = user.get("email", "")
    backend = settings.backend_url.rstrip("/")
    return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>SAT Admin — Set Retention Period</title>
  <style>
    body {{font-family:Arial,sans-serif;background:#f4f6f9;display:flex;
           align-items:center;justify-content:center;min-height:100vh;margin:0;}}
    .card {{background:#fff;border-radius:10px;padding:40px 48px;max-width:480px;width:100%;
            box-shadow:0 2px 16px rgba(0,0,0,.12);}}
    h2 {{color:#1a73e8;margin-top:0;}}
    .info {{background:#f0f7ff;border-left:4px solid #1a73e8;padding:12px 16px;
            border-radius:4px;margin:16px 0;font-size:14px;color:#333;}}
    label {{display:block;font-size:13px;font-weight:bold;color:#333;margin-top:20px;}}
    input[type=number] {{width:100%;padding:10px;border:1px solid #ccc;
                          border-radius:6px;font-size:15px;margin-top:6px;box-sizing:border-box;}}
    button {{margin-top:20px;background:#1a73e8;color:#fff;border:none;padding:12px 28px;
             border-radius:6px;font-size:15px;cursor:pointer;width:100%;}}
    button:hover {{background:#1557b0;}}
    .footer {{text-align:center;margin-top:20px;font-size:12px;color:#999;}}
  </style>
</head>
<body>
  <div class="card">
    <h2>Set Retention Period</h2>
    <p style="color:#444;">Activate the account and set how many days it stays active.</p>
    <div class="info">
      <strong>Name:</strong> {display}<br/>
      <strong>Email:</strong> {email}
    </div>
    <form method="POST" action="{backend}/api/v1/auth/admin/set-retention">
      <input type="hidden" name="user_id" value="{user_id}"/>
      <label for="days">Retention Period (days)</label>
      <input type="number" id="days" name="days" min="1" max="3650"
             placeholder="e.g. 30" required/>
      <button type="submit">Set Retention &amp; Activate Account</button>
    </form>
    <div class="footer">SAT — Source Assessment Tool</div>
  </div>
</body>
</html>""")


@router.post("/admin/set-retention", response_class=HTMLResponse, include_in_schema=False)
async def admin_set_retention(
    user_id: str = Form(...),
    days: int = Form(..., ge=1, le=3650),
):
    """
    Receives the admin form submission from the notification email.
    Sets expires_at = now + days and activates the account.
    Returns a simple HTML confirmation page.
    """
    user = azure_store.get_user_by_id(user_id)
    if not user:
        return HTMLResponse(
            _admin_page("Error", "User not found.", success=False),
            status_code=404,
        )

    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=days)
    azure_store.set_user_expiry(user_id, expires_at)

    expiry_str = expires_at.strftime("%Y-%m-%d")
    return HTMLResponse(
        _admin_page(
            "Account Activated",
            f"Account <strong>{user['email']}</strong> has been activated.<br/>"
            f"Retention period: <strong>{days} days</strong> (expires {expiry_str} UTC).",
            success=True,
        )
    )


# ── User: request retention extension ────────────────────────────────────────

class ExtensionRequest(BaseModel):
    email: str
    requested_days: int = Field(..., ge=1, le=3650)

@router.post("/request-extension", include_in_schema=False)
async def request_extension(body: ExtensionRequest):
    """
    Called from the login page when a user's retention has expired.
    Sends admin an email with Accept / Decline buttons (editable days).
    """
    from app.core.email_utils import send_extension_request_notification
    user = azure_store.get_user_by_email(body.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    send_extension_request_notification(
        email=user["email"],
        full_name=user.get("full_name"),
        user_id=user["user_id"],
        requested_days=body.requested_days,
    )
    return {"message": "Extension request sent to administrator."}


# ── Admin: review extension request (browser page from email link) ────────────

@router.get("/admin/review-extension", response_class=HTMLResponse, include_in_schema=False)
async def admin_review_extension(
    user_id: str = Query(...),
    days: int = Query(..., ge=1, le=3650),
):
    """Browser page linked from the extension-request email. Admin can edit days and accept/decline."""
    user = azure_store.get_user_by_id(user_id)
    if not user:
        return HTMLResponse(_admin_page("Error", "User not found.", success=False), status_code=404)
    display = user.get("full_name") or user.get("email", user_id)
    email_addr = user.get("email", "")
    backend = settings.backend_url.rstrip("/")

    return HTMLResponse(f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>SAT — Review Extension Request</title>
  <style>
    *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
    body{{font-family:Arial,Helvetica,sans-serif;background:#F0FAF9;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;padding:24px;}}
    .wrap{{width:100%;max-width:480px;}}
    /* Logo bar */
    .logo-bar{{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:24px;}}
    .logo-icon{{width:38px;height:38px;background:#6CBDB5;border-radius:9px;
                display:flex;align-items:center;justify-content:center;
                font-size:20px;color:#fff;}}
    .logo-name{{font-size:16px;font-weight:700;color:#0D1117;letter-spacing:-0.02em;}}
    /* Card */
    .card{{background:#fff;border:1px solid #B2DDD9;border-radius:16px;overflow:hidden;
           box-shadow:0 4px 16px rgba(108,189,181,0.10),0 1px 4px rgba(0,0,0,0.04);}}
    .card-stripe{{height:4px;background:#6CBDB5;}}
    .card-body{{padding:32px 36px 36px;}}
    /* Badge */
    .badge{{display:inline-flex;align-items:center;gap:6px;
            background:#E5F5F3;border:1px solid #C8E9E6;border-radius:9999px;
            padding:4px 12px;font-size:11px;font-weight:700;color:#358F87;
            letter-spacing:0.07em;text-transform:uppercase;margin-bottom:16px;}}
    h2{{font-size:20px;font-weight:700;color:#0D1117;letter-spacing:-0.02em;margin-bottom:6px;}}
    .sub{{font-size:13px;color:#5A7A77;line-height:1.6;margin-bottom:24px;}}
    /* User detail block */
    .detail{{background:#F0FAF9;border:1px solid #C8E9E6;border-radius:10px;
             padding:16px 18px;margin-bottom:20px;}}
    .detail-header{{font-size:10px;font-weight:700;color:#6CBDB5;letter-spacing:0.12em;
                    text-transform:uppercase;margin-bottom:12px;}}
    .detail-row{{display:flex;gap:12px;margin-bottom:8px;}}
    .detail-row:last-child{{margin-bottom:0;}}
    .detail-label{{font-size:10px;font-weight:700;color:#93CCC6;letter-spacing:0.1em;
                   text-transform:uppercase;width:56px;flex-shrink:0;padding-top:2px;}}
    .detail-value{{font-size:13px;color:#0D1117;font-weight:600;}}
    .detail-value.mono{{font-family:'Courier New',monospace;font-size:12px;color:#5A7A77;word-break:break-all;}}
    /* Form */
    .field-label{{font-size:11px;font-weight:700;color:#5A7A77;letter-spacing:0.08em;
                  text-transform:uppercase;display:block;margin-bottom:6px;margin-top:20px;}}
    input[type=number]{{width:100%;padding:11px 14px;border:1.5px solid #B2DDD9;
                        border-radius:8px;font-size:15px;color:#0D1117;background:#fff;
                        outline:none;transition:border-color 0.15s;}}
    input[type=number]:focus{{border-color:#6CBDB5;box-shadow:0 0 0 3px rgba(108,189,181,0.15);}}
    .hint{{font-size:11px;color:#93CCC6;margin-top:5px;}}
    /* Buttons */
    .btn-row{{display:flex;gap:12px;margin-top:24px;}}
    .btn{{flex:1;padding:13px;border:none;border-radius:10px;font-size:14px;
          font-weight:700;cursor:pointer;text-align:center;transition:opacity 0.15s;}}
    .btn:hover{{opacity:0.88;}}
    .btn-accept{{background:#6CBDB5;color:#fff;}}
    .btn-decline{{background:#FEE2E2;color:#DC2626;border:1px solid #FECACA;}}
    /* Footer */
    .footer{{text-align:center;margin-top:20px;font-size:11px;color:#93CCC6;}}
  </style>
</head>
<body>
  <div class="wrap">
    <!-- Logo -->
    <div class="logo-bar">
      <div class="logo-icon">&#128447;</div>
      <span class="logo-name">Source Assessment Tool</span>
    </div>

    <!-- Card -->
    <div class="card">
      <div class="card-stripe"></div>
      <div class="card-body">
        <div class="badge">&#x25CF;&nbsp; Extension Request</div>
        <h2>Review Access Extension</h2>
        <p class="sub">A user has requested an extension to their retention period. You can adjust the number of days before accepting.</p>

        <div class="detail">
          <div class="detail-header">User Details</div>
          <div class="detail-row">
            <span class="detail-label">Name</span>
            <span class="detail-value">{display}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value mono">{email_addr}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">User ID</span>
            <span class="detail-value mono">{user_id}</span>
          </div>
        </div>

        <label class="field-label" for="days">Extension Duration (days)</label>
        <input type="number" id="days" name="days" min="1" max="3650"
               value="{days}" placeholder="e.g. 30"/>
        <p class="hint">Requested: <strong>{days} days</strong> — edit if needed before accepting.</p>

        <div class="btn-row">
          <button class="btn btn-decline" onclick="submitDecline()">Decline</button>
          <button class="btn btn-accept" onclick="submitAccept()">Accept Extension</button>
        </div>
      </div>
    </div>

    <p class="footer">SAT &mdash; Source Assessment Tool &bull; UBTI</p>
  </div>

  <script>
    function submitAccept() {{
      var d = parseInt(document.getElementById('days').value, 10);
      if (!d || d < 1 || d > 3650) {{ alert('Please enter a valid number of days (1–3650).'); return; }}
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = '{backend}/api/v1/auth/admin/accept-extension';
      [['user_id', '{user_id}'], ['days', d]].forEach(function(p) {{
        var i = document.createElement('input');
        i.type = 'hidden'; i.name = p[0]; i.value = p[1];
        form.appendChild(i);
      }});
      document.body.appendChild(form);
      form.submit();
    }}
    function submitDecline() {{
      if (!confirm('Decline this extension request?')) return;
      var form = document.createElement('form');
      form.method = 'POST';
      form.action = '{backend}/api/v1/auth/admin/decline-extension';
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = 'user_id'; i.value = '{user_id}';
      form.appendChild(i);
      document.body.appendChild(form);
      form.submit();
    }}
  </script>
</body>
</html>""")


@router.post("/admin/accept-extension", response_class=HTMLResponse, include_in_schema=False)
async def admin_accept_extension(
    user_id: str = Form(...),
    days: int = Form(..., ge=1, le=3650),
):
    """Admin accepted the extension: re-activate user with new expiry."""
    user = azure_store.get_user_by_id(user_id)
    if not user:
        return HTMLResponse(_admin_page("Error", "User not found.", success=False), status_code=404)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=days)
    azure_store.set_user_expiry(user_id, expires_at)
    expiry_str = expires_at.strftime("%Y-%m-%d")
    return HTMLResponse(_admin_page(
        "Extension Accepted",
        f"Account <strong>{user['email']}</strong> has been reactivated.<br/>"
        f"New retention: <strong>{days} days</strong> (expires {expiry_str} UTC).",
        success=True,
    ))


@router.post("/admin/decline-extension", response_class=HTMLResponse, include_in_schema=False)
async def admin_decline_extension(user_id: str = Form(...)):
    """Admin declined the extension: account stays inactive."""
    user = azure_store.get_user_by_id(user_id)
    if not user:
        return HTMLResponse(_admin_page("Error", "User not found.", success=False), status_code=404)
    return HTMLResponse(_admin_page(
        "Extension Declined",
        f"The extension request for <strong>{user['email']}</strong> has been declined.<br/>"
        "The account will remain inactive.",
        success=False,
    ))


def _admin_page(title: str, body: str, success: bool) -> str:
    stripe = "#6CBDB5" if success else "#EF4444"
    icon_bg = "#E5F5F3" if success else "#FEE2E2"
    icon_color = "#358F87" if success else "#DC2626"
    icon = "&#10003;" if success else "&#10007;"
    text_color = "#358F87" if success else "#DC2626"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>SAT &mdash; {title}</title>
  <style>
    *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0;}}
    body{{font-family:Arial,Helvetica,sans-serif;background:#F0FAF9;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;padding:24px;}}
    .logo-bar{{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:24px;}}
    .logo-icon{{width:36px;height:36px;background:#6CBDB5;border-radius:8px;
                display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;}}
    .logo-name{{font-size:15px;font-weight:700;color:#0D1117;letter-spacing:-0.02em;}}
    .card{{background:#fff;border:1px solid #B2DDD9;border-radius:16px;overflow:hidden;
           box-shadow:0 4px 16px rgba(108,189,181,0.10),0 1px 4px rgba(0,0,0,0.04);
           max-width:420px;width:100%;}}
    .stripe{{height:4px;background:{stripe};}}
    .body{{padding:40px 36px;text-align:center;}}
    .icon-wrap{{width:56px;height:56px;border-radius:50%;background:{icon_bg};
                display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}}
    .icon{{font-size:24px;color:{icon_color};font-weight:700;}}
    h2{{font-size:20px;font-weight:700;color:{text_color};margin-bottom:10px;letter-spacing:-0.02em;}}
    p{{color:#5A7A77;line-height:1.7;font-size:14px;}}
    p strong{{color:#0D1117;}}
    .footer{{font-size:11px;color:#93CCC6;margin-top:24px;}}
  </style>
</head>
<body>
  <div style="width:100%;max-width:420px;">
    <div class="logo-bar">
      <div class="logo-icon">&#128447;</div>
      <span class="logo-name">Source Assessment Tool</span>
    </div>
    <div class="card">
      <div class="stripe"></div>
      <div class="body">
        <div class="icon-wrap"><span class="icon">{icon}</span></div>
        <h2>{title}</h2>
        <p>{body}</p>
        <p class="footer">SAT &mdash; Source Assessment Tool &bull; UBTI</p>
      </div>
    </div>
  </div>
</body>
</html>"""
