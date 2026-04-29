# Python Templates for On-Prem Tunnel Connectivity

All templates use:
- **FastAPI** — web framework
- **SQLAlchemy (async)** — ORM for connection store
- **cryptography** — AES-256-GCM for secrets at rest
- **asyncpg / aiomysql / pyodbc** — DB drivers (swap as needed)

Install dependencies:
```bash
pip install fastapi uvicorn sqlalchemy[asyncio] cryptography asyncpg aiosqlite python-dotenv
```

---

## crypto.py — AES-256-GCM Encryption

```python
# crypto.py
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def get_key() -> bytes:
    """Load 32-byte key from env (base64-encoded). Generate with:
       python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
    """
    raw = os.environ.get("ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError("ENCRYPTION_KEY env var not set")
    return base64.b64decode(raw)


def encrypt(plaintext: str) -> str:
    """Encrypt plaintext string → base64-encoded ciphertext (nonce prepended)."""
    key = get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()


def decrypt(ciphertext_b64: str) -> str:
    """Decrypt base64-encoded ciphertext → plaintext string."""
    key = get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(ciphertext_b64)
    nonce, ct = raw[:12], raw[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()
```

---

## models.py — SQLAlchemy Connection Store

```python
# models.py
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class UserConnection(Base):
    """Stores per-user on-prem connection configurations.
    Sensitive fields (host, db, username, password) are AES-256-GCM encrypted.
    """
    __tablename__ = "user_connections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), nullable=False, index=True)
    connection_name = Column(String(200), nullable=False)

    # Tunnel endpoint — not sensitive, but store consistently
    tunnel_host = Column(String(300), nullable=False)   # e.g. db.yourdomain.com
    tunnel_port = Column(Integer, nullable=False)        # e.g. 5432

    # Encrypted fields
    database_name = Column(String(500), nullable=False)  # encrypted
    db_username = Column(String(500), nullable=False)    # encrypted
    db_password = Column(String(700), nullable=False)    # encrypted

    resource_type = Column(String(50), nullable=False, default="postgres")
    # Options: postgres, mysql, mssql, redis, http

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

## database.py — Async DB Session

```python
# database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from models import Base
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./connections.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
```

---

## connection_manager.py — Runtime Tunnel Connection

```python
# connection_manager.py
"""
Manages live connections to on-prem resources through the tunnel.
Swap the driver section for your resource type.
"""
import asyncpg          # PostgreSQL — swap for aiomysql, pyodbc, aioredis etc.
from crypto import decrypt
from models import UserConnection


async def get_pg_connection(conn: UserConnection) -> asyncpg.Connection:
    """Open a PostgreSQL connection through the Cloudflare Tunnel endpoint."""
    return await asyncpg.connect(
        host=conn.tunnel_host,
        port=conn.tunnel_port,
        database=decrypt(conn.database_name),
        user=decrypt(conn.db_username),
        password=decrypt(conn.db_password),
        ssl="require",          # enforce TLS even through tunnel
        command_timeout=30,
    )


async def test_connection(conn: UserConnection) -> dict:
    """Test connectivity + credentials. Returns {success, latency_ms, error}."""
    import time
    start = time.monotonic()
    try:
        pg_conn = await get_pg_connection(conn)
        await pg_conn.fetchval("SELECT 1")
        await pg_conn.close()
        return {"success": True, "latency_ms": round((time.monotonic() - start) * 1000)}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def execute_query(conn: UserConnection, sql: str, params: list = None) -> list[dict]:
    """Execute a read query and return rows as list of dicts.
    WARNING: Validate / sanitize SQL before passing here.
    """
    pg_conn = await get_pg_connection(conn)
    try:
        rows = await pg_conn.fetch(sql, *(params or []))
        return [dict(row) for row in rows]
    finally:
        await pg_conn.close()
```

---

## api_routes.py — FastAPI Routes

```python
# api_routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_session
from models import UserConnection
from crypto import encrypt, decrypt
from connection_manager import test_connection, execute_query

router = APIRouter(prefix="/connections", tags=["connections"])


# --- Pydantic schemas ---

class ConnectionCreate(BaseModel):
    connection_name: str
    tunnel_host: str
    tunnel_port: int
    database_name: str
    db_username: str
    db_password: str
    resource_type: str = "postgres"


class ConnectionResponse(BaseModel):
    id: int
    connection_name: str
    tunnel_host: str
    tunnel_port: int
    resource_type: str
    # Never return decrypted credentials


class QueryRequest(BaseModel):
    sql: str
    params: list = []


# --- Helpers ---

def current_user_id() -> str:
    """Replace with your real auth (JWT, session, OAuth)."""
    return "demo-user-id"


async def get_user_connection(
    conn_id: int,
    user_id: str,
    session: AsyncSession,
) -> UserConnection:
    result = await session.execute(
        select(UserConnection).where(
            UserConnection.id == conn_id,
            UserConnection.user_id == user_id,   # ← enforce user isolation
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


# --- Routes ---

@router.post("/", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    payload: ConnectionCreate,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(current_user_id),
):
    conn = UserConnection(
        user_id=user_id,
        connection_name=payload.connection_name,
        tunnel_host=payload.tunnel_host,
        tunnel_port=payload.tunnel_port,
        database_name=encrypt(payload.database_name),
        db_username=encrypt(payload.db_username),
        db_password=encrypt(payload.db_password),
        resource_type=payload.resource_type,
    )
    session.add(conn)
    await session.commit()
    await session.refresh(conn)
    return conn


@router.get("/", response_model=list[ConnectionResponse])
async def list_connections(
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(current_user_id),
):
    result = await session.execute(
        select(UserConnection).where(UserConnection.user_id == user_id)
    )
    return result.scalars().all()


@router.delete("/{conn_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    conn_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(current_user_id),
):
    conn = await get_user_connection(conn_id, user_id, session)
    await session.delete(conn)
    await session.commit()


@router.post("/{conn_id}/test")
async def test_conn(
    conn_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(current_user_id),
):
    conn = await get_user_connection(conn_id, user_id, session)
    return await test_connection(conn)


@router.post("/{conn_id}/query")
async def run_query(
    conn_id: int,
    body: QueryRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(current_user_id),
):
    conn = await get_user_connection(conn_id, user_id, session)
    rows = await execute_query(conn, body.sql, body.params)
    return {"rows": rows, "count": len(rows)}
```

---

## main.py — App Entry Point

```python
# main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
from database import init_db
from api_routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="On-Prem Tunnel Connector", lifespan=lifespan)
app.include_router(router)
```

Run with:
```bash
uvicorn main:app --reload
```

---

## Adapting for Other Resource Types

| Resource | Swap in `connection_manager.py` |
|---|---|
| MySQL / MariaDB | `aiomysql.connect(...)` |
| SQL Server (MSSQL) | `pyodbc.connect(...)` (sync) or `aioodbc` |
| Redis | `aioredis.from_url(f"redis://{host}:{port}")` |
| MongoDB | `motor.AsyncIOMotorClient(...)` |
| Internal HTTP API | `httpx.AsyncClient(base_url=f"http://{host}:{port}")` |

Change `resource_type` values and add a driver-dispatch function as needed.
