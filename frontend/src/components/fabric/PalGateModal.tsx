import { ShieldCheck, Loader2, RefreshCw } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import type { PalStatusValue } from '../../types/api'

interface PalGateModalProps {
  isOpen: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  status: PalStatusValue
  connecting: boolean
  failureMessage: string | null
  docsUrl: string
  onConnect: () => void
  onRefresh: () => void
}

export default function PalGateModal({
  isOpen, onClose, triggerRef, status, connecting, failureMessage, docsUrl, onConnect, onRefresh,
}: PalGateModalProps) {
  const isLinking = status === 'linking'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      triggerRef={triggerRef}
      title="Connect PAL to view the full report"
      footer={
        isLinking ? (
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-earth-600" />
              Connecting to Azure Partner Admin Link…
            </span>
            <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRefresh}>
              Refresh status
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button onClick={onConnect} loading={connecting} className="flex-1 justify-center">
                Connect PAL
              </Button>
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors whitespace-nowrap"
              >
                Learn more
              </a>
            </div>
            {failureMessage && (
              <p className="text-xs text-red-600 leading-relaxed">{failureMessage}</p>
            )}
          </div>
        )
      }
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-earth-50 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4.5 w-4.5 text-earth-600" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          This assessment isn’t connected to UBTI’s Azure Partner Admin Link yet. Connecting is a
          one-time step — sign in with an account that has access to this Azure tenant, and the
          full report unlocks immediately after.
        </p>
      </div>
    </Modal>
  )
}
