import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, Table2 } from 'lucide-react'
import type { FabricWorkspace, ReportPage, ReportVisual, FabricReport } from '../../types/api'
import type { MockReport, MockPage, MockVisual, AssessmentStatus } from '../../data/mockReports'
import { mockReports } from '../../data/mockReports'
import Breadcrumb from './Breadcrumb'
import LineageExplorer from './LineageExplorer'
import ReportCanvasView from './ReportCanvasView'
import VisualDetailModal from './VisualDetailModal'
import ReportMetadataView from './ReportMetadataView'
import type { VisualChecklist } from './VisualDetailModal'

interface ReportsSegmentProps {
  workspaces: FabricWorkspace[]
}

type NavLevel = 'list' | 'report'
type ReportViewMode = 'canvas' | 'metadata'

// ── Conversion helpers ────────────────────────────────────────────────────────

function convertVisual(rv: ReportVisual, pageId: string, vidx: number): MockVisual {
  return {
    id: `${pageId}-v${vidx}`,
    title: rv.title || rv.type || `Visual ${vidx + 1}`,
    type: rv.type || 'Card',
    assessmentStatus: 'not-assessed',
    mockValue: rv.field_count > 0 ? `${rv.field_count} field${rv.field_count !== 1 ? 's' : ''}` : undefined,
    mockSubtitle: rv.fields.length > 0 ? rv.fields[0].name : undefined,
    fields: rv.fields,
    x: rv.x,
    y: rv.y,
    width: rv.width,
    height: rv.height,
    text_content: rv.text_content,
  }
}

function convertPage(rp: ReportPage, reportId: string): MockPage {
  const pid = `${reportId}-p${rp.order}`
  return {
    id: pid,
    name: rp.name || `Page ${rp.order + 1}`,
    page_width: rp.page_width,
    page_height: rp.page_height,
    visuals: rp.visuals.map((v, i) => convertVisual(v, pid, i)),
  }
}

function workspacesToMockReports(workspaces: FabricWorkspace[]): MockReport[] {
  const results: MockReport[] = []
  for (const ws of workspaces) {
    for (const report of ws.reports) {
      const pages: MockPage[] = report.pages.map(p => convertPage(p, report.id))

      if (pages.length === 0 && (report.page_count ?? 0) > 0) {
        const count = report.page_count ?? 1
        for (let i = 0; i < count; i++) {
          pages.push({ id: `${report.id}-p${i}`, name: `Page ${i + 1}`, visuals: [] })
        }
      }

      results.push({
        id: report.id,
        name: report.name,
        lastRefreshed: new Date().toISOString(),
        pageCount: report.page_count ?? pages.length,
        assessmentStatus: 'not-assessed',
        workspaceName: ws.name,
        pages,
      })
    }
  }
  return results
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsSegment({ workspaces }: ReportsSegmentProps) {
  const [navLevel, setNavLevel] = useState<NavLevel>('list')
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [selectedVisual, setSelectedVisual] = useState<MockVisual | null>(null)
  const [visualAssessments, setVisualAssessments] = useState<Record<string, AssessmentStatus>>({})
  const [reportViewMode, setReportViewMode] = useState<ReportViewMode>('canvas')

  // Selected workspace managed here so breadcrumbs stay in sync
  const [lineageWorkspace, setLineageWorkspace] = useState<import('../../types/api').FabricWorkspace | null>(null)

  // Derive flat report list for canvas lookup
  const apiReports = workspacesToMockReports(workspaces)
  const reports: MockReport[] = apiReports.length > 0 ? apiReports : mockReports

  const selectedReport = reports.find(r => r.id === selectedReportId) ?? null

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleSelectReport = (reportId: string, workspaceName: string) => {
    setSelectedReportId(reportId)
    setNavLevel('report')
    setReportViewMode('canvas')
    // Preserve lineageWorkspace for breadcrumb — find it from workspaces if needed
    if (!lineageWorkspace) {
      const ws = workspaces.find(w => w.name === workspaceName) ?? null
      setLineageWorkspace(ws)
    }
  }

  const handleBackToLineage = () => {
    setNavLevel('list')
    setSelectedReportId(null)
    setSelectedVisual(null)
    // keep lineageWorkspace so we return to the same workspace's lineage
  }

  const handleBackToWorkspacePicker = () => {
    setNavLevel('list')
    setSelectedReportId(null)
    setSelectedVisual(null)
    setLineageWorkspace(null)
  }

  // ── Visual assessment ───────────────────────────────────────────────────────

  const handleUpdateVisualStatus = (visualId: string, status: AssessmentStatus) => {
    setVisualAssessments(prev => ({ ...prev, [visualId]: status }))
  }

  const handleSaveAssessment = (
    status: AssessmentStatus,
    _checklist: VisualChecklist,
    _notes: string,
  ) => {
    if (selectedVisual) {
      handleUpdateVisualStatus(selectedVisual.id, status)
    }
    setSelectedVisual(null)
  }

  // ── Breadcrumb ──────────────────────────────────────────────────────────────

  const breadcrumbItems = (() => {
    const root = {
      label: 'Reports',
      onClick: lineageWorkspace || navLevel === 'report' ? handleBackToWorkspacePicker : undefined,
    }

    if (navLevel === 'list' && lineageWorkspace) {
      return [root, { label: lineageWorkspace.name, onClick: undefined }]
    }

    if (navLevel === 'report' && selectedReport) {
      const items = [root]
      if (lineageWorkspace) {
        items.push({ label: lineageWorkspace.name, onClick: handleBackToLineage })
      }
      items.push({ label: selectedReport.name, onClick: undefined })
      return items
    }

    return [root]
  })()

  // ── Render ──────────────────────────────────────────────────────────────────

  const visualAssessmentStatus: AssessmentStatus =
    selectedVisual
      ? (visualAssessments[selectedVisual.id] ?? selectedVisual.assessmentStatus)
      : 'not-assessed'

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100%',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {navLevel === 'list' && (
          <LineageExplorer
            workspaces={workspaces}
            selectedWorkspace={lineageWorkspace}
            onWorkspaceSelect={setLineageWorkspace}
            onSelectReport={handleSelectReport}
          />
        )}

        {navLevel === 'report' && selectedReport && (() => {
          // Resolve the API report and its workspace for metadata view
          const apiReport: FabricReport | undefined = workspaces
            .flatMap(ws => ws.reports)
            .find(r => r.id === selectedReport.id)
          const apiWorkspace = workspaces.find(ws =>
            ws.reports.some(r => r.id === selectedReport.id),
          )

          const VIEWS = [
            { mode: 'canvas'   as const, label: 'Report View',  icon: <Eye size={12} />    },
            { mode: 'metadata' as const, label: 'Metadata',     icon: <Table2 size={12} /> },
          ] as const

          return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* ── Animated toggle bar ──────────────────────────────────── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
                borderBottom: '1px solid rgba(197,213,236,0.65)',
                background: 'linear-gradient(180deg, #F7FDFB 0%, #EFF9F7 100%)',
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#94A3B8',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>View</span>

                {/* Pill switcher */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  padding: 3, gap: 2,
                  background: 'rgba(108,189,181,0.08)',
                  border: '1px solid rgba(108,189,181,0.22)',
                  borderRadius: 10,
                  position: 'relative',
                }}>
                  {VIEWS.map(({ mode, label, icon }) => (
                    <button
                      key={mode}
                      onClick={() => setReportViewMode(mode)}
                      style={{
                        position: 'relative', zIndex: 1,
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 13px', borderRadius: 7, cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 600, border: 'none',
                        background: 'transparent',
                        color: reportViewMode === mode ? '#fff' : '#475569',
                        transition: 'color 150ms cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      {/* Sliding background pill */}
                      {reportViewMode === mode && (
                        <motion.span
                          layoutId="view-pill"
                          style={{
                            position: 'absolute', inset: 0, zIndex: -1,
                            borderRadius: 7,
                            background: 'linear-gradient(135deg, #6CBDB5, #93CCC6)',
                            boxShadow: '0 2px 8px rgba(108,189,181,0.40)',
                          }}
                          transition={{ type: 'spring', duration: 0.32, bounce: 0.15 }}
                        />
                      )}
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>

                {/* Report name chip */}
                <motion.span
                  key={selectedReport.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                  style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#475569',
                    background: 'rgba(100,116,139,0.08)',
                    border: '1px solid rgba(100,116,139,0.15)',
                    padding: '3px 10px', borderRadius: 7,
                    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {selectedReport.name}
                </motion.span>
              </div>

              {/* ── Panel with AnimatePresence slide ─────────────────────── */}
              <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                <AnimatePresence mode="wait">
                  {reportViewMode === 'canvas' && (
                    <motion.div
                      key="canvas"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                      className="p-4 h-full"
                    >
                      <ReportCanvasView
                        report={selectedReport}
                        onVisualClick={setSelectedVisual}
                      />
                    </motion.div>
                  )}
                  {reportViewMode === 'metadata' && apiReport && apiWorkspace && (
                    <motion.div
                      key="metadata"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                      style={{ padding: '0 16px 16px' }}
                    >
                      <ReportMetadataView report={apiReport} workspace={apiWorkspace} />
                    </motion.div>
                  )}
                  {reportViewMode === 'metadata' && (!apiReport || !apiWorkspace) && (
                    <motion.div
                      key="no-meta"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ padding: 24, color: '#94A3B8', fontSize: 13, fontStyle: 'italic' }}
                    >
                      Metadata not available for this report.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Visual detail modal */}
      {selectedVisual && (
        <VisualDetailModal
          visual={selectedVisual}
          assessmentStatus={visualAssessmentStatus}
          onClose={() => setSelectedVisual(null)}
          onSave={handleSaveAssessment}
        />
      )}
    </div>
  )
}
