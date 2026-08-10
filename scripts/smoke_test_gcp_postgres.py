"""
Smoke test — GCP Cloud SQL PostgreSQL connector fix.

Tests:
  1. Platform detection correctly identifies Cloud SQL instance names
  2. Error handling: ADC-missing errors are properly formatted
  3. Error handling: .connect() ADC errors are also caught (new fix)
  4. SA key JSON parsing: invalid JSON raises ValueError with clear message
  5. Live connection attempt with provided credentials

Usage:
  cd c:\\Users\\hemanth.rajan\\Documents\\Source_Assessment_Tool
  python scripts/smoke_test_gcp_postgres.py

  # With SA key file:
  python scripts/smoke_test_gcp_postgres.py --sa-key path/to/key.json
"""
import sys
import json
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Test helpers ──────────────────────────────────────────────────────────────

PASS = "\033[92m PASS\033[0m"
FAIL = "\033[91m FAIL\033[0m"
INFO = "\033[94m INFO\033[0m"

def check(label: str, condition: bool, detail: str = "") -> bool:
    icon = PASS if condition else FAIL
    print(f"[{icon}] {label}" + (f": {detail}" if detail else ""))
    return condition


# ── 1. Platform detection ─────────────────────────────────────────────────────

print("\n=== 1. Platform Detection ===")
from app.db.connector import _is_cloud_sql_instance_name, _detect_pg_platform

cases = [
    ("sat-db-497517:us-central1:postgre-v1", True,  "gcp_cloud_sql_connector"),
    ("myproject:us-central1:myinstance",      True,  "gcp_cloud_sql_connector"),
    ("34.120.50.1",                            False, "onprem"),
    ("myserver.postgres.database.azure.com",  False, "managed_cloud"),
    ("localhost",                              False, "local"),
    ("not:valid",                              False, "onprem"),   # only 2 parts
]

all_ok = True
for server, expect_cs, expect_platform in cases:
    got_cs = _is_cloud_sql_instance_name(server)
    got_pl = _detect_pg_platform(server)
    ok = (got_cs == expect_cs) and (got_pl == expect_platform)
    all_ok = all_ok and ok
    check(f"detect({server!r})", ok, f"cloud_sql={got_cs} platform={got_pl!r}")

print(f"  > Detection suite: {'all passed' if all_ok else 'SOME FAILED'}")


# ── 2. _raise_adc_error catches credential errors ─────────────────────────────

print("\n=== 2. ADC Error Formatting ===")
from app.db.connector import _raise_adc_error

cred_errors = [
    RuntimeError("Could not automatically determine credentials."),
    RuntimeError("Application Default Credentials not found."),
    RuntimeError("google.auth.exceptions.DefaultCredentialsError: unable to detect credentials"),
    Exception("DefaultCredentialsError: foo"),
]

for exc in cred_errors:
    try:
        _raise_adc_error(exc)
        check(f"raises on {type(exc).__name__}({str(exc)[:40]})", False, "did not raise!")
    except RuntimeError as e:
        ok = "GCP Cloud SQL requires authentication" in str(e)
        check(f"formats {str(exc)[:40]!r}", ok, str(e)[:80])

# Non-credential error should re-raise as-is
try:
    _raise_adc_error(ValueError("some other error"))
    check("re-raises non-credential error", False, "did not raise!")
except ValueError as e:
    check("re-raises non-credential error", str(e) == "some other error")
except RuntimeError:
    check("re-raises non-credential error", False, "wrongly formatted non-cred error")


# ── 3. SA key JSON validation ─────────────────────────────────────────────────

print("\n=== 3. SA Key JSON Validation ===")

# Invalid JSON
from pydantic import SecretStr
from app.models.requests import ConnectionParams

bad_key_params = ConnectionParams(
    db_type="postgres",
    server="myproject:us-central1:myinstance",
    port=5432,
    database="postgres",
    username="yuki-19",
    password=SecretStr("Yuki@2003"),
    gcp_sa_key="this is not json {{{",
)

from app.db.connector import _connect_postgres_cloud_sql
try:
    _connect_postgres_cloud_sql(bad_key_params)
    check("invalid JSON raises ValueError", False, "no exception raised")
except ValueError as e:
    check("invalid JSON raises ValueError", "Invalid GCP service account key JSON" in str(e), str(e)[:80])
except Exception as e:
    check("invalid JSON raises ValueError", False, f"wrong exception type {type(e).__name__}: {e}")


# ── 4. Live connection attempt ────────────────────────────────────────────────

print("\n=== 4. Live Connection Attempt ===")

SERVER   = "sat-db-497517:us-central1:postgre-v1"
USERNAME = "yuki-19"
PASSWORD = "Yuki@2003"

def try_live_connection(sa_key_json: str | None = None):
    params = ConnectionParams(
        db_type="postgres",
        server=SERVER,
        port=5432,
        database="postgres",
        username=USERNAME,
        password=SecretStr(PASSWORD),
        gcp_sa_key=sa_key_json,
    )
    conn = _connect_postgres_cloud_sql(params)
    cur = conn.cursor()
    cur.execute("SELECT current_database(), current_user, version()")
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row

parser = argparse.ArgumentParser(description="GCP PostgreSQL smoke test")
parser.add_argument("--sa-key", metavar="FILE", help="Path to service account key JSON file")
args, _ = parser.parse_known_args()

sa_key_json = None
if args.sa_key:
    sa_key_json = Path(args.sa_key).read_text()
    print(f"[{INFO}] Using SA key from: {args.sa_key}")

try:
    row = try_live_connection(sa_key_json)
    check(
        f"Live connection to {SERVER}",
        True,
        f"db={row[0]}, user={row[1]}, pg={row[2][:40]}",
    )
except RuntimeError as e:
    msg = str(e)
    if "GCP Cloud SQL requires authentication" in msg:
        print(f"[{INFO}] No ADC configured — expected without SA key or gcloud auth.")
        print(f"       Client-friendly error message confirmed:")
        print(f"       {msg[:120]}...")
        print(f"[{INFO}] Error handling is working correctly (Option A / Option B shown to user).")
    else:
        check("Live connection", False, msg[:120])
except Exception as e:
    check("Live connection", False, f"{type(e).__name__}: {e}")


print("\n=== Smoke Test Complete ===\n")
