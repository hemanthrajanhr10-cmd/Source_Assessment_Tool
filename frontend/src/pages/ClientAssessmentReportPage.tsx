import { useState } from 'react'
import { FileText, Plus, Trash2, Download, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { http } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataSource {
  name: string; category: string; type: string; integration_method: string; description: string
}
interface HighVolumeTable {
  schema_name: string; name: string; row_count: string; activity: string
}
interface DatabaseDetail {
  name: string; schema_count: string; table_count: string; view_count: string
  stored_proc_count: string; function_count: string; data_size: string
  observations: string[]; high_volume_tables: HighVolumeTable[]
}
interface SemanticModelInfo {
  table_count: string; measure_count: string; relationship_count: string; role_count: string
}
interface ReportItem {
  platform: string; workspace: string; name: string; description: string
}
interface OutboundSystem {
  category: string; name: string; type: string; connection: string; description: string
}
interface IntermediateSystem { layer: string; name: string; role: string }
interface PainPoint { label: string; description: string }
interface CostComparison { category: string; current_cost: string; proposed_cost: string }
interface ROIItem { category: string; current: string; proposed: string; benefit: string }
interface MigrationTask { task: string; hours: string }
interface ResourceSplit { resource: string; hours: string }
interface SourceRecommendation { source_name: string; recommendations: string[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkSource(): DataSource { return { name: '', category: '', type: '', integration_method: '', description: '' } }
function mkDB(): DatabaseDetail {
  return { name: '', schema_count: '', table_count: '', view_count: '', stored_proc_count: '', function_count: '', data_size: '', observations: [], high_volume_tables: [] }
}
function mkHVT(): HighVolumeTable { return { schema_name: 'dbo', name: '', row_count: '', activity: 'High' } }
function mkReport(): ReportItem { return { platform: 'Power BI', workspace: '', name: '', description: '' } }
function mkOutbound(): OutboundSystem { return { category: '', name: '', type: '', connection: '', description: '' } }
function mkIntermediate(): IntermediateSystem { return { layer: '', name: '', role: '' } }
function mkPainPoint(): PainPoint { return { label: '', description: '' } }
function mkCost(): CostComparison { return { category: '', current_cost: '', proposed_cost: '' } }
function mkROI(): ROIItem { return { category: '', current: '', proposed: '', benefit: '' } }
function mkTask(): MigrationTask { return { task: '', hours: '' } }
function mkResource(): ResourceSplit { return { resource: '', hours: '' } }
function mkRec(): SourceRecommendation { return { source_name: '', recommendations: [''] } }

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-slate-200/70 rounded-2xl overflow-hidden mb-5"
      style={{ boxShadow: '0 1px 4px rgba(0,86,179,0.04)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        style={{ background: 'linear-gradient(135deg, #F0F4FA 0%, #F8FAFD 100%)' }}
      >
        <span className="text-sm font-semibold text-slate-700 tracking-wide">{title}</span>
        {open
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 py-5 space-y-4 bg-white">{children}</div>}
    </div>
  )
}

// ── Field components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls = `w-full px-3 py-2 text-sm rounded-xl border border-slate-200
  focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400
  bg-white text-slate-800 placeholder:text-slate-300 transition`

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputCls} {...props} />
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputCls} resize-y min-h-[72px]`} {...props} />
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600
                 hover:text-blue-800 transition px-3 py-1.5 rounded-lg
                 border border-blue-200 hover:border-blue-400 bg-blue-50/50">
      <Plus className="h-3.5 w-3.5" />{label}
    </button>
  )
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition shrink-0">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function RowCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 relative">
      <div className="absolute top-3 right-3"><RemoveBtn onClick={onRemove} /></div>
      <div className="pr-8">{children}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientAssessmentReportPage() {
  // ── Client basics
  const [clientName, setClientName] = useState('')
  const [industry, setIndustry] = useState('')
  const [archDesc, setArchDesc] = useState('')
  const [userCount, setUserCount] = useState('')
  const [devCount, setDevCount] = useState('')

  // ── Data sources
  const [sources, setSources] = useState<DataSource[]>([mkSource()])
  function updateSource(i: number, f: keyof DataSource, v: string) {
    setSources(s => s.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }

  // ── Databases
  const [databases, setDatabases] = useState<DatabaseDetail[]>([])
  function updateDB(i: number, f: keyof DatabaseDetail, v: string | string[]) {
    setDatabases(d => d.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }
  function addObservation(i: number) {
    setDatabases(d => d.map((x, j) => j === i ? { ...x, observations: [...x.observations, ''] } : x))
  }
  function updateObservation(dbIdx: number, oIdx: number, v: string) {
    setDatabases(d => d.map((x, j) => j === dbIdx
      ? { ...x, observations: x.observations.map((o, k) => k === oIdx ? v : o) } : x))
  }
  function removeObservation(dbIdx: number, oIdx: number) {
    setDatabases(d => d.map((x, j) => j === dbIdx
      ? { ...x, observations: x.observations.filter((_, k) => k !== oIdx) } : x))
  }
  function addHVT(i: number) {
    setDatabases(d => d.map((x, j) => j === i ? { ...x, high_volume_tables: [...x.high_volume_tables, mkHVT()] } : x))
  }
  function updateHVT(dbIdx: number, tIdx: number, f: keyof HighVolumeTable, v: string) {
    setDatabases(d => d.map((x, j) => j === dbIdx
      ? { ...x, high_volume_tables: x.high_volume_tables.map((t, k) => k === tIdx ? { ...t, [f]: v } : t) } : x))
  }
  function removeHVT(dbIdx: number, tIdx: number) {
    setDatabases(d => d.map((x, j) => j === dbIdx
      ? { ...x, high_volume_tables: x.high_volume_tables.filter((_, k) => k !== tIdx) } : x))
  }

  // ── ETL
  const [etlTool, setEtlTool] = useState('')
  const [etlJobCount, setEtlJobCount] = useState('')
  const [etlJobs, setEtlJobs] = useState<string[]>([])
  function updateEtlJob(i: number, v: string) { setEtlJobs(j => j.map((x, k) => k === i ? v : x)) }

  // ── Reporting
  const [reportingTool, setReportingTool] = useState('Power BI')
  const [hasSemanticModel, setHasSemanticModel] = useState(false)
  const [semanticModel, setSemanticModel] = useState<SemanticModelInfo>({ table_count: '', measure_count: '', relationship_count: '', role_count: '' })
  const [reports, setReports] = useState<ReportItem[]>([])
  function updateReport(i: number, f: keyof ReportItem, v: string) {
    setReports(r => r.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }

  // ── Pain points
  const [painPoints, setPainPoints] = useState<PainPoint[]>([mkPainPoint()])
  function updatePP(i: number, f: keyof PainPoint, v: string) {
    setPainPoints(p => p.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }

  // ── Outbound / Intermediate
  const [outbound, setOutbound] = useState<OutboundSystem[]>([])
  function updateOut(i: number, f: keyof OutboundSystem, v: string) {
    setOutbound(o => o.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }
  const [intermediate, setIntermediate] = useState<IntermediateSystem[]>([])
  function updateInt(i: number, f: keyof IntermediateSystem, v: string) {
    setIntermediate(o => o.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }

  // ── Recommendations
  const [fabricBenefits, setFabricBenefits] = useState<string[]>([])
  const [sourceRecs, setSourceRecs] = useState<SourceRecommendation[]>([])
  function updateRec(i: number, f: 'source_name', v: string) {
    setSourceRecs(r => r.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }
  function addRecItem(i: number) {
    setSourceRecs(r => r.map((x, j) => j === i ? { ...x, recommendations: [...x.recommendations, ''] } : x))
  }
  function updateRecItem(rIdx: number, iIdx: number, v: string) {
    setSourceRecs(r => r.map((x, j) => j === rIdx
      ? { ...x, recommendations: x.recommendations.map((s, k) => k === iIdx ? v : s) } : x))
  }
  function removeRecItem(rIdx: number, iIdx: number) {
    setSourceRecs(r => r.map((x, j) => j === rIdx
      ? { ...x, recommendations: x.recommendations.filter((_, k) => k !== iIdx) } : x))
  }

  // ── Capacity / costs
  const [proposedCapacity, setProposedCapacity] = useState('F16')
  const [region, setRegion] = useState('Central US')
  const [reservedPrice, setReservedPrice] = useState('')
  const [paygoPrice, setPaygoPrice] = useState('')
  const [projectDuration, setProjectDuration] = useState('3 Months')

  const [costRows, setCostRows] = useState<CostComparison[]>([])
  function updateCost(i: number, f: keyof CostComparison, v: string) {
    setCostRows(c => c.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }
  const [roiRows, setRoiRows] = useState<ROIItem[]>([])
  function updateROI(i: number, f: keyof ROIItem, v: string) {
    setRoiRows(r => r.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }

  // ── Migration
  const [migrationTasks, setMigrationTasks] = useState<MigrationTask[]>([])
  function updateTask(i: number, f: keyof MigrationTask, v: string) {
    setMigrationTasks(t => t.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }
  const [resourceSplit, setResourceSplit] = useState<ResourceSplit[]>([])
  function updateRes(i: number, f: keyof ResourceSplit, v: string) {
    setResourceSplit(r => r.map((x, j) => j === i ? { ...x, [f]: v } : x))
  }

  // ── Deliverables
  const [deliverables, setDeliverables] = useState<string[]>([])
  function updateDel(i: number, v: string) { setDeliverables(d => d.map((x, j) => j === i ? v : x)) }

  // ── Submit ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (!clientName.trim()) { setError('Client name is required.'); return }
    setError('')
    setLoading(true)
    try {
      const payload = {
        client_name: clientName.trim(),
        industry,
        architecture_description: archDesc,
        user_count: userCount,
        dev_count: devCount,
        data_sources: sources.filter(s => s.name.trim()),
        databases: databases.filter(d => d.name.trim()),
        etl_tool: etlTool,
        etl_job_count: etlJobCount,
        etl_jobs: etlJobs.filter(j => j.trim()),
        reporting_tool: reportingTool,
        semantic_model: hasSemanticModel ? semanticModel : null,
        reports: reports.filter(r => r.name.trim()),
        outbound_systems: outbound.filter(o => o.name.trim()),
        intermediate_systems: intermediate.filter(s => s.name.trim()),
        pain_points: painPoints.filter(p => p.description.trim()),
        fabric_benefits: fabricBenefits.filter(b => b.trim()),
        source_recommendations: sourceRecs.filter(r => r.source_name.trim()),
        proposed_capacity: proposedCapacity,
        region,
        reserved_price: reservedPrice,
        paygo_price: paygoPrice,
        project_duration: projectDuration,
        cost_comparison: costRows.filter(c => c.category.trim()),
        roi_table: roiRows.filter(r => r.category.trim()),
        migration_tasks: migrationTasks.filter(t => t.task.trim()),
        resource_split: resourceSplit.filter(r => r.resource.trim()),
        deliverables: deliverables.filter(d => d.trim()),
      }
      const res = await http.post('/api/v1/client-assessment-report/generate', payload, {
        responseType: 'blob',
      })
      const url  = URL.createObjectURL(new Blob([res.data]))
      const a    = document.createElement('a')
      a.href     = url
      a.download = `Assessment_Report_-_${clientName.replace(/\s+/g, '_')}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError('Failed to generate report. Please check your inputs and try again.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #1F3864 0%, #2E75B6 100%)', boxShadow: '0 4px 16px rgba(31,56,100,0.25)' }}>
          <FileText className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Assessment Report</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Fill in the client details below to generate a professional Microsoft Fabric modernization assessment (.docx)
          </p>
        </div>
      </div>

      {/* ── 1. Client Basics ─────────────────────────────────────────────── */}
      <Section title="1 · Client Basics">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Client Name *">
            <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Industry">
            <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Manufacturing" />
          </Field>
          <Field label="Report Consumers">
            <Input value={userCount} onChange={e => setUserCount(e.target.value)} placeholder="100–150" />
          </Field>
          <Field label="Report Developers">
            <Input value={devCount} onChange={e => setDevCount(e.target.value)} placeholder="10–15" />
          </Field>
        </div>
        <Field label="Architecture Description">
          <Textarea value={archDesc} onChange={e => setArchDesc(e.target.value)}
            placeholder="e.g. traditional BI architecture built on SQL Server and SSAS" />
        </Field>
      </Section>

      {/* ── 2. Data Sources ──────────────────────────────────────────────── */}
      <Section title="2 · Data Sources">
        {sources.map((s, i) => (
          <RowCard key={i} onRemove={() => setSources(x => x.filter((_, j) => j !== i))}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="System Name"><Input value={s.name} onChange={e => updateSource(i, 'name', e.target.value)} placeholder="SAP ERP" /></Field>
              <Field label="Category"><Input value={s.category} onChange={e => updateSource(i, 'category', e.target.value)} placeholder="ERP System" /></Field>
              <Field label="Type"><Input value={s.type} onChange={e => updateSource(i, 'type', e.target.value)} placeholder="Core Transactional" /></Field>
              <Field label="Integration Method"><Input value={s.integration_method} onChange={e => updateSource(i, 'integration_method', e.target.value)} placeholder="SSIS / ADF / API" /></Field>
              <div className="col-span-2">
                <Field label="Description"><Input value={s.description} onChange={e => updateSource(i, 'description', e.target.value)} placeholder="Primary enterprise data source" /></Field>
              </div>
            </div>
          </RowCard>
        ))}
        <AddBtn onClick={() => setSources(x => [...x, mkSource()])} label="Add Data Source" />
      </Section>

      {/* ── 3. Databases ─────────────────────────────────────────────────── */}
      <Section title="3 · Databases / Data Stores">
        {databases.map((db, i) => (
          <RowCard key={i} onRemove={() => setDatabases(d => d.filter((_, j) => j !== i))}>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Field label="Database Name"><Input value={db.name} onChange={e => updateDB(i, 'name', e.target.value)} placeholder="WarehouseDB" /></Field>
              <Field label="Tables"><Input value={db.table_count} onChange={e => updateDB(i, 'table_count', e.target.value)} placeholder="350" /></Field>
              <Field label="Views"><Input value={db.view_count} onChange={e => updateDB(i, 'view_count', e.target.value)} placeholder="180" /></Field>
              <Field label="Stored Procs"><Input value={db.stored_proc_count} onChange={e => updateDB(i, 'stored_proc_count', e.target.value)} placeholder="90" /></Field>
              <Field label="Functions"><Input value={db.function_count} onChange={e => updateDB(i, 'function_count', e.target.value)} placeholder="12" /></Field>
              <Field label="Data Size"><Input value={db.data_size} onChange={e => updateDB(i, 'data_size', e.target.value)} placeholder="~420 GB" /></Field>
            </div>
            {/* Observations */}
            <div className="mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Observations</p>
              {db.observations.map((o, oi) => (
                <div key={oi} className="flex gap-2 mb-1.5">
                  <Input value={o} onChange={e => updateObservation(i, oi, e.target.value)} placeholder="Key observation…" />
                  <RemoveBtn onClick={() => removeObservation(i, oi)} />
                </div>
              ))}
              <AddBtn onClick={() => addObservation(i)} label="Add observation" />
            </div>
            {/* High-volume tables */}
            {db.high_volume_tables.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">High-Volume Tables</p>
                {db.high_volume_tables.map((t, ti) => (
                  <div key={ti} className="grid grid-cols-4 gap-2 mb-2">
                    <Input value={t.schema_name} onChange={e => updateHVT(i, ti, 'schema_name', e.target.value)} placeholder="Schema" />
                    <Input value={t.name} onChange={e => updateHVT(i, ti, 'name', e.target.value)} placeholder="Table name" />
                    <Input value={t.row_count} onChange={e => updateHVT(i, ti, 'row_count', e.target.value)} placeholder="45,000,000" />
                    <div className="flex gap-1">
                      <Input value={t.activity} onChange={e => updateHVT(i, ti, 'activity', e.target.value)} placeholder="High" />
                      <RemoveBtn onClick={() => removeHVT(i, ti)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <AddBtn onClick={() => addHVT(i)} label="Add high-volume table" />
          </RowCard>
        ))}
        <AddBtn onClick={() => setDatabases(d => [...d, mkDB()])} label="Add Database" />
      </Section>

      {/* ── 4. ETL ───────────────────────────────────────────────────────── */}
      <Section title="4 · ETL & Orchestration">
        <div className="grid grid-cols-2 gap-4">
          <Field label="ETL Tool(s)">
            <Input value={etlTool} onChange={e => setEtlTool(e.target.value)} placeholder="SSIS and SQL Agent Jobs" />
          </Field>
          <Field label="Number of Jobs">
            <Input value={etlJobCount} onChange={e => setEtlJobCount(e.target.value)} placeholder="28" />
          </Field>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Job / Package Names</p>
          {etlJobs.map((j, i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <Input value={j} onChange={e => updateEtlJob(i, e.target.value)} placeholder="Job_FullLoad_Sales" />
              <RemoveBtn onClick={() => setEtlJobs(jobs => jobs.filter((_, k) => k !== i))} />
            </div>
          ))}
          <AddBtn onClick={() => setEtlJobs(j => [...j, ''])} label="Add ETL job" />
        </div>
      </Section>

      {/* ── 5. Reporting ─────────────────────────────────────────────────── */}
      <Section title="5 · Reporting & Analytics">
        <Field label="Reporting Tool">
          <Input value={reportingTool} onChange={e => setReportingTool(e.target.value)} placeholder="Power BI" />
        </Field>

        <div className="flex items-center gap-2 mt-1">
          <input type="checkbox" id="hasSM" checked={hasSemanticModel} onChange={e => setHasSemanticModel(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600" />
          <label htmlFor="hasSM" className="text-sm text-slate-600 font-medium">Has Semantic Model / SSAS Cube</label>
        </div>

        {hasSemanticModel && (
          <div className="grid grid-cols-2 gap-3 mt-2 p-4 bg-blue-50/40 rounded-xl border border-blue-100">
            <Field label="Tables"><Input value={semanticModel.table_count} onChange={e => setSemanticModel(s => ({ ...s, table_count: e.target.value }))} placeholder="120" /></Field>
            <Field label="Measures"><Input value={semanticModel.measure_count} onChange={e => setSemanticModel(s => ({ ...s, measure_count: e.target.value }))} placeholder="450" /></Field>
            <Field label="Relationships"><Input value={semanticModel.relationship_count} onChange={e => setSemanticModel(s => ({ ...s, relationship_count: e.target.value }))} placeholder="200" /></Field>
            <Field label="Roles"><Input value={semanticModel.role_count} onChange={e => setSemanticModel(s => ({ ...s, role_count: e.target.value }))} placeholder="0" /></Field>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Power BI Reports</p>
          {reports.map((r, i) => (
            <RowCard key={i} onRemove={() => setReports(x => x.filter((_, j) => j !== i))}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform"><Input value={r.platform} onChange={e => updateReport(i, 'platform', e.target.value)} placeholder="Power BI" /></Field>
                <Field label="Workspace"><Input value={r.workspace} onChange={e => updateReport(i, 'workspace', e.target.value)} placeholder="Sales" /></Field>
                <Field label="Report Name"><Input value={r.name} onChange={e => updateReport(i, 'name', e.target.value)} placeholder="Sales Dashboard" /></Field>
                <Field label="Description"><Input value={r.description} onChange={e => updateReport(i, 'description', e.target.value)} placeholder="YTD sales by region" /></Field>
              </div>
            </RowCard>
          ))}
          <AddBtn onClick={() => setReports(r => [...r, mkReport()])} label="Add report" />
        </div>
      </Section>

      {/* ── 6. Pain Points ───────────────────────────────────────────────── */}
      <Section title="6 · Pain Points">
        {painPoints.map((pp, i) => (
          <RowCard key={i} onRemove={() => setPainPoints(p => p.filter((_, j) => j !== i))}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label (optional)"><Input value={pp.label} onChange={e => updatePP(i, 'label', e.target.value)} placeholder="Data Silos" /></Field>
              <Field label="Description *"><Input value={pp.description} onChange={e => updatePP(i, 'description', e.target.value)} placeholder="Data spread across multiple systems with no unified platform" /></Field>
            </div>
          </RowCard>
        ))}
        <AddBtn onClick={() => setPainPoints(p => [...p, mkPainPoint()])} label="Add pain point" />
      </Section>

      {/* ── 7. Inbound / Outbound / Intermediate ─────────────────────────── */}
      <Section title="7 · Outbound & Intermediate Systems">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Outbound Systems</p>
          {outbound.map((o, i) => (
            <RowCard key={i} onRemove={() => setOutbound(x => x.filter((_, j) => j !== i))}>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Category"><Input value={o.category} onChange={e => updateOut(i, 'category', e.target.value)} placeholder="BI Reporting" /></Field>
                <Field label="Name"><Input value={o.name} onChange={e => updateOut(i, 'name', e.target.value)} placeholder="Power BI" /></Field>
                <Field label="Type"><Input value={o.type} onChange={e => updateOut(i, 'type', e.target.value)} placeholder="Visualization Tool" /></Field>
                <Field label="Connection"><Input value={o.connection} onChange={e => updateOut(i, 'connection', e.target.value)} placeholder="Live Connection / Import" /></Field>
                <div className="col-span-2">
                  <Field label="Description"><Input value={o.description} onChange={e => updateOut(i, 'description', e.target.value)} placeholder="Primary reporting platform" /></Field>
                </div>
              </div>
            </RowCard>
          ))}
          <AddBtn onClick={() => setOutbound(o => [...o, mkOutbound()])} label="Add outbound system" />
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Intermediate Systems</p>
          {intermediate.map((s, i) => (
            <RowCard key={i} onRemove={() => setIntermediate(x => x.filter((_, j) => j !== i))}>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Layer"><Input value={s.layer} onChange={e => updateInt(i, 'layer', e.target.value)} placeholder="Data Storage" /></Field>
                <Field label="System Name"><Input value={s.name} onChange={e => updateInt(i, 'name', e.target.value)} placeholder="Source SQL DB" /></Field>
                <Field label="Role"><Input value={s.role} onChange={e => updateInt(i, 'role', e.target.value)} placeholder="Raw data landing zone" /></Field>
              </div>
            </RowCard>
          ))}
          <AddBtn onClick={() => setIntermediate(x => [...x, mkIntermediate()])} label="Add intermediate system" />
        </div>
      </Section>

      {/* ── 8. Fabric Recommendations ────────────────────────────────────── */}
      <Section title="8 · Fabric Recommendations">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fabric Benefits (Executive Summary bullets)</p>
          {fabricBenefits.map((b, i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <Input value={b} onChange={e => setFabricBenefits(x => x.map((v, j) => j === i ? e.target.value : v))} placeholder="Benefit…" />
              <RemoveBtn onClick={() => setFabricBenefits(x => x.filter((_, j) => j !== i))} />
            </div>
          ))}
          <AddBtn onClick={() => setFabricBenefits(b => [...b, ''])} label="Add benefit" />
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Per-Source Recommendations</p>
          {sourceRecs.map((r, i) => (
            <RowCard key={i} onRemove={() => setSourceRecs(x => x.filter((_, j) => j !== i))}>
              <Field label="Source Name">
                <Input value={r.source_name} onChange={e => updateRec(i, 'source_name', e.target.value)} placeholder="ERP System" />
              </Field>
              <div className="mt-2">
                {r.recommendations.map((rec, ri) => (
                  <div key={ri} className="flex gap-2 mb-1.5">
                    <Input value={rec} onChange={e => updateRecItem(i, ri, e.target.value)} placeholder="Recommendation…" />
                    <RemoveBtn onClick={() => removeRecItem(i, ri)} />
                  </div>
                ))}
                <AddBtn onClick={() => addRecItem(i)} label="Add recommendation" />
              </div>
            </RowCard>
          ))}
          <AddBtn onClick={() => setSourceRecs(r => [...r, mkRec()])} label="Add source recommendation" />
        </div>
      </Section>

      {/* ── 9. Capacity & Costs ──────────────────────────────────────────── */}
      <Section title="9 · Capacity, Costs & ROI">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Proposed Capacity"><Input value={proposedCapacity} onChange={e => setProposedCapacity(e.target.value)} placeholder="F16" /></Field>
          <Field label="Region"><Input value={region} onChange={e => setRegion(e.target.value)} placeholder="Central US" /></Field>
          <Field label="Project Duration"><Input value={projectDuration} onChange={e => setProjectDuration(e.target.value)} placeholder="3 Months" /></Field>
          <Field label="Reserved Price / mo"><Input value={reservedPrice} onChange={e => setReservedPrice(e.target.value)} placeholder="$1,250.67" /></Field>
          <Field label="PAYG Price / mo"><Input value={paygoPrice} onChange={e => setPaygoPrice(e.target.value)} placeholder="$2,102.40" /></Field>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cost Comparison Rows</p>
          {costRows.map((c, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 mb-1.5">
              <Input value={c.category} onChange={e => updateCost(i, 'category', e.target.value)} placeholder="Category" />
              <Input value={c.current_cost} onChange={e => updateCost(i, 'current_cost', e.target.value)} placeholder="Current cost" />
              <div className="flex gap-1">
                <Input value={c.proposed_cost} onChange={e => updateCost(i, 'proposed_cost', e.target.value)} placeholder="Proposed cost" />
                <RemoveBtn onClick={() => setCostRows(x => x.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          <AddBtn onClick={() => setCostRows(c => [...c, mkCost()])} label="Add cost row" />
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ROI Table Rows</p>
          {roiRows.map((r, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 mb-1.5">
              <Input value={r.category} onChange={e => updateROI(i, 'category', e.target.value)} placeholder="Category" />
              <Input value={r.current} onChange={e => updateROI(i, 'current', e.target.value)} placeholder="Current" />
              <Input value={r.proposed} onChange={e => updateROI(i, 'proposed', e.target.value)} placeholder="Proposed" />
              <div className="flex gap-1">
                <Input value={r.benefit} onChange={e => updateROI(i, 'benefit', e.target.value)} placeholder="Benefit" />
                <RemoveBtn onClick={() => setRoiRows(x => x.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          <AddBtn onClick={() => setRoiRows(r => [...r, mkROI()])} label="Add ROI row" />
        </div>
      </Section>

      {/* ── 10. Migration ────────────────────────────────────────────────── */}
      <Section title="10 · Migration Estimation">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tasks & Hours</p>
          {migrationTasks.map((t, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 mb-1.5">
              <div className="col-span-2">
                <Input value={t.task} onChange={e => updateTask(i, 'task', e.target.value)} placeholder="Task description" />
              </div>
              <div className="flex gap-1">
                <Input value={t.hours} onChange={e => updateTask(i, 'hours', e.target.value)} placeholder="Hours" />
                <RemoveBtn onClick={() => setMigrationTasks(x => x.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          <AddBtn onClick={() => setMigrationTasks(t => [...t, mkTask()])} label="Add task" />
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Resource Split</p>
          {resourceSplit.map((r, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 mb-1.5">
              <div className="col-span-2">
                <Input value={r.resource} onChange={e => updateRes(i, 'resource', e.target.value)} placeholder="Senior Engineer (1)" />
              </div>
              <div className="flex gap-1">
                <Input value={r.hours} onChange={e => updateRes(i, 'hours', e.target.value)} placeholder="Hours" />
                <RemoveBtn onClick={() => setResourceSplit(x => x.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          <AddBtn onClick={() => setResourceSplit(r => [...r, mkResource()])} label="Add resource" />
        </div>
      </Section>

      {/* ── 11. Deliverables ─────────────────────────────────────────────── */}
      <Section title="11 · Deliverable Summary">
        {deliverables.map((d, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <Textarea value={d} onChange={e => updateDel(i, e.target.value)} placeholder="Deliverable…" style={{ minHeight: 48 }} />
            <RemoveBtn onClick={() => setDeliverables(x => x.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddBtn onClick={() => setDeliverables(d => [...d, ''])} label="Add deliverable" />
      </Section>

      {/* ── Error & Generate ─────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2.5 px-8 py-3 rounded-2xl text-sm font-semibold text-white
                     transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: loading
              ? 'linear-gradient(135deg, #9DB8D6, #ADC5D8)'
              : 'linear-gradient(135deg, #1F3864 0%, #2E75B6 100%)',
            boxShadow: loading ? 'none' : '0 4px 20px rgba(31,56,100,0.30)',
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(31,56,100,0.42)' }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(31,56,100,0.30)' }}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Report…</>
            : <><Download className="h-4 w-4" /> Generate Assessment Report</>
          }
        </button>
      </div>
    </div>
  )
}
