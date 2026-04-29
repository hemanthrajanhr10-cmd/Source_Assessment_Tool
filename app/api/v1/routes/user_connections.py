"""
UserConnections API — per-user Cloudflare Tunnel SQL Server connection configs.

Endpoints
---------
POST   /api/v1/user-connections              create a new connection (credentials encrypted at rest)
GET    /api/v1/user-connections              list connections for the current user (no plaintext returned)
GET    /api/v1/user-connections/{id}         get one connection (no plaintext returned)
PUT    /api/v1/user-connections/{id}         update a connection (re-encrypts all credential fields)
DELETE /api/v1/user-connections/{id}         delete (owner only)
POST   /api/v1/user-connections/{id}/test    decrypt + open a connection; return ok/error (no creds in response)

Security guarantees:
- Plaintext credentials (DatabaseName, SqlUsername, SqlPassword) are encrypted with
  AES-256-GCM before they reach the DB layer.
- Decrypted values are used only to open a test connection; they are never logged,
  never included in any response body, and never persisted unencrypted.
- Every query is scoped to the authenticated user's user_id — cross-user data access
  is structurally impossible via these endpoints.
"""

import uuid
from typing import Optional

import mssql_python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.dependencies import get_current_user
from app.core.logging import get_logger
from app.db import azure_store
from app.services.credential_cipher import decrypt, encrypt

router = APIRouter()
logger = get_logger(__name__)


# ── Pydantic models ────────────────────────────────────────────────────────────

class UserConnectionRequest(BaseModel):
    display_name: str  = Field(..., min_length=1, max_length=200)
    tunnel_host:  str  = Field(..., min_length=1, max_length=500,
                               description="Cloudflare Tunnel hostname, e.g. sql.yourdomain.com")
    tunnel_port:  int  = Field(1433, ge=1, le=65535)
    # Plaintext credentials — accepted in request body, encrypted before storage
    database_name: str = Field(..., min_length=1, max_length=128)
    sql_username:  str = Field(..., min_length=1, max_length=128)
    sql_password:  str = Field(..., min_length=1)

    @field_validator("tunnel_host")
    @classmethod
    def no_credentials_in_host(cls, v: str) -> str:
        """Prevent accidentally embedding passwords in the host field."""
        if "@" in v:
            raise ValueError("tunnel_host must not contain credentials (@).")
        return v.strip()


class UserConnectionResponse(BaseModel):
    """Never includes decrypted credential fields."""
    connection_id: str
    display_name:  str
    tunnel_host:   str
    tunnel_port:   int
    created_at:    str
    updated_at:    str


class TestConnectionResponse(BaseModel):
    ok:      bool
    message: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _row_to_response(row: dict) -> UserConnectionResponse:
    return UserConnectionResponse(
        connection_id=row["connection_id"],
        display_name=row["display_name"],
        tunnel_host=row["tunnel_host"],
        tunnel_port=row["tunnel_port"],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def _require_connection(connection_id: str, user_id: str) -> dict:
    """Fetch the raw DB row (with enc fields) or raise 404."""
    row = azure_store.get_user_connection(connection_id, user_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Connection not found.")
    return row


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=UserConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a new Cloudflare Tunnel connection (credentials encrypted)",
)
async def create_connection(
    body: UserConnectionRequest,
    current_user: dict = Depends(get_current_user),
):
    connection_id = str(uuid.uuid4())
    user_id       = current_user["user_id"]

    azure_store.create_user_connection(
        connection_id=connection_id,
        user_id=user_id,
        display_name=body.display_name,
        tunnel_host=body.tunnel_host,
        tunnel_port=body.tunnel_port,
        database_name_enc=encrypt(body.database_name),
        sql_username_enc=encrypt(body.sql_username),
        sql_password_enc=encrypt(body.sql_password),
    )

    logger.info("User %s created UserConnection %s ('%s')", user_id, connection_id, body.display_name)

    row = azure_store.get_user_connection(connection_id, user_id)
    return _row_to_response(row)


@router.get(
    "",
    response_model=list[UserConnectionResponse],
    summary="List connections for the current user (no credentials returned)",
)
async def list_connections(current_user: dict = Depends(get_current_user)):
    rows = azure_store.list_user_connections(user_id=current_user["user_id"])
    return [_row_to_response(r) for r in rows]


@router.get(
    "/{connection_id}",
    response_model=UserConnectionResponse,
    summary="Get a single connection (no credentials returned)",
)
async def get_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
):
    row = _require_connection(connection_id, current_user["user_id"])
    return _row_to_response(row)


@router.put(
    "/{connection_id}",
    response_model=UserConnectionResponse,
    summary="Update a connection (re-encrypts all credential fields)",
)
async def update_connection(
    connection_id: str,
    body: UserConnectionRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    updated = azure_store.update_user_connection(
        connection_id=connection_id,
        user_id=user_id,
        display_name=body.display_name,
        tunnel_host=body.tunnel_host,
        tunnel_port=body.tunnel_port,
        database_name_enc=encrypt(body.database_name),
        sql_username_enc=encrypt(body.sql_username),
        sql_password_enc=encrypt(body.sql_password),
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Connection not found.")

    logger.info("User %s updated UserConnection %s", user_id, connection_id)
    row = azure_store.get_user_connection(connection_id, user_id)
    return _row_to_response(row)


@router.delete(
    "/{connection_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a connection (owner only)",
)
async def delete_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
):
    deleted = azure_store.delete_user_connection(
        connection_id=connection_id,
        user_id=current_user["user_id"],
    )
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Connection not found.")
    logger.info("User %s deleted UserConnection %s", current_user["user_id"], connection_id)
    return {"ok": True}


@router.post(
    "/{connection_id}/test",
    response_model=TestConnectionResponse,
    summary="Test the tunnel connection (decrypts credentials in-memory only)",
)
async def test_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Decrypts credentials from the DB, opens a SQL Server connection through the
    Cloudflare Tunnel endpoint, runs SELECT 1, then immediately discards the
    plaintext values.  No credential appears in logs or in the response body.
    """
    user_id = current_user["user_id"]
    row     = _require_connection(connection_id, user_id)

    # Decrypt — values are local, never logged, never returned
    try:
        db_name  = decrypt(row["database_name_enc"])
        username = decrypt(row["sql_username_enc"])
        password = decrypt(row["sql_password_enc"])
    except Exception:
        logger.error(
            "UserConnection %s: decryption failed for user %s", connection_id, user_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt connection credentials.",
        )

    conn_str = (
        f"SERVER={row['tunnel_host']},{row['tunnel_port']};"
        f"DATABASE={db_name};"
        f"UID={username};"
        f"PWD={password};"
        "TrustServerCertificate=yes;"
        "Encrypt=yes;"
        "ConnectTimeout=10;"
    )

    # Immediately wipe plaintext references (best-effort in CPython)
    db_name = username = password = None

    try:
        sql_conn = mssql_python.connect(conn_str)
        try:
            cur = sql_conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        finally:
            sql_conn.close()
    except Exception as exc:
        # Log the error class only — never include exc message (may contain creds)
        logger.warning(
            "UserConnection %s test failed for user %s: %s",
            connection_id, user_id, type(exc).__name__,
        )
        return TestConnectionResponse(ok=False, message="Connection failed. Check tunnel host, port, and credentials.")

    logger.info("UserConnection %s test succeeded for user %s", connection_id, user_id)
    return TestConnectionResponse(ok=True, message="Connection successful.")
