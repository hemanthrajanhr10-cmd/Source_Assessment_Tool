"""
Auth routes.

POST /api/v1/auth/register        — create account
POST /api/v1/auth/login           — email + password → JWT (or MFA challenge)
POST /api/v1/auth/verify-mfa      — submit TOTP code → JWT
POST /api/v1/auth/setup-mfa       — generate TOTP secret + QR URI
POST /api/v1/auth/confirm-mfa     — verify code and enable MFA
GET  /api/v1/auth/me              — current user profile
"""

import base64
import io
from typing import Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

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
