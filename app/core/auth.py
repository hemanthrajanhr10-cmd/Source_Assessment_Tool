"""
Auth utilities — password hashing, JWT tokens, TOTP MFA.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
from jose import JWTError, jwt
from passlib.context import CryptContext

# ── Config ────────────────────────────────────────────────────────────────────

SECRET_KEY = "SAT-JWT-SECRET-CHANGE-IN-PROD-2026"   # override via env var in production
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8   # 8 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Password ──────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── TOTP MFA ──────────────────────────────────────────────────────────────────

def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name="SAT Assessment Tool",
    )


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def new_user_id() -> str:
    return str(uuid.uuid4())
