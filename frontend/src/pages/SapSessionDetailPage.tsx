import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Loader2, Clock, ArrowLeft,
  AlertCircle, Download, ChevronDown, ChevronUp,
  Server, Users, Database, Zap, Shield,
} from 'lucide-react'
import { api, getApiErrorMessage } from '../api/client'
import type {
  SapAssessmentResult,
  SapVariant,
} from '../types/api'
import { SAP_VARIANTS } from '../types/api'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function variantLabel(v: SapVariant) {
  return SAP_VARIANTS.find((m) => m.value === v)?.label ?? v
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string; text: string }> = {
    completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', text: 'Completed' },
    failed:    { icon: <XCircle className="h-3.5 w-3.5" />,      cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',           text: 'Failed' },
    running:   { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', text: 'Running' },
    pending:   { icon: <Clock className="h-3.5 w-3.5" />,        cls: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',    text: 'Pending' },
    cancelled: { icon: <XCircle className="h-3.5 w-3.5" />,      cls: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',    text: 'Cancelled' },
  }
  const s = map[status] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon} {s.text}
    </span>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-earth-600" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

// ── Metric grid ───────────────────────────────────────────────────────────────

function MetricGrid({ items }: { items: { label: string; value: string | number | boolean | null | undefined }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</dt>
          <dd className="mt-1 text-sm font-mono font-medium text-slate-800">
            {value === null || value === undefined
              ? <span className="text-slate-300">—</span>
              : typeof value === 'boolean'
                ? (value
                  ? <span className="text-emerald-600">Yes</span>
                  : <span className="text-slate-400">No</span>)
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// ── Data volumes table ────────────────────────────────────────────────────────

function DataVolumesTable({ rows }: { rows: SapAssessmentResult['data_volumes'] }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-slate-400 italic">No data volume information available.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Object</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Row Count</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Size (MB)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.key_object} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-3 py-2 font-mono text-slate-700">{row.key_object}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-600">{row.row_count.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-600">{row.size_mb.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Variant-specific detail renderer ─────────────────────────────────────────

function VariantDetails({ result }: { result: SapAssessmentResult }) {
  const v = result.variant

  if (v === 'ecc' && result.ecc) {
    const d = result.ecc
    return (
      <Section title="ECC-Specific Findings" icon={Database}>
        <div className="space-y-5">
          <MetricGrid items={[
            { label: 'Z-Table Count',    value: d.z_table_count.toLocaleString() },
            { label: 'Standard Tables',  value: d.standard_table_count.toLocaleString() },
            { label: 'Z-Table Ratio',    value: `${d.z_table_ratio_pct.toFixed(1)}%` },
            { label: 'ABAP Programs',    value: d.abap_program_count.toLocaleString() },
          ]} />
          {d.transport_landscape.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transport Landscape</p>
              <div className="flex flex-wrap gap-1.5">
                {d.transport_landscape.map((sys) => (
                  <span key={sys} className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600">{sys}</span>
                ))}
              </div>
            </div>
          )}
          {Object.keys(d.module_volumes).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Data Volume per Module</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {Object.entries(d.module_volumes).map(([mod, count]) => (
                  <div key={mod} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                    <p className="text-xs font-bold text-slate-600">{mod}</p>
                    <p className="text-sm font-mono font-semibold text-slate-800 mt-0.5">{count.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    )
  }

  if (v === 's4hana' && result.s4hana) {
    const d = result.s4hana
    return (
      <Section title="S/4HANA-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'Business Functions',   value: d.activated_business_functions.toLocaleString() },
          { label: 'Fiori Apps',            value: d.fiori_app_count.toLocaleString() },
          { label: 'Embedded HANA',         value: d.embedded_hana },
          { label: 'BAdI Count',            value: d.badi_count.toLocaleString() },
          { label: 'Enhancement Spots',     value: d.enhancement_spot_count.toLocaleString() },
          { label: 'Migration Objects',     value: d.migration_object_count.toLocaleString() },
        ]} />
      </Section>
    )
  }

  if (v === 'bw' && result.bw) {
    const d = result.bw
    return (
      <Section title="BW-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'InfoCubes',            value: d.info_cube_count.toLocaleString() },
          { label: 'DSOs / ADSOs',         value: d.dso_adso_count.toLocaleString() },
          { label: 'InfoObjects',          value: d.info_object_count.toLocaleString() },
          { label: 'CompositeProviders',   value: d.composite_provider_count.toLocaleString() },
          { label: 'MultiProviders',       value: d.multi_provider_count.toLocaleString() },
          { label: 'Process Chains',       value: d.process_chain_count.toLocaleString() },
          { label: 'Transformations',      value: d.transformation_count.toLocaleString() },
          { label: 'DTPs',                 value: d.dtp_count.toLocaleString() },
          { label: 'Source Systems',       value: d.source_system_connections.toLocaleString() },
          { label: 'Queries/Workbooks',    value: d.query_workbook_count.toLocaleString() },
        ]} />
        {d.delta_mechanism_types.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Delta Mechanism Types</p>
            <div className="flex flex-wrap gap-1.5">
              {d.delta_mechanism_types.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-tide-50 border border-tide-200 text-xs font-mono text-tide-700">{t}</span>
              ))}
            </div>
          </div>
        )}
      </Section>
    )
  }

  if (v === 'hana' && result.hana) {
    const d = result.hana
    return (
      <Section title="HANA-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'Schemas',              value: d.schema_count.toLocaleString() },
          { label: 'Row Store Tables',     value: d.row_store_tables.toLocaleString() },
          { label: 'Column Store Tables',  value: d.column_store_tables.toLocaleString() },
          { label: 'Calculation Views',    value: d.calculation_views.toLocaleString() },
          { label: 'Analytic Views',       value: d.analytic_views.toLocaleString() },
          { label: 'Attribute Views',      value: d.attribute_views.toLocaleString() },
          { label: 'Stored Procedures',    value: d.stored_procedures.toLocaleString() },
          { label: 'SQLScript Objects',    value: d.sql_script_objects.toLocaleString() },
          { label: 'Total Volume (GB)',    value: d.total_data_volume_gb.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
          { label: 'Replication Status',   value: d.replication_status },
        ]} />
      </Section>
    )
  }

  if (v === 'crm' && result.crm) {
    const d = result.crm
    return (
      <Section title="CRM-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'Business Partners',   value: d.business_partner_count.toLocaleString() },
          { label: 'IC Profiles',          value: d.ic_profiles.toLocaleString() },
          { label: 'Campaign Objects',     value: d.campaign_objects.toLocaleString() },
          { label: 'Middleware Queues',    value: d.middleware_queues.toLocaleString() },
          { label: 'Custom Objects',       value: d.custom_objects.toLocaleString() },
        ]} />
      </Section>
    )
  }

  if (v === 'srm' && result.srm) {
    const d = result.srm
    return (
      <Section title="SRM-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'Vendor Masters',           value: d.vendor_master_count.toLocaleString() },
          { label: 'Shopping Carts',           value: d.shopping_cart_count.toLocaleString() },
          { label: 'Purchase Orders',          value: d.purchase_order_count.toLocaleString() },
          { label: 'Catalog Items',            value: d.catalog_items.toLocaleString() },
          { label: 'Workflow Tasks',           value: d.workflow_tasks.toLocaleString() },
          { label: 'Backend Connections',      value: d.backend_system_connections.toLocaleString() },
        ]} />
      </Section>
    )
  }

  if (v === 'scm' && result.scm) {
    const d = result.scm
    return (
      <Section title="SCM / APO-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'liveCache Status',     value: d.live_cache_status },
          { label: 'Planning Areas',       value: d.planning_area_count.toLocaleString() },
          { label: 'Model/Version Count',  value: d.model_version_count.toLocaleString() },
          { label: 'CIF Systems',          value: d.cif_connected_systems.toLocaleString() },
          { label: 'Data Objects',         value: d.data_object_count.toLocaleString() },
        ]} />
      </Section>
    )
  }

  if (v === 'pi_po' && result.pi_po) {
    const d = result.pi_po
    return (
      <Section title="PI/PO-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'iFlow Count',         value: d.iflow_count.toLocaleString() },
          { label: 'Interface Count',     value: d.interface_count.toLocaleString() },
          { label: 'Daily Messages (avg)', value: d.avg_daily_messages.toLocaleString() },
          { label: 'Error Rate',          value: `${d.error_rate_pct.toFixed(2)}%` },
          { label: 'Business Systems',    value: d.business_systems.toLocaleString() },
        ]} />
        {d.adapter_types.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Adapter Types</p>
            <div className="flex flex-wrap gap-1.5">
              {d.adapter_types.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-grove-50 border border-grove-200 text-xs font-mono text-grove-700">{t}</span>
              ))}
            </div>
          </div>
        )}
      </Section>
    )
  }

  if (v === 'mdg' && result.mdg) {
    const d = result.mdg
    return (
      <Section title="MDG-Specific Findings" icon={Database}>
        <MetricGrid items={[
          { label: 'Governed Entity Types', value: d.governed_entity_types.toLocaleString() },
          { label: 'Workflow Rules',         value: d.workflow_rule_count.toLocaleString() },
          { label: 'Governance Model',       value: d.governance_model },
          { label: 'Open Change Requests',   value: d.open_change_requests.toLocaleString() },
          { label: 'Consolidation Rules',    value: d.consolidation_rules.toLocaleString() },
        ]} />
      </Section>
    )
  }

  if (v === 'successfactors' && result.successfactors) {
    const d = result.successfactors
    return (
      <Section title="SuccessFactors-Specific Findings" icon={Database}>
        <div className="space-y-5">
          <MetricGrid items={[
            { label: 'Employee Count',            value: d.employee_count.toLocaleString() },
            { label: 'MDF Objects',               value: d.mdf_object_count.toLocaleString() },
            { label: 'Integration Connections',   value: d.integration_center_connections.toLocaleString() },
            { label: 'Replication Status',        value: d.replication_status },
          ]} />
          {d.active_modules.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Active Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {d.active_modules.map((m) => (
                  <span key={m} className="px-2 py-0.5 rounded-md bg-ember-50 border border-ember-200 text-xs font-semibold text-ember-700">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    )
  }

  return null
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SapSessionDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<string>('pending')
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const [result, setResult] = useState<SapAssessmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const loadResults = async () => {
    if (!jobId) return
    try {
      const { data } = await api.sapGetJobResults(jobId)
      setResult(data)
      setStatus(data.status)
      if (data.error) setError(data.error)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const poll = async () => {
    if (!jobId) return
    try {
      const { data } = await api.sapGetJobStatus(jobId)
      setStatus(data.status)
      if (data.progress_message) setProgressMessage(data.progress_message)
      if (data.error) setError(data.error)
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        stopPoll()
        if (data.status === 'completed') await loadResults()
      }
    } catch (err) {
      stopPoll()
      setError(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    poll()
    pollRef.current = setInterval(poll, 3000)
    return stopPoll
  }, [jobId])

  const handleDownload = async () => {
    if (!jobId) return
    setDownloading(true)
    try {
      await api.sapDownloadReport(jobId, result?.label)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled'

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="page-header flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/sap/sessions')}
            className="mt-0.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              {result ? variantLabel(result.variant) : 'SAP Assessment'}
            </h1>
            {result?.label && <p className="text-sm text-slate-500 mt-0.5">{result.label}</p>}
            {result?.assessed_at && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {new Date(result.assessed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusChip status={status} />
          {status === 'completed' && (
            <Button
              size="sm"
              variant="secondary"
              loading={downloading}
              onClick={handleDownload}
              rightIcon={<Download className="h-3.5 w-3.5" />}
            >
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Running state */}
      {!isTerminal && (
        <div className="card flex items-center gap-4 px-6 py-5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Assessment in progress</p>
            <p className="text-xs text-slate-400 mt-0.5">{progressMessage ?? 'Connecting to SAP system and collecting data…'}</p>
          </div>
          <Spinner size="sm" className="ml-auto text-blue-500" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-5">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold">Assessment failed</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && result.status === 'completed' && (
        <div className="space-y-4">
          {/* System info */}
          {result.system_info && (
            <Section title="System Information" icon={Server}>
              <MetricGrid items={[
                { label: 'System ID',      value: result.system_info.system_id },
                { label: 'Client',         value: result.system_info.client },
                { label: 'Basis Release',  value: result.system_info.basis_release },
                { label: 'Kernel',         value: result.system_info.kernel_version },
                { label: 'OS Platform',    value: result.system_info.os_platform },
                { label: 'Database Layer', value: result.system_info.db_layer },
              ]} />
            </Section>
          )}

          {/* Object inventory */}
          {result.object_inventory && (
            <Section title="Object Inventory" icon={Database}>
              <MetricGrid items={[
                { label: 'Total Objects',    value: result.object_inventory.total_repository_objects.toLocaleString() },
                { label: 'Custom Objects',   value: result.object_inventory.custom_objects.toLocaleString() },
                { label: 'Standard Objects', value: result.object_inventory.standard_objects.toLocaleString() },
                { label: 'Custom Ratio',     value: `${result.object_inventory.custom_ratio_pct.toFixed(1)}%` },
                { label: 'Deprecated',       value: result.object_inventory.deprecated_objects.toLocaleString() },
              ]} />
            </Section>
          )}

          {/* User profile */}
          {result.user_profile && (
            <Section title="User & Authorization Profile" icon={Users}>
              <MetricGrid items={[
                { label: 'Active Users',   value: result.user_profile.active_users.toLocaleString() },
                { label: 'Locked Users',   value: result.user_profile.locked_users.toLocaleString() },
                { label: 'Dialog Users',   value: result.user_profile.dialog_users.toLocaleString() },
                { label: 'System Users',   value: result.user_profile.system_users.toLocaleString() },
                { label: 'Role Count',     value: result.user_profile.role_count.toLocaleString() },
                { label: 'Profile Count',  value: result.user_profile.profile_count.toLocaleString() },
              ]} />
            </Section>
          )}

          {/* Performance */}
          {result.performance && (
            <Section title="Performance Indicators" icon={Zap}>
              <MetricGrid items={[
                { label: 'Avg Response (ms)',      value: result.performance.avg_response_ms.toLocaleString() },
                { label: 'Background Jobs',        value: result.performance.active_background_jobs.toLocaleString() },
                { label: 'Work Process Util.',     value: `${result.performance.work_process_utilization_pct.toFixed(1)}%` },
                { label: 'Short Dumps (24h)',      value: result.performance.short_dumps_last_24h.toLocaleString() },
              ]} />
            </Section>
          )}

          {/* Extraction readiness */}
          {result.extraction_readiness && (
            <Section title="Extraction Readiness" icon={Shield}>
              <div className="space-y-4">
                <MetricGrid items={[
                  { label: 'Delta-Enabled Objects',  value: result.extraction_readiness.delta_enabled_objects.toLocaleString() },
                  { label: 'Existing Extractors',    value: result.extraction_readiness.existing_extractors.toLocaleString() },
                  { label: 'ODP Available',          value: result.extraction_readiness.odp_available },
                  { label: 'SLT Configured',         value: result.extraction_readiness.slt_configured },
                ]} />
                {result.extraction_readiness.supported_methods.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Supported Methods</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.extraction_readiness.supported_methods.map((m) => (
                        <span key={m} className="px-2 py-0.5 rounded-md bg-earth-50 border border-earth-200 text-xs font-mono font-semibold text-earth-700">{m}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Data volumes */}
          {result.data_volumes && result.data_volumes.length > 0 && (
            <Section title="Data Volume Estimates" icon={Database} defaultOpen={false}>
              <DataVolumesTable rows={result.data_volumes} />
            </Section>
          )}

          {/* Variant-specific */}
          <VariantDetails result={result} />
        </div>
      )}
    </div>
  )
}

function MetricGrid({ items }: { items: { label: string; value: string | number | boolean | null | undefined }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</dt>
          <dd className="mt-1 text-sm font-mono font-medium text-slate-800">
            {value === null || value === undefined
              ? <span className="text-slate-300">—</span>
              : typeof value === 'boolean'
                ? (value ? <span className="text-emerald-600">Yes</span> : <span className="text-slate-400">No</span>)
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
