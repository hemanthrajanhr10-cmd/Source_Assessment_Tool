import type { MockPage, AssessmentStatus } from '../../data/mockReports'
import VisualCard from './VisualCard'

interface VisualGridProps {
  page: MockPage
  visualAssessments: Record<string, AssessmentStatus>
  onUpdateVisualStatus: (visualId: string, status: AssessmentStatus) => void
  onClickVisual: (visualId: string) => void
}

export default function VisualGrid({
  page,
  visualAssessments,
  onUpdateVisualStatus,
  onClickVisual,
}: VisualGridProps) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4"
      role="list"
      aria-label={`Visuals on page: ${page.name}`}
    >
      {page.visuals.map((visual, idx) => {
        const status: AssessmentStatus =
          visualAssessments[visual.id] ?? visual.assessmentStatus
        // First visual always spans 2 columns (wide KPI strip)
        const colSpan = idx === 0 ? 2 : 1

        return (
          <div
            key={visual.id}
            role="listitem"
            style={{ gridColumn: colSpan === 2 ? 'span 2' : undefined }}
          >
            <VisualCard
              visual={visual}
              assessmentStatus={status}
              onUpdateStatus={s => onUpdateVisualStatus(visual.id, s)}
              onClick={() => onClickVisual(visual.id)}
              colSpan={colSpan}
            />
          </div>
        )
      })}
    </div>
  )
}
