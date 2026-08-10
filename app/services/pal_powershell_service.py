"""
Azure Partner Admin Link (PAL) linking — driven by a PowerShell subprocess.

The client signs in with their own Azure AD account via Az.Accounts'
device-code flow (`Connect-AzAccount -UseDeviceAuthentication`) — no token
ever passes through our frontend or backend. Once signed in, the same
PowerShell session runs Az.ManagementPartner cmdlets to associate UBTI's
Partner ID with the client's tenant.
"""

import json
import re
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

# In-memory PAL device-code link sessions, keyed by ps_auth_id (UUID string).
# status: 'starting' | 'waiting_for_user' | 'linking' | 'linked' | 'failed'
_PS_AUTH: dict[str, dict[str, Any]] = {}
_PS_AUTH_LOCK = threading.Lock()

_DEVICE_CODE_RE = re.compile(r"open the page (\S+) and enter the code (\S+)", re.IGNORECASE)
_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
_RESULT_PREFIX = "PAL_RESULT_JSON:"

# Safety net only — Connect-AzAccount's own device-code expiry (~15 min)
# normally ends the process well before this fires.
_HARD_TIMEOUT_SECONDS = 20 * 60

_SCRIPT_TEMPLATE = r"""
param(
    [Parameter(Mandatory=$true)][string]$PartnerId
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:NO_COLOR = '1'
if ($PSStyle) { $PSStyle.OutputRendering = 'PlainText' }

function Emit-Result($obj) {
    Write-Output ("PAL_RESULT_JSON:" + ($obj | ConvertTo-Json -Compress -Depth 5))
}

try {
    if (-not (Get-Module -ListAvailable -Name Az.Accounts)) {
        Install-Module -Name Az.Accounts -Scope CurrentUser -Force -Repository PSGallery -ErrorAction Stop
    }
    if (-not (Get-Module -ListAvailable -Name Az.ManagementPartner)) {
        Install-Module -Name Az.ManagementPartner -Scope CurrentUser -Force -Repository PSGallery -ErrorAction Stop
    }
    Import-Module Az.Accounts -Force
    Import-Module Az.ManagementPartner -Force
} catch {
    Emit-Result @{ success = $false; stage = 'module_setup'; error = $_.Exception.Message }
    exit 1
}

try {
    Connect-AzAccount -UseDeviceAuthentication -ErrorAction Stop | Out-Null
} catch {
    Emit-Result @{ success = $false; stage = 'auth'; error = $_.Exception.Message }
    exit 1
}

try {
    $tenantId = (Get-AzContext).Tenant.Id

    $existing = $null
    try { $existing = Get-AzManagementPartner -ErrorAction Stop } catch { $existing = $null }

    if ($existing -and [string]$existing.PartnerId -eq $PartnerId) {
        # Already linked to this partner id — nothing to change.
    } elseif ($existing) {
        Update-AzManagementPartner -PartnerId $PartnerId -ErrorAction Stop | Out-Null
    } else {
        New-AzManagementPartner -PartnerId $PartnerId -ErrorAction Stop | Out-Null
    }

    Emit-Result @{ success = $true; stage = 'linked'; tenant_id = $tenantId; partner_id = $PartnerId }
} catch {
    $tid = $null
    try { $tid = (Get-AzContext).Tenant.Id } catch {}
    Emit-Result @{ success = $false; stage = 'link'; error = $_.Exception.Message; tenant_id = $tid }
    exit 1
}
"""


def classify_powershell_error(stage: Optional[str], message: str) -> str:
    """Map a PowerShell/Az failure to one of the four PalFailureReason values."""
    text = (message or "").lower()
    if "forbidden" in text or "authorizationfailed" in text or "does not have authorization" in text:
        return "access_not_granted"
    if stage == "auth" or "aadsts" in text or "expired" in text or "device code" in text:
        return "auth_error"
    if "tenant" in text and ("mismatch" in text or "not found" in text or "invalid" in text):
        return "wrong_tenant"
    return "unknown"


def _resolve_shell() -> str:
    return "pwsh" if shutil.which("pwsh") else "powershell.exe"


def get_session(ps_auth_id: str) -> Optional[dict[str, Any]]:
    with _PS_AUTH_LOCK:
        sess = _PS_AUTH.get(ps_auth_id)
        return dict(sess) if sess else None


def start_link_session(ps_auth_id: str, partner_id: str) -> None:
    """Blocking — meant to be run in a background thread."""
    with _PS_AUTH_LOCK:
        _PS_AUTH[ps_auth_id] = {"status": "starting", "user_code": None, "verification_url": None, "process": None}

    script_file = tempfile.NamedTemporaryFile(mode="w", suffix=".ps1", delete=False, encoding="utf-8")
    try:
        script_file.write(_SCRIPT_TEMPLATE)
        script_file.close()

        shell = _resolve_shell()
        cmd = [shell, "-NoLogo", "-NonInteractive", "-File", script_file.name, "-PartnerId", partner_id]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        with _PS_AUTH_LOCK:
            if ps_auth_id not in _PS_AUTH:
                proc.kill()
                return
            _PS_AUTH[ps_auth_id]["process"] = proc

        killer = threading.Timer(_HARD_TIMEOUT_SECONDS, _force_kill, args=(proc,))
        killer.daemon = True
        killer.start()

        result: Optional[dict[str, Any]] = None
        try:
            for raw_line in proc.stdout:
                line = _ANSI_ESCAPE_RE.sub("", raw_line.rstrip("\n"))
                if not line:
                    continue
                logger.debug("PAL powershell [%s]: %s", ps_auth_id, line)

                if line.startswith(_RESULT_PREFIX):
                    try:
                        result = json.loads(line[len(_RESULT_PREFIX):])
                    except json.JSONDecodeError:
                        result = {"success": False, "stage": "parse", "error": "Could not parse PowerShell result"}
                    continue

                match = _DEVICE_CODE_RE.search(line)
                if match:
                    with _PS_AUTH_LOCK:
                        if ps_auth_id in _PS_AUTH:
                            _PS_AUTH[ps_auth_id].update({
                                "status": "waiting_for_user",
                                "verification_url": match.group(1),
                                "user_code": match.group(2),
                                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
                            })
        finally:
            killer.cancel()
            proc.wait(timeout=10)

        with _PS_AUTH_LOCK:
            if ps_auth_id not in _PS_AUTH:
                return
            if result and result.get("success"):
                _PS_AUTH[ps_auth_id].update({
                    "status": "linked",
                    "tenant_id": result.get("tenant_id"),
                })
            elif result:
                _PS_AUTH[ps_auth_id].update({
                    "status": "failed",
                    "tenant_id": result.get("tenant_id"),
                    "failure_reason": classify_powershell_error(result.get("stage"), result.get("error", "")),
                    "error_detail": result.get("error"),
                })
            else:
                _PS_AUTH[ps_auth_id].update({
                    "status": "failed",
                    "failure_reason": "unknown",
                    "error_detail": "PowerShell process ended without a result.",
                })

    except FileNotFoundError:
        logger.error("PAL link failed — PowerShell (%s) not found on PATH", _resolve_shell())
        with _PS_AUTH_LOCK:
            if ps_auth_id in _PS_AUTH:
                _PS_AUTH[ps_auth_id].update({
                    "status": "failed",
                    "failure_reason": "unknown",
                    "error_detail": "PowerShell is not installed on the server.",
                })
    except Exception as exc:
        logger.error("PAL link session %s crashed: %s", ps_auth_id, exc)
        with _PS_AUTH_LOCK:
            if ps_auth_id in _PS_AUTH:
                _PS_AUTH[ps_auth_id].update({
                    "status": "failed",
                    "failure_reason": "unknown",
                    "error_detail": str(exc),
                })
    finally:
        try:
            Path(script_file.name).unlink(missing_ok=True)
        except Exception:
            pass


def _force_kill(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        logger.warning("PAL powershell process %s exceeded hard timeout — killing", proc.pid)
        proc.kill()


def cancel_link_session(ps_auth_id: str) -> bool:
    with _PS_AUTH_LOCK:
        sess = _PS_AUTH.get(ps_auth_id)
        if not sess:
            return False
        proc: Optional[subprocess.Popen] = sess.get("process")
        _PS_AUTH.pop(ps_auth_id, None)
    if proc and proc.poll() is None:
        proc.kill()
    return True
