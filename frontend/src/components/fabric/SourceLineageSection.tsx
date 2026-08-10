/**
 * SourceLineageSection — Data origin tracing for Fabric semantic model tables.
 *
 * Shows the full chain: Source System → Ingestion Method → Lakehouse/Model Table → Reports
 * Confidence tiers: high (TMDL M expr + API match) · medium (TMDL only) · inferred (API, 1 source)
 */

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, ArrowRight, Server, Globe, FileSpreadsheet, Layers,
  GitMerge, Zap, AlertCircle, CheckCircle2, Info, Search,
  X, Filter, ChevronDown, ChevronUp, HelpCircle,
  Cloud, Share2, Table2, BookOpen,
} from 'lucide-react'
import type { FabricDataset, FabricTable, TableSourceLineage, FabricDatasetDatasource } from '../../types/api'

// ── Design tokens — kept in sync with LineageTab's T object ──────────────────

const C = {
  canvas:     '#F8FDFB',
  ink:        '#0D1117',
  ink2:       '#1E293B',
  mid:        '#475569',
  muted:      '#64748B',
  dim:        '#94A3B8',
  border:     'rgba(168,226,221,0.65)',
  borderSoft: 'rgba(197,213,236,0.45)',
  teal:       '#4DA8A0',
  tealDim:    'rgba(77,168,160,0.12)',
  tealGlow:   '0 4px 16px rgba(77,168,160,0.14), 0 1px 3px rgba(0,0,0,0.05)',
  shadow:     '0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.88)',
  shadowMd:   '0 4px 16px rgba(77,168,160,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.94)',
}

// ── Source type registry — icon, color, label ─────────────────────────────────

interface SourceMeta {
  label: string
  icon: React.ReactNode
  accent: string
  category: 'database' | 'cloud' | 'file' | 'api' | 'fabric'
}

const SOURCE_REGISTRY: Record<string, SourceMeta> = {
  Sql:                   { label: 'SQL Server',        icon: <Server size={14} />,          accent: '#0078D4', category: 'database' },
  PostgreSql:            { label: 'PostgreSQL',         icon: <Server size={14} />,          accent: '#336791', category: 'database' },
  MySql:                 { label: 'MySQL',              icon: <Server size={14} />,          accent: '#00758F', category: 'database' },
  Oracle:                { label: 'Oracle DB',          icon: <Server size={14} />,          accent: '#C74634', category: 'database' },
  Teradata:              { label: 'Teradata',           icon: <Server size={14} />,          accent: '#F58220', category: 'database' },
  Snowflake:             { label: 'Snowflake',          icon: <Cloud size={14} />,           accent: '#29B5E8', category: 'cloud' },
  Databricks:            { label: 'Databricks',         icon: <Zap size={14} />,             accent: '#FF3621', category: 'cloud' },
  AmazonRedshift:        { label: 'Amazon Redshift',    icon: <Cloud size={14} />,           accent: '#8C4FFF', category: 'cloud' },
  GoogleBigQuery:        { label: 'BigQuery',           icon: <Cloud size={14} />,           accent: '#4285F4', category: 'cloud' },
  SapHana:               { label: 'SAP HANA',           icon: <Database size={14} />,        accent: '#005CA9', category: 'database' },
  SapBw:                 { label: 'SAP BW',             icon: <Database size={14} />,        accent: '#005CA9', category: 'database' },
  Salesforce:            { label: 'Salesforce',         icon: <Cloud size={14} />,           accent: '#00A1E0', category: 'api' },
  Dynamics365:           { label: 'Dynamics 365',       icon: <Globe size={14} />,           accent: '#002050', category: 'api' },
  Dataverse:             { label: 'Dataverse',          icon: <Globe size={14} />,           accent: '#742774', category: 'api' },
  SharePointList:        { label: 'SharePoint List',    icon: <Share2 size={14} />,          accent: '#038387', category: 'api' },
  SharePointFiles:       { label: 'SharePoint Files',   icon: <FileSpreadsheet size={14} />, accent: '#217346', category: 'file' },
  OData:                 { label: 'OData Feed',         icon: <Globe size={14} />,           accent: '#0070CC', category: 'api' },
  Web:                   { label: 'Web / REST API',     icon: <Globe size={14} />,           accent: '#6366F1', category: 'api' },
  AzureBlobs:            { label: 'Azure Blob Storage', icon: <Cloud size={14} />,           accent: '#0078D4', category: 'cloud' },
  AzureDataLakeStorage:  { label: 'Azure Data Lake',    icon: <Layers size={14} />,          accent: '#0078D4', category: 'cloud' },
  Excel:                 { label: 'Excel Workbook',     icon: <FileSpreadsheet size={14} />, accent: '#217346', category: 'file' },
  CSV:                   { label: 'CSV File',           icon: <FileSpreadsheet size={14} />, accent: '#5A7A77', category: 'file' },
  Lakehouse:             { label: 'Lakehouse',          icon: <Layers size={14} />,          accent: '#4DA8A0', category: 'fabric' },
  Warehouse:             { label: 'Fabric Warehouse',   icon: <Layers size={14} />,          accent: '#4DA8A0', category: 'fabric' },
  Dataflow:              { label: 'Dataflow',           icon: <GitMerge size={14} />,        accent: '#D97706', category: 'fabric' },
  Unknown:               { label: 'Unknown Source',     icon: <HelpCircle size={14} />,      accent: '#94A3B8', category: 'database' },
}

function getSourceMeta(type: string): SourceMeta {
  return SOURCE_REGISTRY[type] ?? SOURCE_REGISTRY.Unknown
}

// ── Ingestion method chip ─────────────────────────────────────────────────────

const INGESTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Dataflow Gen2':   { bg: 'rgba(217,119,6,0.08)',   text: '#B45309', border: 'rgba(217,119,6,0.22)' },
  'Dataflow Gen1':   { bg: 'rgba(245,158,11,0.08)',  text: '#92400E', border: 'rgba(245,158,11,0.22)' },
  'Pipeline':        { bg: 'rgba(99,102,241,0.08)',  text: '#4338CA', border: 'rgba(99,102,241,0.22)' },
  'Notebook':        { bg: 'rgba(139,92,246,0.08)',  text: '#5B21B6', border: 'rgba(139,92,246,0.22)' },
  'Direct Import':   { bg: 'rgba(8,145,178,0.08)',   text: '#0E7490', border: 'rgba(8,145,178,0.22)' },
  'DirectQuery':     { bg: 'rgba(16,185,129,0.08)',  text: '#047857', border: 'rgba(16,185,129,0.22)' },
  'DirectLake':      { bg: 'rgba(20,184,166,0.08)',  text: '#0F766E', border: 'rgba(20,184,166,0.22)' },
}

function IngestionChip({ method }: { method: string }) {
  const clr = INGESTION_COLORS[method] ?? { bg: 'rgba(148,163,184,0.10)', text: '#64748B', border: 'rgba(148,163,184,0.25)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontWeight: 700,
      background: clr.bg, color: clr.text, border: `1px solid ${clr.border}`,
      letterSpacing: '0.02em', flexShrink: 0,
    }}>
      <Zap size={8} />{method}
    </span>
  )
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'inferred' }) {
  const map = {
    high:     { icon: <CheckCircle2 size={10} />, text: 'High Confidence',   bg: 'rgba(5,150,105,0.08)',  clr: '#047857', border: 'rgba(5,150,105,0.22)' },
    medium:   { icon: <Info size={10} />,          text: 'Medium Confidence', bg: 'rgba(217,119,6,0.08)',  clr: '#B45309', border: 'rgba(217,119,6,0.22)' },
    inferred: { icon: <AlertCircle size={10} />,   text: 'Inferred',          bg: 'rgba(148,163,184,0.10)', clr: '#64748B', border: 'rgba(148,163,184,0.25)' },
  }
  const m = map[level] ?? map.inferred
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700,
      background: m.bg, color: m.clr, border: `1px solid ${m.border}`,
      letterSpacing: '0.02em', flexShrink: 0,
    }}>
      {m.icon}{m.text}
    </span>
  )
}

// ── Flow arrow ────────────────────────────────────────────────────────────────

function FlowArrow({ accent }: { accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, padding: '0 2px' }}>
      <div style={{ width: 28, height: 1.5, background: `linear-gradient(90deg, ${accent}55, ${accent}CC)` }} />
      <ArrowRight size={12} style={{ color: accent, flexShrink: 0, marginLeft: -2 }} />
    </div>
  )
}

// ── Source node (leftmost block) ──────────────────────────────────────────────

function SourceNode({ lineage }: { lineage: TableSourceLineage }) {
  const meta = getSourceMeta(lineage.datasource_type)
  const hasOnPrem = !!lineage.gateway_id

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '12px 14px', borderRadius: 12,
      border: `1.5px solid ${meta.accent}30`,
      background: `${meta.accent}07`,
      boxShadow: `0 2px 8px ${meta.accent}12, inset 0 1px 0 rgba(255,255,255,0.92)`,
      minWidth: 160, maxWidth: 200, flexShrink: 0,
    }}>
      {/* Source type header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${meta.accent}15`, border: `1px solid ${meta.accent}25`,
        }}>
          <span style={{ color: meta.accent }}>{meta.icon}</span>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: C.ink2, lineHeight: 1.2 }}>
            {meta.label}
          </p>
          {hasOnPrem && (
            <span style={{ fontSize: 9, color: '#B45309', fontWeight: 600, letterSpacing: '0.04em' }}>
              ON-PREM GATEWAY
            </span>
          )}
        </div>
      </div>

      {/* Connection details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {lineage.server && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: C.dim, flexShrink: 0, paddingTop: 1 }}>SERVER</span>
            <span style={{
              fontSize: 10, fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              color: C.mid, wordBreak: 'break-all', lineHeight: 1.4,
            }}>{lineage.server}</span>
          </div>
        )}
        {lineage.database && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: C.dim, flexShrink: 0, paddingTop: 1 }}>DB</span>
            <span style={{
              fontSize: 10, fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              color: C.mid, wordBreak: 'break-all', lineHeight: 1.4,
            }}>{lineage.database}</span>
          </div>
        )}
        {lineage.url && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: C.dim, flexShrink: 0, paddingTop: 1 }}>URL</span>
            <span style={{
              fontSize: 10, fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              color: C.mid, wordBreak: 'break-all', lineHeight: 1.4, maxWidth: 130,
            }}>{lineage.url}</span>
          </div>
        )}
        {lineage.source_table && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9.5, fontWeight: 600, color: meta.accent, flexShrink: 0, paddingTop: 1 }}>TABLE</span>
            <span style={{
              fontSize: 10, fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              color: meta.accent, fontWeight: 700, lineHeight: 1.4,
            }}>{lineage.source_table}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Ingestion node (middle block) ─────────────────────────────────────────────

function IngestionNode({ lineage }: { lineage: TableSourceLineage }) {
  const method = lineage.ingestion_method ?? (
    lineage.datasource_type === 'Lakehouse' ? 'DirectLake' :
    lineage.datasource_type === 'Dataflow' ? 'Dataflow Gen2' : 'Direct Import'
  )

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center',
      padding: '10px 12px', borderRadius: 10,
      border: `1px solid ${C.borderSoft}`,
      background: 'white',
      boxShadow: C.shadow,
      minWidth: 120, maxWidth: 150, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <GitMerge size={12} style={{ color: C.muted }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Via
        </span>
      </div>
      <IngestionChip method={method} />
      {lineage.dataflow_name && (
        <span style={{
          fontSize: 9.5, color: C.muted, textAlign: 'center',
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          lineHeight: 1.3, wordBreak: 'break-word',
        }}>
          {lineage.dataflow_name}
        </span>
      )}
    </div>
  )
}

// ── Semantic model table node (rightmost block) ───────────────────────────────

function ModelTableNode({ table }: { table: FabricTable }) {
  const accent = '#4DA8A0'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '12px 14px', borderRadius: 12,
      border: `1.5px solid ${accent}35`,
      background: `${accent}06`,
      boxShadow: `0 2px 8px ${accent}10, inset 0 1px 0 rgba(255,255,255,0.92)`,
      minWidth: 150, maxWidth: 200, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}12`, border: `1px solid ${accent}22`,
        }}>
          <Table2 size={13} style={{ color: accent }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Model Table
          </p>
          <p style={{
            margin: 0, fontSize: 11.5, fontWeight: 700, color: C.ink2,
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          }}>
            {table.name}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
          background: 'rgba(8,145,178,0.07)', color: '#0E7490',
          border: '1px solid rgba(8,145,178,0.18)',
        }}>
          {table.storage_mode}
        </span>
        {table.columns && (
          <span style={{
            fontSize: 9.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
            background: 'rgba(148,163,184,0.10)', color: C.muted,
            border: '1px solid rgba(148,163,184,0.22)',
          }}>
            {table.columns.length} cols
          </span>
        )}
      </div>
    </div>
  )
}

// ── Full lineage flow row ─────────────────────────────────────────────────────

function LineageFlowRow({ table, animDelay }: { table: FabricTable; animDelay: number }) {
  const [expanded, setExpanded] = useState(false)
  const [hov, setHov] = useState(false)
  const lineage = table.source_lineage!
  const meta = getSourceMeta(lineage.datasource_type)
  const showIngestion = lineage.ingestion_method && lineage.ingestion_method !== 'Direct Import'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', duration: 0.45, bounce: 0, delay: animDelay * 0.001 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 14, overflow: 'hidden',
        border: `1.5px solid ${hov || expanded ? `${meta.accent}30` : C.border}`,
        background: expanded ? `${meta.accent}03` : 'white',
        boxShadow: hov ? C.shadowMd : C.shadow,
        transform: hov && !expanded ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(x => !x)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          width: '100%', cursor: 'pointer', background: 'none', border: 'none',
          textAlign: 'left', outline: 'none',
        }}
      >
        {/* Source icon */}
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${meta.accent}12`, border: `1px solid ${meta.accent}22`,
          boxShadow: hov ? `0 2px 6px ${meta.accent}18` : 'none',
          transition: 'box-shadow 0.18s ease',
        }}>
          <span style={{ color: meta.accent }}>{meta.icon}</span>
        </div>

        {/* Table name + source */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 700, color: C.ink2, lineHeight: 1.2,
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {table.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: meta.accent, fontWeight: 600 }}>{meta.label}</span>
            {lineage.server && (
              <>
                <span style={{ fontSize: 10, color: C.dim }}>·</span>
                <span style={{
                  fontSize: 10, color: C.muted,
                  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                }}>
                  {lineage.server}
                </span>
              </>
            )}
            {lineage.database && (
              <>
                <span style={{ fontSize: 10, color: C.dim }}>/</span>
                <span style={{
                  fontSize: 10, color: C.muted,
                  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120,
                }}>
                  {lineage.database}
                </span>
              </>
            )}
            {lineage.source_table && (
              <>
                <ArrowRight size={10} style={{ color: C.dim }} />
                <span style={{
                  fontSize: 10.5, color: meta.accent, fontWeight: 700,
                  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                }}>
                  {lineage.source_table}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {lineage.ingestion_method && <IngestionChip method={lineage.ingestion_method} />}
          <ConfidenceBadge level={lineage.confidence} />
          <div style={{ color: C.dim, display: 'flex' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </button>

      {/* Expanded flow diagram */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '16px 16px 20px',
              borderTop: `1px solid ${meta.accent}15`,
              background: `${meta.accent}03`,
            }}>
              {/* Flow diagram */}
              <p style={{
                margin: '0 0 14px', fontSize: 9.5, fontWeight: 800, color: C.dim,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Share2 size={9} /> Data Origin Path
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                flexWrap: 'wrap', rowGap: 12,
              }}>
                <SourceNode lineage={lineage} />
                <FlowArrow accent={meta.accent} />
                {showIngestion && (
                  <>
                    <IngestionNode lineage={lineage} />
                    <FlowArrow accent={C.teal} />
                  </>
                )}
                <ModelTableNode table={table} />
              </div>

              {/* Notes row */}
              {lineage.notes && (
                <div style={{
                  marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '9px 11px', borderRadius: 8,
                  background: 'rgba(148,163,184,0.07)',
                  border: '1px solid rgba(148,163,184,0.18)',
                }}>
                  <Info size={12} style={{ color: C.dim, flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{lineage.notes}</p>
                </div>
              )}

              {/* Gateway warning */}
              {lineage.gateway_id && (
                <div style={{
                  marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '9px 11px', borderRadius: 8,
                  background: 'rgba(217,119,6,0.06)',
                  border: '1px solid rgba(217,119,6,0.18)',
                }}>
                  <AlertCircle size={12} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#B45309' }}>
                      On-premises Data Gateway
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.muted, lineHeight: 1.4, fontFamily: 'ui-monospace, "JetBrains Mono", monospace' }}>
                      Gateway ID: {lineage.gateway_id}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── No-lineage placeholder row ────────────────────────────────────────────────

function NoLineageRow({ table, animDelay }: { table: FabricTable; animDelay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: animDelay * 0.001 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderRadius: 11, opacity: 0.55,
        border: `1px solid ${C.border}`,
        background: 'white', boxShadow: C.shadow,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(148,163,184,0.09)', border: '1px solid rgba(148,163,184,0.22)',
      }}>
        <Table2 size={12} style={{ color: C.dim }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 600, color: C.muted,
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {table.name}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.dim }}>
          {table.storage_mode} · source origin not resolved
        </p>
      </div>
      <span style={{
        fontSize: 9.5, padding: '2px 7px', borderRadius: 5,
        background: 'rgba(148,163,184,0.10)', color: C.dim,
        border: '1px solid rgba(148,163,184,0.18)', fontWeight: 600,
        letterSpacing: '0.03em',
      }}>
        No Lineage
      </span>
    </motion.div>
  )
}

// ── Model-level datasource overview strip ─────────────────────────────────────

function DatasourceStrip({ datasources }: { datasources: FabricDatasetDatasource[] }) {
  if (!datasources || datasources.length === 0) return null

  const unique = Array.from(
    new Map(datasources.map(d => [d.datasource_type, d])).values()
  )

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
      padding: '12px 14px', borderRadius: 12,
      border: `1px solid ${C.border}`,
      background: 'white', boxShadow: C.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
        <BookOpen size={12} style={{ color: C.dim }} />
        <span style={{ fontSize: 10, fontWeight: 800, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Registered Datasources
        </span>
      </div>
      {unique.map(ds => {
        const meta = getSourceMeta(ds.datasource_type)
        return (
          <div key={ds.datasource_type} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 8,
            background: `${meta.accent}09`, border: `1px solid ${meta.accent}22`,
          }}>
            <span style={{ color: meta.accent, display: 'flex' }}>{meta.icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: meta.accent }}>{meta.label}</p>
              {(ds.server || ds.url) && (
                <p style={{
                  margin: 0, fontSize: 9.5, color: C.muted,
                  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                  maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ds.server || ds.url}
                </p>
              )}
            </div>
            {ds.gateway_id && (
              <span style={{
                fontSize: 8.5, fontWeight: 700, color: '#B45309',
                background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.22)',
                borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em',
              }}>GATEWAY</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Category filter tabs ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All Tables',
  database: 'Database',
  cloud: 'Cloud',
  api: 'API / SaaS',
  file: 'File',
  fabric: 'Fabric Native',
  none: 'No Lineage',
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SourceLineageSection({ ds }: { ds: FabricDataset }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { lineageTables, noLineageTables, categoryCounts } = useMemo(() => {
    const lt = ds.tables.filter(t => t.source_lineage && !t.is_calculated)
    const nl = ds.tables.filter(t => !t.source_lineage && !t.is_calculated)
    const counts: Record<string, number> = { all: lt.length }
    lt.forEach(t => {
      const cat = getSourceMeta(t.source_lineage!.datasource_type).category
      counts[cat] = (counts[cat] ?? 0) + 1
    })
    if (nl.length > 0) counts.none = nl.length
    return { lineageTables: lt, noLineageTables: nl, categoryCounts: counts }
  }, [ds.tables])

  const visibleLineage = useMemo(() => {
    let rows = lineageTables
    if (categoryFilter !== 'all' && categoryFilter !== 'none') {
      rows = rows.filter(t => getSourceMeta(t.source_lineage!.datasource_type).category === categoryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.source_lineage?.datasource_type ?? '').toLowerCase().includes(q) ||
        (t.source_lineage?.server ?? '').toLowerCase().includes(q) ||
        (t.source_lineage?.database ?? '').toLowerCase().includes(q) ||
        (t.source_lineage?.source_table ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [lineageTables, categoryFilter, search])

  const showNoLineage = categoryFilter === 'all' || categoryFilter === 'none'

  const totalWithLineage = lineageTables.length
  const totalTables = ds.tables.filter(t => !t.is_calculated).length
  const coveragePct = totalTables > 0 ? Math.round((totalWithLineage / totalTables) * 100) : 0

  // Summary stats for confidence
  const highConf   = lineageTables.filter(t => t.source_lineage?.confidence === 'high').length
  const medConf    = lineageTables.filter(t => t.source_lineage?.confidence === 'medium').length
  const infConf    = lineageTables.filter(t => t.source_lineage?.confidence === 'inferred').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Coverage summary bar ──────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        {[
          { label: 'Coverage', value: `${coveragePct}%`, sub: `${totalWithLineage} of ${totalTables} tables`, accent: C.teal },
          { label: 'High Confidence', value: highConf, sub: 'TMDL + API match', accent: '#047857' },
          { label: 'Medium Confidence', value: medConf, sub: 'TMDL M expr only', accent: '#B45309' },
          { label: 'Inferred', value: infConf, sub: 'Model datasource', accent: '#64748B' },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} style={{
            padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${accent}22`,
            background: `${accent}06`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 700, color: C.ink2 }}>{label}</p>
            <p style={{ margin: '1px 0 0', fontSize: 10, color: C.dim }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted }}>Source Resolution Coverage</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.teal }}>{coveragePct}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 9999, background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${coveragePct}%` }}
            transition={{ type: 'spring', duration: 0.8, bounce: 0 }}
            style={{ height: '100%', borderRadius: 9999, background: `linear-gradient(90deg, ${C.teal}, #6CBDB5)` }}
          />
        </div>
      </div>

      {/* Datasource strip */}
      {ds.datasources && ds.datasources.length > 0 && (
        <DatasourceStrip datasources={ds.datasources} />
      )}

      {/* ── Search + category filter ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Search size={12} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: C.dim, pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tables, sources, schemas…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 28, paddingRight: search ? 26 : 10,
              paddingTop: 6, paddingBottom: 6, fontSize: 12, borderRadius: 8,
              border: `1px solid ${C.border}`, background: 'white',
              color: C.ink2, outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = C.teal }}
            onBlur={e => { e.currentTarget.style.borderColor = C.border }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: C.dim,
                padding: 2, display: 'flex',
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const count = categoryCounts[key]
            if (count === undefined) return null
            const active = categoryFilter === key
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(active ? 'all' : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: `1px solid ${active ? C.teal : C.borderSoft}`,
                  background: active ? `${C.teal}10` : 'white',
                  color: active ? C.teal : C.muted,
                  transition: 'all 0.14s ease',
                }}
              >
                <Filter size={9} />
                {label}
                <span style={{
                  fontSize: 9.5, fontWeight: 800,
                  background: active ? `${C.teal}20` : 'rgba(148,163,184,0.12)',
                  color: active ? C.teal : C.dim,
                  borderRadius: 10, padding: '0 5px',
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Table rows ────────────────────────────────────────────────────────── */}
      {totalWithLineage === 0 && noLineageTables.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '52px 20px', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(148,163,184,0.09)', border: `1px solid ${C.border}`,
          }}>
            <Share2 size={20} style={{ color: C.dim }} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
            No source lineage data available. Run a new assessment to extract
            datasource connections and M expression partitions.
          </p>
        </div>
      )}

      {visibleLineage.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
          {visibleLineage.map((table, i) => (
            <LineageFlowRow key={table.name} table={table} animDelay={i * 40} />
          ))}
        </div>
      )}

      {search.trim() && visibleLineage.length === 0 && (
        <div style={{ textAlign: 'center', padding: '36px 0', color: C.dim, fontSize: 12 }}>
          No tables match &ldquo;{search}&rdquo;
        </div>
      )}

      {/* No-lineage tables (collapsed at bottom) */}
      {showNoLineage && noLineageTables.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{
            cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.dim,
            listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 0', userSelect: 'none',
          }}>
            <ChevronDown size={12} />
            {noLineageTables.length} table{noLineageTables.length !== 1 ? 's' : ''} with no resolved source
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
            {noLineageTables.map((t, i) => (
              <NoLineageRow key={t.name} table={t} animDelay={i * 25} />
            ))}
          </div>
        </details>
      )}

      {/* Info note */}
      <div style={{
        marginTop: 20, display: 'flex', gap: 10,
        padding: '11px 14px', borderRadius: 10,
        background: 'rgba(77,168,160,0.05)', border: `1px solid ${C.teal}22`,
      }}>
        <Info size={13} style={{ color: C.teal, flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          <strong style={{ color: C.mid }}>How lineage is resolved:</strong> Source connection details are
          extracted from two places — the Power BI Datasources API (model-level) and Power Query M
          expressions in TMDL partition blocks (table-level). Column-level lineage requires Azure SQL
          with admin metadata scanning enabled.{' '}
          <strong style={{ color: C.mid }}>Ingestion via Notebook or Pipeline</strong> is detected via the
          Fabric Admin Scanner API lineage flag; those tables show as &ldquo;inferred&rdquo; confidence.
        </div>
      </div>
    </div>
  )
}
