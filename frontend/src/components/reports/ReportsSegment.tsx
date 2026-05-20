import { useState } from 'react'
import type { FabricWorkspace, ReportPage, ReportVisual } from '../../types/api'
import type { MockReport, MockPage, MockVisual, AssessmentStatus } from '../../data/mockReports'
import { mockReports } from '../../data/mockReports'
import Breadcrumb from './Breadcrumb'
import LineageExplorer from './LineageExplorer'
import ReportCanvasView from './ReportCanvasView'
import VisualDetailModal from './VisualDetailModal'
import type { VisualChecklist } from './VisualDetailModal'

interface ReportsSegmentProps {
  workspaces: FabricWorkspace[]
}

type NavLevel = 'list' | 'report'

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

        {navLevel === 'report' && selectedReport && (
          <div className="p-4 h-full">
            <ReportCanvasView
              report={selectedReport}
              onVisualClick={setSelectedVisual}
            />
          </div>
        )}
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
