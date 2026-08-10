"""
Sage Intacct assessment request and response models.

Connectivity: XML-based Web Services API over HTTPS
  - Endpoint: https://api.intacct.com/ia/xml/xmlgw.php
  - Auth: Sender credentials (Web Services) + Company/User login
"""

from typing import Literal, Optional
from pydantic import BaseModel, SecretStr, Field


# ── Connection parameters ─────────────────────────────────────────────────────

class SageIntacctCredentials(BaseModel):
    """Credentials for Sage Intacct Web Services API."""
    company_id: str = Field(..., description="Sage Intacct Company ID")
    user_id: str = Field(..., description="Sage Intacct User ID (login name)")
    user_password: SecretStr = Field(..., description="Sage Intacct user password")
    sender_id: str = Field(..., description="Web Services Sender ID (from subscription)")
    sender_password: SecretStr = Field(..., description="Web Services Sender Password")
    entity_id: Optional[str] = Field(None, description="Entity ID for multi-entity companies (leave blank for top-level)")


class SageIntacctAssessmentRequest(BaseModel):
    """Create a Sage Intacct assessment job."""
    credentials: SageIntacctCredentials
    label: Optional[str] = Field(None, description="Human-readable label for this assessment")
    include_transaction_details: bool = Field(
        True, description="Include AR/AP invoice counts and GL volume metrics"
    )
    include_custom_objects: bool = Field(
        True, description="Enumerate platform extensions and custom dimensions"
    )


# ── Assessment result models ──────────────────────────────────────────────────

class SageCompanyProfile(BaseModel):
    company_id: str
    company_name: str
    entity_count: int
    base_currency: str
    fiscal_year_end_month: int
    timezone: str
    subscription_plan: str
    modules_enabled: list[str]


class SageUserProfile(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    admin_users: int
    role_count: int
    permission_groups: int


class SageChartOfAccounts(BaseModel):
    total_accounts: int
    active_accounts: int
    asset_accounts: int
    liability_accounts: int
    equity_accounts: int
    revenue_accounts: int
    expense_accounts: int
    other_accounts: int
    account_groups: int


class SageFinancialDimensions(BaseModel):
    department_count: int
    location_count: int
    class_count: int
    project_count: int
    customer_count: int
    vendor_count: int
    employee_count: int
    warehouse_count: int
    item_count: int


class SageTransactionVolumes(BaseModel):
    open_ar_invoices: int
    closed_ar_invoices: int
    total_ar_invoices: int
    open_ap_bills: int
    closed_ap_bills: int
    total_ap_bills: int
    gl_journal_entries: int
    purchase_orders: int
    sales_orders: int
    contracts: int
    expense_reports: int


class SageCashManagement(BaseModel):
    checking_accounts: int
    savings_accounts: int
    credit_card_accounts: int
    total_bank_accounts: int


class SageFixedAssets(BaseModel):
    total_assets: int
    active_assets: int
    disposed_assets: int
    depreciation_methods: list[str]


class SageCustomization(BaseModel):
    custom_dimensions: int
    platform_extensions: int
    user_defined_fields: int
    custom_report_count: int
    smart_rules_count: int
    smart_events_count: int


class SageIntegrationHealth(BaseModel):
    web_services_version: str
    api_endpoint: str
    session_timeout_minutes: int
    multi_entity_enabled: bool
    consolidation_enabled: bool


class SageDataQualityFlags(BaseModel):
    vendors_without_gl_account: int
    customers_without_terms: int
    open_invoices_past_due: int
    accounts_with_no_activity_days: int
    duplicate_vendor_names: int
    unposted_journal_entries: int


# ── Top-level assessment result ───────────────────────────────────────────────

class SageIntacctAssessmentResult(BaseModel):
    job_id: str
    label: Optional[str] = None
    assessed_at: str
    status: Literal["completed", "failed"]
    error: Optional[str] = None

    company_profile: Optional[SageCompanyProfile] = None
    user_profile: Optional[SageUserProfile] = None
    chart_of_accounts: Optional[SageChartOfAccounts] = None
    financial_dimensions: Optional[SageFinancialDimensions] = None
    transaction_volumes: Optional[SageTransactionVolumes] = None
    cash_management: Optional[SageCashManagement] = None
    fixed_assets: Optional[SageFixedAssets] = None
    customization: Optional[SageCustomization] = None
    integration_health: Optional[SageIntegrationHealth] = None
    data_quality: Optional[SageDataQualityFlags] = None


# ── Job response models ───────────────────────────────────────────────────────

class SageIntacctJobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class SageIntacctJobStatusResponse(BaseModel):
    job_id: str
    status: str
    label: Optional[str] = None
    progress_message: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class SageIntacctSessionRecord(BaseModel):
    job_id: str
    label: Optional[str] = None
    status: str
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    results: Optional[SageIntacctAssessmentResult] = None
