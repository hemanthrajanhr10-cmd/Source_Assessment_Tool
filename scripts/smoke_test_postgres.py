"""
PostgreSQL Assessment — Comprehensive Smoke Test
=================================================
Tests every layer of the PostgreSQL assessment stack:

  1.  Platform detection (on-prem / HCM, Azure, AWS, GCP IP, GCP Cloud SQL name,
      Supabase, Neon, local)
  2.  SSL mode selection per platform
  3.  GCP Cloud SQL: ADC error formatting
  4.  GCP Cloud SQL: SA key JSON validation
  5.  Query module completeness — all _STEP_KEYS have a PG attribute
  6.  New extra queries present (PG_EXTENSIONS, PG_TRIGGERS, etc.)
  7.  BACKUP_HISTORY compatibility (no archiver_enabled)
  8.  gcp_sa_key forwarded in gateway payload
  9.  Assessment results model has new PG fields
 10.  _SECTION_CONFIG has new PG entries in azure_store
 11.  Live connection — GCP Cloud SQL (requires --sa-key or ADC configured)
 12.  Live connection — direct psycopg2 (requires --host / env vars)

Usage:
  cd c:\\Users\\hemanth.rajan\\Documents\\Source_Assessment_Tool
  python scripts/smoke_test_postgres.py

  # Live GCP test with SA key:
  python scripts/smoke_test_postgres.py --sa-key path/to/key.json

  # Live direct psycopg2 test (on-prem / cloud with public IP):
  python scripts/smoke_test_postgres.py \\
      --host mydb.rds.amazonaws.com --port 5432 \\
      --dbname mydb --user myuser --password s3cr3t

  # Azure PostgreSQL:
  python scripts/smoke_test_postgres.py \\
      --host myserver.postgres.database.azure.com \\
      --dbname postgres --user adminuser@myserver --password s3cr3t

Environment variables (alternative to CLI flags):
  PG_HOST, PG_PORT, PG_DBNAME, PG_USER, PG_PASSWORD
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# ── Colours ───────────────────────────────────────────────────────────────────

PASS  = "\033[92mPASS\033[0m"
FAIL  = "\033[91mFAIL\033[0m"
INFO  = "\033[94mINFO\033[0m"
SKIP  = "\033[93mSKIP\033[0m"
WARN  = "\033[93mWARN\033[0m"

_total = _passed = _failed = 0


def check(label: str, condition: bool, detail: str = "") -> bool:
    global _total, _passed, _failed
    _total += 1
    if condition:
        _passed += 1
        icon = PASS
    else:
        _failed += 1
        icon = FAIL
    suffix = f"  ({detail})" if detail else ""
    print(f"  [{icon}] {label}{suffix}")
    return condition


def skip(label: str, reason: str = "") -> None:
    global _total
    _total += 1
    suffix = f"  — {reason}" if reason else ""
    print(f"  [{SKIP}] {label}{suffix}")


# ── 1. Platform detection ─────────────────────────────────────────────────────

print("\n=== 1. Platform Detection ===")
from app.db.connector import _detect_pg_platform, _is_cloud_sql_instance_name, _ssl_mode

PLATFORM_CASES = [
    # (server,                                        expect_platform,            expect_ssl)
    ("myproject:us-central1:my-instance",            "gcp_cloud_sql_connector",  None),
    ("34.120.50.1",                                  "onprem",                   "prefer"),
    ("myserver.postgres.database.azure.com",         "managed_cloud",            "require"),
    ("mydb.cluster-xxx.us-east-1.rds.amazonaws.com", "managed_cloud",            "require"),
    ("mydb.abcd.us-east-1.rds.amazonaws.com",        "managed_cloud",            "require"),
    ("db.abc123.supabase.co",                        "managed_cloud",            "require"),
    ("ep-xxx.us-east-2.aws.neon.tech",               "managed_cloud",            "require"),
    ("cluster.xxx.cockroachlabs.cloud",              "managed_cloud",            "require"),
    ("pg-xxx.aivencloud.com",                        "managed_cloud",            "require"),
    ("xxx.railway.app",                              "managed_cloud",            "require"),
    ("dpg-xxx.render.com",                           "managed_cloud",            "require"),
    ("xxx.tsdb.io",                                  "managed_cloud",            "require"),
    ("xxx.db.elephantsql.com",                       "managed_cloud",            "require"),
    ("ec2-xxx.compute-1.amazonaws.com",              "managed_cloud",            "require"),
    ("ec2-xxx.compute.amazonaws.com",                "managed_cloud",            "require"),
    ("pgserver.corp.local",                          "onprem",                   "prefer"),
    ("192.168.1.10",                                 "local",                    "prefer"),
    ("10.0.0.5",                                     "local",                    "prefer"),
    ("172.16.0.1",                                   "local",                    "prefer"),
    ("localhost",                                    "local",                    "prefer"),
    ("127.0.0.1",                                    "local",                    "prefer"),
    ("::1",                                          "local",                    "prefer"),
]

for server, exp_platform, exp_ssl in PLATFORM_CASES:
    got = _detect_pg_platform(server)
    ok = (got == exp_platform)
    detail = f"got={got!r}"
    if exp_ssl:
        got_ssl = _ssl_mode(got)
        ok = ok and (got_ssl == exp_ssl)
        detail += f" ssl={got_ssl!r}"
    check(f"detect({server[:45]!r})", ok, detail)


# ── 2. GCP Cloud SQL instance name detection ──────────────────────────────────

print("\n=== 2. GCP Cloud SQL Instance Name Detection ===")
CS_CASES = [
    ("myproj:us-central1:mydb",  True),
    ("myproj:us-east1:mydb",     True),
    ("sat-db-497517:us-central1:postgre-v1", True),
    ("34.120.50.1",              False),
    ("not:valid",                False),   # only 2 parts
    ("a:b:c:d",                  False),   # 4 parts
    ("",                         False),
]
for s, expected in CS_CASES:
    got = _is_cloud_sql_instance_name(s)
    check(f"is_cloud_sql_name({s!r})", got == expected, f"got={got}")


# ── 3. ADC error formatting ───────────────────────────────────────────────────

print("\n=== 3. GCP ADC Error Formatting ===")
from app.db.connector import _raise_adc_error

adc_errors = [
    RuntimeError("Could not automatically determine credentials."),
    RuntimeError("Application Default Credentials not found."),
    RuntimeError("unable to detect credentials in the environment"),
    Exception("DefaultCredentialsError: foo"),
    RuntimeError("default credentials not available"),
]
for exc in adc_errors:
    try:
        _raise_adc_error(exc)
        check(f"formats {str(exc)[:40]!r}", False, "no exception raised")
    except RuntimeError as e:
        ok = "GCP Cloud SQL requires authentication" in str(e)
        check(f"formats {str(exc)[:40]!r}", ok, str(e)[:60])

# Non-credential error must re-raise as-is
try:
    _raise_adc_error(ValueError("unrelated error"))
    check("re-raises non-credential error", False, "no exception")
except ValueError as e:
    check("re-raises non-credential error", str(e) == "unrelated error")
except RuntimeError:
    check("re-raises non-credential error", False, "wrongly formatted")


# ── 4. SA key JSON validation ─────────────────────────────────────────────────

print("\n=== 4. SA Key JSON Validation ===")
from pydantic import SecretStr
from app.models.requests import ConnectionParams
from app.db.connector import _connect_postgres_cloud_sql

bad_key_params = ConnectionParams(
    db_type="postgres",
    server="myproject:us-central1:myinstance",
    port=5432,
    database="postgres",
    username="sa",
    password=SecretStr("pass"),
    gcp_sa_key="this is not valid json {{{{",
)
try:
    _connect_postgres_cloud_sql(bad_key_params)
    check("invalid JSON raises ValueError", False, "no exception")
except ValueError as e:
    check("invalid JSON raises ValueError",
          "Invalid GCP service account key JSON" in str(e), str(e)[:60])
except Exception as e:
    check("invalid JSON raises ValueError", False, f"{type(e).__name__}: {e}")


# ── 5. Query module completeness ──────────────────────────────────────────────

print("\n=== 5. Query Module — All _STEP_KEYS Have a PG Attribute ===")
from app.services.assessment_service import _STEP_KEYS
from app.db import queries_postgres

missing = []
for key, attr, display, _lvl in _STEP_KEYS:
    if not hasattr(queries_postgres, attr):
        missing.append(attr)

check(
    "All query attributes present in queries_postgres",
    len(missing) == 0,
    f"missing: {missing}" if missing else "all present",
)


# ── 6. New extra queries present ──────────────────────────────────────────────

print("\n=== 6. New PostgreSQL-Specific Queries Present ===")
NEW_ATTRS = [
    "PG_EXTENSIONS",
    "PG_TRIGGERS",
    "PG_SEQUENCES",
    "PG_PARTITIONS",
    "PG_MATVIEWS",
    "PG_TABLE_BLOAT",
    "PG_CONNECTION_STATS",
]
for attr in NEW_ATTRS:
    present = hasattr(queries_postgres, attr)
    val     = getattr(queries_postgres, attr, "")
    non_empty = bool(val.strip()) if isinstance(val, str) else False
    check(f"queries_postgres.{attr} present and non-empty", present and non_empty)


# ── 7. BACKUP_HISTORY compatibility ──────────────────────────────────────────

print("\n=== 7. BACKUP_HISTORY No Longer Uses archiver_enabled ===")
bh = queries_postgres.BACKUP_HISTORY
check(
    "BACKUP_HISTORY does not reference archiver_enabled",
    "archiver_enabled" not in bh,
    "found archiver_enabled — incompatible with PG < 14" if "archiver_enabled" in bh else "OK",
)
check(
    "BACKUP_HISTORY references archived_count (PG 9.4+ column)",
    "archived_count" in bh,
)


# ── 8. gcp_sa_key forwarded in gateway payload ────────────────────────────────

print("\n=== 8. gcp_sa_key Forwarded in Gateway Payload ===")
import ast, pathlib

route_src = pathlib.Path(
    "app/api/v1/routes/assessment.py"
).read_text(encoding="utf-8")

check(
    "assessment.py gateway payload includes gcp_sa_key",
    '"gcp_sa_key"' in route_src and "body.connection.gcp_sa_key" in route_src,
    "key found" if '"gcp_sa_key"' in route_src else "MISSING from gateway payload",
)
check(
    "assessment.py gateway payload includes access_level",
    '"access_level"' in route_src and "body.access_level" in route_src,
)


# ── 9. AssessmentResults model has new PG fields ──────────────────────────────

print("\n=== 9. AssessmentResults Model Has New PG Fields ===")
from app.models.responses import AssessmentResults

NEW_FIELDS = [
    "pg_extensions", "pg_triggers", "pg_sequences", "pg_partitions",
    "pg_matviews", "pg_table_bloat", "pg_connection_stats",
]
for field in NEW_FIELDS:
    check(f"AssessmentResults.{field} exists", field in AssessmentResults.model_fields)


# ── 10. _SECTION_CONFIG has new PG entries ────────────────────────────────────

print("\n=== 10. _SECTION_CONFIG Has New PG Entries ===")
from app.db.azure_store import _SECTION_CONFIG

for section in NEW_FIELDS:
    check(f"_SECTION_CONFIG['{section}'] present", section in _SECTION_CONFIG)


# ── 11. schema.sql has new PG tables ─────────────────────────────────────────

print("\n=== 11. schema.sql Has New PG DDL Tables ===")
schema_sql = pathlib.Path("app/db/schema.sql").read_text(encoding="utf-8")

for section in NEW_FIELDS:
    table = _SECTION_CONFIG[section][0] if section in _SECTION_CONFIG else None
    if table:
        check(
            f"DDL for dbo.{table} in schema.sql",
            table in schema_sql,
        )
    else:
        skip(f"DDL check for {section}", "not in _SECTION_CONFIG")


# ── 12. Live GCP Cloud SQL connection ─────────────────────────────────────────

print("\n=== 12. Live GCP Cloud SQL Connection (optional) ===")

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--sa-key",   metavar="FILE", help="Path to GCP SA key JSON")
parser.add_argument("--gcp-instance", default="sat-db-497517:us-central1:postgre-v1")
parser.add_argument("--gcp-user",     default="yuki-19")
parser.add_argument("--gcp-password", default="Yuki@2003")
parser.add_argument("--host",     help="Direct psycopg2 host")
parser.add_argument("--port",     type=int, default=5432)
parser.add_argument("--dbname",   default="postgres")
parser.add_argument("--user",     help="Direct psycopg2 user")
parser.add_argument("--password", help="Direct psycopg2 password")
args, _ = parser.parse_known_args()

# Override from environment variables if not passed on CLI
host     = args.host     or os.environ.get("PG_HOST")
user     = args.user     or os.environ.get("PG_USER")
password = args.password or os.environ.get("PG_PASSWORD")
dbname   = args.dbname   or os.environ.get("PG_DBNAME", "postgres")
port     = args.port     or int(os.environ.get("PG_PORT", "5432"))

sa_key_json = None
if args.sa_key:
    sa_key_json = pathlib.Path(args.sa_key).read_text(encoding="utf-8")
    print(f"  [{INFO}] Using SA key: {args.sa_key}")

# GCP Cloud SQL path
if sa_key_json or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
    params = ConnectionParams(
        db_type="postgres",
        server=args.gcp_instance,
        port=5432,
        database=dbname,
        username=args.gcp_user,
        password=SecretStr(args.gcp_password),
        gcp_sa_key=sa_key_json,
    )
    try:
        conn = _connect_postgres_cloud_sql(params)
        cur = conn.cursor()
        cur.execute("SELECT current_database(), current_user, version()")
        row = cur.fetchone()
        cur.close()
        conn.close()
        check(
            f"Live GCP Cloud SQL: {args.gcp_instance}",
            True,
            f"db={row[0]}, user={row[1]}, pg={row[2][:40]}",
        )
    except RuntimeError as e:
        if "GCP Cloud SQL requires authentication" in str(e):
            print(f"  [{INFO}] ADC/SA key not configured — expected without SA key.")
        else:
            check(f"Live GCP Cloud SQL: {args.gcp_instance}", False, str(e)[:80])
    except Exception as e:
        check(f"Live GCP Cloud SQL: {args.gcp_instance}", False, f"{type(e).__name__}: {e}")
else:
    skip("Live GCP Cloud SQL", "pass --sa-key or set GOOGLE_APPLICATION_CREDENTIALS")


# ── 13. Live direct psycopg2 connection (all cloud types + on-prem) ───────────

print("\n=== 13. Live Direct PostgreSQL Connection (optional) ===")

if host and user and password:
    params = ConnectionParams(
        db_type="postgres",
        server=host,
        port=port,
        database=dbname,
        username=user,
        password=SecretStr(password),
    )
    platform = _detect_pg_platform(host)
    ssl      = _ssl_mode(platform)
    print(f"  [{INFO}] host={host}  platform={platform}  sslmode={ssl}")
    try:
        from app.db.connector import _connect_postgres_direct
        conn = _connect_postgres_direct(params, sslmode=ssl)
        cur = conn.cursor()
        cur.execute("SELECT current_database(), current_user, version()")
        row = cur.fetchone()

        # Run all 7 new extra queries
        NEW_QUERY_ATTRS = [
            ("PG_EXTENSIONS",    "pg_extensions"),
            ("PG_TRIGGERS",      "pg_triggers"),
            ("PG_SEQUENCES",     "pg_sequences"),
            ("PG_PARTITIONS",    "pg_partitions"),
            ("PG_MATVIEWS",      "pg_matviews"),
            ("PG_TABLE_BLOAT",   "pg_table_bloat"),
            ("PG_CONNECTION_STATS", "pg_connection_stats"),
        ]
        for attr_name, section in NEW_QUERY_ATTRS:
            sql = getattr(queries_postgres, attr_name, None)
            if sql:
                try:
                    cur.execute(sql)
                    rows = cur.fetchall()
                    check(
                        f"Extra query {attr_name} executes successfully",
                        True,
                        f"{len(rows)} rows",
                    )
                except Exception as qe:
                    check(f"Extra query {attr_name} executes successfully", False, str(qe)[:80])

        cur.close()
        conn.close()
        check(
            f"Live psycopg2 → {host}:{port}/{dbname}",
            True,
            f"db={row[0]}, user={row[1]}, pg={row[2][:40]}",
        )
    except Exception as e:
        check(f"Live psycopg2 → {host}:{port}/{dbname}", False, f"{type(e).__name__}: {e}")
else:
    skip(
        "Live direct psycopg2 test",
        "pass --host / --user / --password  or set PG_HOST / PG_USER / PG_PASSWORD",
    )


# ── Summary ───────────────────────────────────────────────────────────────────

print(f"\n{'='*60}")
print(f"  Total: {_total}  |  Passed: {_passed}  |  Failed: {_failed}")
status = "ALL PASSED" if _failed == 0 else f"{_failed} FAILED"
colour = "\033[92m" if _failed == 0 else "\033[91m"
print(f"  {colour}{status}\033[0m")
print(f"{'='*60}\n")

sys.exit(0 if _failed == 0 else 1)
