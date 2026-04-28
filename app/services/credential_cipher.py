"""
AES-256-GCM credential encryption for UserConnections.

Key loading priority:
  1. Azure Key Vault  — if AZURE_KEYVAULT_URL and USER_CONNECTIONS_KEY_NAME are set.
                        Uses DefaultAzureCredential (Managed Identity on App Service,
                        env-var service principal for local dev).
  2. Env var fallback — USER_CONNECTIONS_ENCRYPTION_KEY (base64-encoded 32 bytes).
                        Acceptable for local development only; never use in production
                        without Key Vault.

Stored format (per ciphertext):  base64( nonce[12] || ciphertext_with_tag )
The 16-byte GCM authentication tag is appended by the cryptography library and
verified automatically on decrypt — any tampering raises an exception.

SECURITY NOTES:
- The plaintext key is loaded once at startup and held in memory.
- Decrypted plaintext is NEVER logged or returned to callers; callers receive it
  as a plain string for immediate use in a connection string, then discard it.
- Do NOT pass decrypted values to any logging call.
"""

import base64
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.logging import get_logger

logger = get_logger(__name__)

_NONCE_BYTES = 12  # 96-bit nonce recommended for GCM
_KEY_BYTES   = 32  # 256-bit AES key


# ── Key loading ───────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_key() -> bytes:
    """
    Load the AES-256 key exactly once.  Result is cached for the process lifetime.
    Raises RuntimeError if neither Key Vault nor the env-var fallback is configured.
    """
    vault_url  = os.environ.get("AZURE_KEYVAULT_URL", "").strip()
    secret_name = os.environ.get("USER_CONNECTIONS_KEY_NAME", "user-connections-aes-key").strip()

    if vault_url:
        return _load_key_from_vault(vault_url, secret_name)

    # Env-var fallback (local dev only)
    raw = os.environ.get("USER_CONNECTIONS_ENCRYPTION_KEY", "").strip()
    if not raw:
        raise RuntimeError(
            "No encryption key configured for UserConnections. "
            "Set AZURE_KEYVAULT_URL (production) or "
            "USER_CONNECTIONS_ENCRYPTION_KEY (local dev only)."
        )
    key = base64.b64decode(raw)
    if len(key) != _KEY_BYTES:
        raise RuntimeError(
            f"USER_CONNECTIONS_ENCRYPTION_KEY must decode to exactly {_KEY_BYTES} bytes "
            f"(got {len(key)})."
        )
    logger.info(
        "UserConnections cipher: using env-var key (local dev — use Key Vault in production)"
    )
    return key


def _load_key_from_vault(vault_url: str, secret_name: str) -> bytes:
    """Fetch the AES key from Azure Key Vault using DefaultAzureCredential."""
    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient
    except ImportError as exc:
        raise RuntimeError(
            "azure-keyvault-secrets is required for Key Vault key loading. "
            "Add it to requirements.txt."
        ) from exc

    credential = DefaultAzureCredential()
    client     = SecretClient(vault_url=vault_url, credential=credential)
    secret     = client.get_secret(secret_name)

    key = base64.b64decode(secret.value)
    if len(key) != _KEY_BYTES:
        raise RuntimeError(
            f"Key Vault secret '{secret_name}' must decode to exactly {_KEY_BYTES} bytes "
            f"(got {len(key)})."
        )
    logger.info(
        "UserConnections cipher: key loaded from Key Vault '%s' / secret '%s'",
        vault_url, secret_name,
    )
    return key


# ── Public API ────────────────────────────────────────────────────────────────

def encrypt(plaintext: str) -> str:
    """
    Encrypt a UTF-8 string with AES-256-GCM.
    Returns a base64-encoded string: base64( nonce[12] || ciphertext_with_tag ).
    """
    key   = _load_key()
    nonce = os.urandom(_NONCE_BYTES)
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct_with_tag).decode("ascii")


def decrypt(ciphertext_b64: str) -> str:
    """
    Decrypt a ciphertext produced by encrypt().
    Returns the original UTF-8 plaintext.
    Raises cryptography.exceptions.InvalidTag if the data has been tampered with.

    IMPORTANT: never log or expose the return value.
    """
    key  = _load_key()
    raw  = base64.b64decode(ciphertext_b64)
    nonce       = raw[:_NONCE_BYTES]
    ct_with_tag = raw[_NONCE_BYTES:]
    aesgcm  = AESGCM(key)
    return aesgcm.decrypt(nonce, ct_with_tag, None).decode("utf-8")
