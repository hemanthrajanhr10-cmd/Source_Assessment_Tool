import { useState } from 'react'
import {
  Hash, Calculator, Table2, FileText, BookOpen, Eye,
  ChevronDown, ChevronUp, Search, Filter, Network,
  AlertCircle, ArrowRight, Code2, Copy, Check,
  BarChart2, GitBranch, Layers,
} from 'lucide-react'
import type {
  FabricWorkspace, MeasureComplexity,
} from '../../types/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UsageEntry {
  reportId: string
  reportName: string
  pageName: string
  visualTitle: string
  visualType: string
}

interface LineageItem {
  key: string
  name: string
  table: string
  modelName: string
  workspaceName: string
  expression?: string
  complexity?: MeasureComplexity
  type: 'Measure' | 'Calc Column' | 'Calc Table'
  sourceType: 'model' | 'report-only'
  usages: UsageEntry[]
}

// ── Data builder ───────────────────────────────────────────────────────────────

function buildLineageData(workspaces: FabricWorkspace[]): LineageItem[] {
  const items = new Map<string, LineageItem>()

  // 1. Seed from semantic models
  workspaces.forEach(ws => {
    ws.datasets.forEach(ds => {
      ds.measures.forEach(m => {
        const key = `${ws.name}||${ds.name}||${m.table}||${m.name}||measure`
        items.set(key, {
          key, name: m.name, table: m.table, modelName: ds.name,
          workspaceName: ws.name, expression: m.expression,
          complexity: m.complexity, type: 'Measure', sourceType: 'model', usages: [],
        })
      });
      (ds.calculated_columns || []).forEach(c => {
        const key = `${ws.name}||${ds.name}||${c.table}||${c.name}||calc_col`
        items.set(key, {
          key, name: c.name, table: c.table, modelName: ds.name,
          workspaceName: ws.name, expression: c.expression,
          complexity: c.complexity, type: 'Calc Column', sourceType: 'model', usages: [],
        })
      });
      (ds.calculated_tables || []).forEach(t => {
        const key = `${ws.name}||${ds.name}||${t.name}||${t.name}||calc_table`
        items.set(key, {
          key, name: t.name, table: t.name, modelName: ds.name,
          workspaceName: ws.name, expression: t.expression,
          complexity: t.complexity, type: 'Calc Table', sourceType: 'model', usages: [],
        })
      })
    })
  })

  // 2. Scan report visuals for field references
  workspaces.forEach(ws => {
    ws.reports.forEach(report => {
      report.pages.forEach(page => {
        page.visuals.forEach(visual => {
          visual.fields.forEach(field => {
            if (field.field_type !== 'measure' && field.field_type !== 'column') return

            const usage: UsageEntry = {
              reportId: report.id,
              reportName: report.name,
              pageName: page.name,
              visualTitle: visual.title || visual.type || 'Visual',
              visualType: visual.type,
            }

            // Try to match measure in model
            let matched = false
            for (const [, item] of items) {
              if (
                item.workspaceName === ws.name &&
                item.name === field.name &&
                (item.table === field.table || !field.table) &&
                item.type === 'Measure' && field.field_type === 'measure'
              ) {
                item.usages.push(usage)
                matched = true
                break
              }
              if (
                item.workspaceName === ws.name &&
                item.name === field.name &&
                item.table === field.table &&
                item.type === 'Calc Column' && field.field_type === 'column'
              ) {
                item.usages.push(usage)
                matched = true
                break
              }
            }

            // Not found in model — report-only item
            if (!matched && field.field_type === 'measure') {
              const key = `${ws.name}||report-only||${field.table || ''}||${field.name}||measure`
              if (items.has(key)) {
                items.get(key)!.usages.push(usage)
              } else {
                items.set(key, {
                  key, name: field.name, table: field.table || '',
                  modelName: 'Not in model catalog', workspaceName: ws.name,
                  expression: field.expression, complexity: field.complexity,
                  type: 'Measure', sourceType: 'report-only', usages: [usage],
                })
              }
            }
          })
        })
      })
    })
  })

  return Array.from(items.values())
}

// ── Complexity badge ───────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  None:           { bg: 'bg-slate-100/50',  text: 'text-slate-500',   border: 'border-slate-200' },
  Simple:         { bg: 'bg-earth-50',      text: 'text-earth-700',   border: 'border-earth-200' },
  Moderate:       { bg: 'bg-amber-50',      text: 'text-amber-700',   border: 'border-amber-200' },
  Complex:        { bg: 'bg-orange-50',     text: 'text-orange-700',  border: 'border-orange-200' },
  'Very Complex': { bg: 'bg-red-50',        text: 'text-red-700',     border: 'border-red-200' },
}

function ComplexityPill({ c }: { c: MeasureComplexity }) {
  const clr = COMPLEXITY_COLORS[c.level] ?? COMPLEXITY_COLORS.None
  if (c.score === 0) return null
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${clr.bg} ${clr.text} ${clr.border}`}>
      <BarChart2 className="h-2.5 w-2.5" />
      {c.level} ({c.score})
    </span>
  )
}

// ── Visual type icon resolver ──────────────────────────────────────────────────

function VisualTypeIcon({ type }: { type: string }) {
  const t = type.toLowerCase()
  if (t.includes('table') || t.includes('matrix')) return <Layers className="h-3 w-3 text-brand-500" />
  if (t.includes('bar') || t.includes('column') || t.includes('line') || t.includes('area'))
    return <BarChart2 className="h-3 w-3 text-tide-600" />
  if (t.includes('card') || t.includes('kpi'))
    return <Hash className="h-3 w-3 text-grove-600" />
  return <Eye className="h-3 w-3 text-slate-400" />
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyExprBtn({ expr }: { expr: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(expr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all border"
      style={{
        background: copied ? 'rgba(13,148,136,0.08)' : 'rgba(0,86,179,0.06)',
        color: copied ? '#0F766E' : '#0056B3',
        borderColor: copied ? 'rgba(13,148,136,0.30)' : 'rgba(0,86,179,0.20)',
      }}
      title="Copy DAX expression"
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── Group usages by report → page ─────────────────────────────────────────────

type GroupedUsage = {
  reportId: string
  reportName: string
  pages: {
    pageName: string
    visuals: { title: string; type: string }[]
  }[]
}

function groupUsages(usages: UsageEntry[]): GroupedUsage[] {
  const byReport = new Map<string, GroupedUsage>()
  usages.forEach(u => {
    if (!byReport.has(u.reportId)) {
      byReport.set(u.reportId, { reportId: u.reportId, reportName: u.reportName, pages: [] })
    }
    const rpt = byReport.get(u.reportId)!
    let pg = rpt.pages.find(p => p.pageName === u.pageName)
    if (!pg) { pg = { pageName: u.pageName, visuals: [] }; rpt.pages.push(pg) }
    pg.visuals.push({ title: u.visualTitle, type: u.visualType })
  })
  return Array.from(byReport.values())
}

// ── Lineage card ───────────────────────────────────────────────────────────────

const TYPE_META: Record<LineageItem['type'], { icon: React.ReactNode; label: string; bg: string; border: string; text: string }> = {
  Measure:      { icon: <Hash className="h-3.5 w-3.5" />,       label: 'Measure',      bg: 'bg-brand-50',  border: 'border-brand-200',  text: 'text-brand-700' },
  'Calc Column':{ icon: <Calculator className="h-3.5 w-3.5" />,  label: 'Calc Column',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700' },
  'Calc Table': { icon: <Table2 className="h-3.5 w-3.5" />,      label: 'Calc Table',   bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
}

function LineageCard({ item, expanded, onToggle }: {
  item: LineageItem
  expanded: boolean
  onToggle: () => void
}) {
  const meta = TYPE_META[item.type]
  const grouped = groupUsages(item.usages)
  const isUsed = item.usages.length > 0
  const totalVisuals = item.usages.length

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all duration-200"
      style={{
        borderColor: expanded ? 'rgba(0,86,179,0.30)' : 'rgba(197,213,236,0.8)',
        boxShadow: expanded
          ? '0 4px 20px rgba(0,86,179,0.08), 0 1px 4px rgba(0,0,0,0.04)'
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{
          background: expanded
            ? 'linear-gradient(135deg, rgba(0,86,179,0.04) 0%, rgba(0,132,212,0.02) 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, rgba(248,250,253,1) 100%)',
        }}
      >
        {/* Type badge */}
        <span className={`flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.border} ${meta.text}`}>
          {meta.icon}
          {meta.label}
        </span>

        {/* Name + table */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate font-mono">{item.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {item.table && item.table !== item.name && (
              <span className="text-xs text-slate-400 truncate">{item.table}</span>
            )}
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-400 truncate">{item.modelName}</span>
            {item.sourceType === 'report-only' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <AlertCircle className="h-2.5 w-2.5" /> Report-only
              </span>
            )}
          </div>
        </div>

        {/* Complexity */}
        {item.complexity && <ComplexityPill c={item.complexity} />}

        {/* Usage count */}
        <span
          className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: isUsed ? 'rgba(0,86,179,0.08)' : 'rgba(148,163,184,0.12)',
            color: isUsed ? '#0056B3' : '#94A3B8',
          }}
        >
          {isUsed ? `${totalVisuals} visual${totalVisuals !== 1 ? 's' : ''}` : 'Unused'}
        </span>

        {expanded
          ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'rgba(197,213,236,0.5)' }}>
          {/* DAX expression */}
          {item.expression && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(197,213,236,0.4)', background: 'rgba(248,250,253,0.8)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Code2 className="h-3 w-3" /> DAX Expression
                </span>
                <CopyExprBtn expr={item.expression} />
              </div>
              <pre className="text-xs font-mono rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap max-h-28 text-slate-700 border"
                style={{ background: 'rgba(0,86,179,0.03)', borderColor: 'rgba(0,86,179,0.12)' }}>
                {item.expression}
              </pre>
            </div>
          )}

          {/* Lineage tree */}
          <div className="p-4">
            {isUsed ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-brand-500" />
                  Consumed in {grouped.length} report{grouped.length !== 1 ? 's' : ''} across {totalVisuals} visual{totalVisuals !== 1 ? 's' : ''}
                </p>

                {grouped.map(rpt => (
                  <div key={rpt.reportId} className="rounded-lg border overflow-hidden"
                    style={{ borderColor: 'rgba(0,86,179,0.15)' }}>
                    {/* Report header */}
                    <div className="flex items-center gap-2 px-3 py-2"
                      style={{ background: 'rgba(0,86,179,0.05)' }}>
                      <FileText className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                      <span className="text-xs font-semibold text-brand-800">{rpt.reportName}</span>
                      <span className="ml-auto text-[10px] text-slate-400">
                        {rpt.pages.reduce((s, p) => s + p.visuals.length, 0)} visual{rpt.pages.reduce((s, p) => s + p.visuals.length, 0) !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Pages */}
                    <div className="divide-y" style={{ borderColor: 'rgba(197,213,236,0.4)' }}>
                      {rpt.pages.map((pg, pi) => (
                        <div key={pi} className="px-3 py-2">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-px h-3 bg-slate-200 ml-1" />
                            <BookOpen className="h-3 w-3 text-tide-600 shrink-0" />
                            <span className="text-xs font-medium text-slate-700">{pg.pageName}</span>
                          </div>
                          <div className="space-y-1 ml-5">
                            {pg.visuals.map((vis, vi) => (
                              <div key={vi} className="flex items-center gap-1.5">
                                <ArrowRight className="h-2.5 w-2.5 text-slate-300 shrink-0" />
                                <VisualTypeIcon type={vis.type} />
                                <span className="text-xs text-slate-600 truncate">{vis.title}</span>
                                <span className="text-[10px] text-slate-400 shrink-0 ml-1 font-mono">({vis.type})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-4 px-3 rounded-xl"
                style={{ background: 'rgba(148,163,184,0.06)', border: '1px dashed rgba(148,163,184,0.30)' }}>
                <Eye className="h-5 w-5 text-slate-300 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-slate-500">Not consumed in any report visual</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">This item exists in the semantic model but is not referenced by any report visual.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function LineageTab({ workspaces }: { workspaces: FabricWorkspace[] }) {
  const [search, setSearch]               = useState('')
  const [typeFilter, setTypeFilter]       = useState<'all' | 'Measure' | 'Calc Column' | 'Calc Table'>('all')
  const [usageFilter, setUsageFilter]     = useState<'all' | 'used' | 'unused' | 'report-only'>('all')
  const [expandedKeys, setExpandedKeys]   = useState<Set<string>>(new Set())

  const all = buildLineageData(workspaces)

  const totalItems     = all.length
  const usedItems      = all.filter(x => x.usages.length > 0).length
  const unusedItems    = all.filter(x => x.usages.length === 0 && x.sourceType === 'model').length
  const reportOnlyItems = all.filter(x => x.sourceType === 'report-only').length

  const filtered = all.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (usageFilter === 'used' && item.usages.length === 0) return false
    if (usageFilter === 'unused' && (item.usages.length > 0 || item.sourceType === 'report-only')) return false
    if (usageFilter === 'report-only' && item.sourceType !== 'report-only') return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.name.toLowerCase().includes(q) && !item.modelName.toLowerCase().includes(q) && !item.table.toLowerCase().includes(q)) return false
    }
    return true
  })

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const expandAll   = () => setExpandedKeys(new Set(filtered.map(i => i.key)))
  const collapseAll = () => setExpandedKeys(new Set())

  return (
    <div className="space-y-5">
      {/* ── Stats banner ─────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: 'linear-gradient(135deg, rgba(0,86,179,0.06) 0%, rgba(0,132,212,0.03) 100%)',
          border: '1px solid rgba(0,86,179,0.12)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg"
            style={{ background: 'linear-gradient(135deg, #0056B3, #0084D4)', boxShadow: '0 2px 8px rgba(0,86,179,0.30)' }}>
            <Network className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Measure Lineage</h3>
          <span className="text-xs text-slate-400 ml-1">— trace DAX usage across reports and visuals</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Items',    value: totalItems,      color: '#0056B3', bg: 'rgba(0,86,179,0.08)',    border: 'rgba(0,86,179,0.20)' },
            { label: 'Used in Reports', value: usedItems,      color: '#0D9488', bg: 'rgba(13,148,136,0.08)', border: 'rgba(13,148,136,0.20)' },
            { label: 'Unused',          value: unusedItems,    color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.20)' },
            { label: 'Report-Only',     value: reportOnlyItems, color: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.20)' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center py-2.5 rounded-xl text-center"
              style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search + filters ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2"
            style={{ borderColor: 'rgba(197,213,236,0.8)', '--tw-ring-color': 'rgba(0,86,179,0.15)' } as React.CSSProperties}
            placeholder="Search by name, table, or model…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1">
          {(['all', 'Measure', 'Calc Column', 'Calc Table'] as const).map(t => (
            <button key={t}
              onClick={() => setTypeFilter(t)}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: typeFilter === t ? 'linear-gradient(135deg, #0056B3, #0084D4)' : 'rgba(0,86,179,0.06)',
                color: typeFilter === t ? '#fff' : '#0056B3',
                border: `1px solid ${typeFilter === t ? 'transparent' : 'rgba(0,86,179,0.18)'}`,
              }}>
              {t === 'all' ? 'All Types' : t}
            </button>
          ))}
        </div>

        {/* Usage filter */}
        <div className="flex items-center gap-1">
          {([
            ['all', 'All'],
            ['used', 'Used'],
            ['unused', 'Unused'],
            ['report-only', 'Report-Only'],
          ] as const).map(([val, lbl]) => (
            <button key={val}
              onClick={() => setUsageFilter(val)}
              className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: usageFilter === val ? '#0056B3' : 'rgba(148,163,184,0.08)',
                color: usageFilter === val ? '#fff' : '#64748b',
                border: `1px solid ${usageFilter === val ? 'transparent' : 'rgba(148,163,184,0.25)'}`,
              }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Expand/collapse all */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={expandAll}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-brand-50">
            Expand all
          </button>
          <button onClick={collapseAll}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-slate-50">
            Collapse all
          </button>
          <span className="text-xs text-slate-400">{filtered.length} items</span>
        </div>
      </div>

      {/* ── Lineage cards ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl"
            style={{ background: 'rgba(0,86,179,0.06)', border: '1px solid rgba(0,86,179,0.12)' }}>
            <Filter className="h-6 w-6 text-brand-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No items match your filters</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            {search ? `No items found for "${search}".` : 'Try adjusting the type or usage filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <LineageCard
              key={item.key}
              item={item}
              expanded={expandedKeys.has(item.key)}
              onToggle={() => toggleExpand(item.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
