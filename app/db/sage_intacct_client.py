"""
Sage Intacct XML Web Services API client.

Sends XML requests to https://api.intacct.com/ia/xml/xmlgw.php
and parses the XML responses into Python dicts.

Authentication model:
  - Sender credentials (registered Web Services subscription): sender_id + sender_password
  - Company/user login: company_id + user_id + user_password
  - Optional: entity_id for multi-entity setups
"""

import uuid
import xml.etree.ElementTree as ET
from typing import Any, Optional
import requests


_ENDPOINT = "https://api.intacct.com/ia/xml/xmlgw.php"
_TIMEOUT = 30  # seconds


# ── XML builder helpers ───────────────────────────────────────────────────────

def _build_request_xml(
    sender_id: str,
    sender_password: str,
    company_id: str,
    user_id: str,
    user_password: str,
    functions: list[str],
    entity_id: Optional[str] = None,
    control_id: Optional[str] = None,
) -> str:
    """Build a complete Sage Intacct XML request envelope."""
    ctrl_id = control_id or str(uuid.uuid4())[:8]

    auth_block = (
        f"<login>"
        f"<userid>{user_id}</userid>"
        f"<companyid>{company_id}</companyid>"
        f"<password>{user_password}</password>"
        f"{'<locationid>' + entity_id + '</locationid>' if entity_id else ''}"
        f"</login>"
    )

    functions_block = "\n".join(functions)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>{sender_id}</senderid>
    <password>{sender_password}</password>
    <controlid>{ctrl_id}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      {auth_block}
    </authentication>
    <content>
      {functions_block}
    </content>
  </operation>
</request>"""


def _read_function(func_id: str, object_name: str, fields: list[str], filters: Optional[str] = None, page_size: int = 2000) -> str:
    """Build a <readByQuery> or <query> function block."""
    fields_xml = "".join(f"<field>{f}</field>" for f in fields)
    filter_block = f"<filter>{filters}</filter>" if filters else ""
    return f"""<function controlid="{func_id}">
      <query>
        <object>{object_name}</object>
        <select>{fields_xml}</select>
        {filter_block}
        <pagesize>{page_size}</pagesize>
      </query>
    </function>"""


def _count_function(func_id: str, object_name: str, filters: Optional[str] = None) -> str:
    """Build a count query function."""
    filter_block = f"<filter>{filters}</filter>" if filters else ""
    return f"""<function controlid="{func_id}">
      <query>
        <object>{object_name}</object>
        <select><field>RECORDNO</field></select>
        {filter_block}
        <pagesize>1</pagesize>
        <options><totalcount>true</totalcount></options>
      </query>
    </function>"""


def _get_function(func_id: str, object_name: str, fields: list[str]) -> str:
    """Build a getAll-style read function."""
    fields_xml = "".join(f"<field>{f}</field>" for f in fields)
    return f"""<function controlid="{func_id}">
      <readByQuery>
        <object>{object_name}</object>
        <fields>{','.join(fields)}</fields>
        <query></query>
        <pagesize>1000</pagesize>
      </readByQuery>
    </function>"""


# ── Response parsing ──────────────────────────────────────────────────────────

def _parse_response(xml_text: str) -> dict[str, Any]:
    """Parse Intacct XML response into {func_id: [rows]} dict."""
    root = ET.fromstring(xml_text)
    results: dict[str, Any] = {}

    # Check top-level status
    status_el = root.find(".//control/status")
    if status_el is not None and status_el.text == "failure":
        error_el = root.find(".//errormessage/error/description2")
        msg = error_el.text if error_el is not None else "Unknown API error"
        raise RuntimeError(f"Sage Intacct API error: {msg}")

    # Parse each function result
    for result in root.findall(".//result"):
        func_id_el = result.find("controlid")
        func_id = func_id_el.text if func_id_el is not None else "unknown"

        status_el = result.find("status")
        if status_el is not None and status_el.text == "failure":
            err = result.find(".//errormessage/error/description2")
            results[func_id] = {"error": err.text if err is not None else "function error"}
            continue

        # Count result
        total_count_el = result.find(".//listtype[@total]")
        if total_count_el is not None:
            results[func_id] = {"total": int(total_count_el.get("total", "0"))}
            continue

        # readByQuery data
        data_el = result.find("data")
        if data_el is not None:
            total_count = data_el.get("totalcount", "0")
            rows = []
            for child in data_el:
                row = {}
                for field_el in child:
                    row[field_el.tag] = field_el.text or ""
                rows.append(row)
            results[func_id] = {"rows": rows, "total": int(total_count)}
        else:
            results[func_id] = {}

    return results


# ── HTTP caller ───────────────────────────────────────────────────────────────

def call_api(
    sender_id: str,
    sender_password: str,
    company_id: str,
    user_id: str,
    user_password: str,
    functions: list[str],
    entity_id: Optional[str] = None,
) -> dict[str, Any]:
    """Send XML request to Sage Intacct and return parsed results."""
    xml_body = _build_request_xml(
        sender_id=sender_id,
        sender_password=sender_password,
        company_id=company_id,
        user_id=user_id,
        user_password=user_password,
        functions=functions,
        entity_id=entity_id,
    )

    response = requests.post(
        _ENDPOINT,
        data=xml_body.encode("utf-8"),
        headers={"Content-Type": "application/xml; encoding='UTF-8'"},
        timeout=_TIMEOUT,
    )
    response.raise_for_status()
    return _parse_response(response.text)


# ── Named query builders for each assessment dimension ───────────────────────

def query_company_info() -> str:
    return _get_function("company_info", "COMPANY", ["COMPANYNAME", "CURRENCY", "FISCALYEAREND", "TIMEZONE"])


def query_entities() -> str:
    return _count_function("entity_count", "LOCATION")


def query_users() -> str:
    return _get_function("users", "USERINFO", ["LOGINID", "USERTYPE", "STATUS", "ADMIN"])


def query_roles() -> str:
    return _count_function("role_count", "ROLES")


def query_gl_accounts() -> str:
    return _get_function("gl_accounts", "GLACCOUNT", ["ACCOUNTNO", "ACCOUNTTYPE", "STATUS", "NORMALBALANCE"])


def query_account_groups() -> str:
    return _count_function("account_group_count", "GLACCOUNTGROUP")


def query_departments() -> str:
    return _count_function("dept_count", "DEPARTMENT")


def query_locations() -> str:
    return _count_function("location_count", "LOCATION")


def query_classes() -> str:
    return _count_function("class_count", "CLASS")


def query_customers() -> str:
    return _count_function("customer_count", "CUSTOMER")


def query_vendors() -> str:
    return _count_function("vendor_count", "VENDOR")


def query_employees() -> str:
    return _count_function("employee_count", "EMPLOYEE")


def query_warehouses() -> str:
    return _count_function("warehouse_count", "WAREHOUSE")


def query_items() -> str:
    return _count_function("item_count", "ITEM")


def query_projects() -> str:
    return _count_function("project_count", "PROJECT")


def query_ar_invoices_open() -> str:
    return _count_function("ar_open", "ARINVOICE", "<equalto><field>STATE</field><value>Open</value></equalto>")


def query_ar_invoices_total() -> str:
    return _count_function("ar_total", "ARINVOICE")


def query_ap_bills_open() -> str:
    return _count_function("ap_open", "APBILL", "<equalto><field>STATE</field><value>Open</value></equalto>")


def query_ap_bills_total() -> str:
    return _count_function("ap_total", "APBILL")


def query_gl_entries() -> str:
    return _count_function("gl_total", "GLENTRY")


def query_purchase_orders() -> str:
    return _count_function("po_count", "PODOCUMENT")


def query_sales_orders() -> str:
    return _count_function("so_count", "SODOCUMENT")


def query_contracts() -> str:
    return _count_function("contract_count", "CONTRACT")


def query_expense_reports() -> str:
    return _count_function("expense_count", "EEXPENSES")


def query_checking_accounts() -> str:
    return _count_function("checking_count", "CHECKINGACCOUNT")


def query_savings_accounts() -> str:
    return _count_function("savings_count", "SAVINGSACCOUNT")


def query_credit_cards() -> str:
    return _count_function("cc_count", "CREDITCARDACCOUNT")


def query_fixed_assets() -> str:
    return _get_function("assets", "ASSET", ["ASSETID", "STATUS", "DEPRMETHOD"])


def query_custom_dimensions() -> str:
    return _count_function("custom_dim_count", "DIMENSIONVALUE")


def query_platform_extensions() -> str:
    return _count_function("platform_count", "PLATFORMEXTENSION")


def query_user_defined_fields() -> str:
    return _count_function("udf_count", "CUSTOMFIELD")


def query_custom_reports() -> str:
    return _count_function("report_count", "REPORT")


def query_smart_rules() -> str:
    return _count_function("smart_rule_count", "SMARTRULE")


def query_smart_events() -> str:
    return _count_function("smart_event_count", "SMARTEVENT")


def query_unposted_journals() -> str:
    return _count_function(
        "unposted_gl",
        "GLBATCH",
        "<equalto><field>STATE</field><value>Draft</value></equalto>"
    )


def query_overdue_ar() -> str:
    return _count_function(
        "overdue_ar",
        "ARINVOICE",
        "<and><equalto><field>STATE</field><value>Open</value></equalto>"
        "<lessthan><field>DUEDATE</field><value>today</value></lessthan></and>"
    )
