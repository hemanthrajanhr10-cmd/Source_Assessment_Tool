"""
Shared Azure AD token helpers for Partner Admin Link (PAL) features.

The actual PAL linking is done via a PowerShell subprocess — see
`app.services.pal_powershell_service`. This module only decodes tenant
claims from the (unrelated) Fabric sign-in token, used to seed a new
assessment's PAL status if that client tenant is already linked.
"""

from typing import Optional

from jose import JWTError, jwt


def decode_tenant_id(aad_access_token: str) -> Optional[str]:
    """Best-effort tenant extraction from any Azure AD access token's `tid` claim."""
    try:
        claims = jwt.get_unverified_claims(aad_access_token)
        return claims.get("tid")
    except JWTError:
        return None
