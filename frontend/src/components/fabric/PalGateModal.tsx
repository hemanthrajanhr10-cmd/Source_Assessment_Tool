import { useState } from 'react'
import { ShieldCheck, ShieldAlert, Loader2, ExternalLink, Copy, Check } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { formatTime } from '../../utils/dateTime'
import type { PalLinkSessionStatus } from '../../types/api'

interface DeviceCode {
  userCode: string
  verificationUrl: string
  expiresAt: string | null
}

interface PalGateModalProps {
  isOpen: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  linkStage: PalLinkSessionStatus | 'idle'
  deviceCode: DeviceCode | null
  failureMessage: string | null
  docsUrl: string
  onStart: () => void
  onCancel: () => void
}

export default function PalGateModal({
  isOpen, onClose, triggerRef, linkStage, deviceCode, failureMessage, docsUrl, onStart, onCancel,
}: PalGateModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!deviceCode) return
    navigator.clipboard.writeText(deviceCode.userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      triggerRef={triggerRef}
      title="Connect PAL to view the full report"
      footer={
        linkStage === 'waiting_for_user' ? (
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-earth-600" />
              Waiting for you to sign in…
            </span>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                onClick={onStart}
                loading={linkStage === 'starting'}
                className="flex-1 justify-center"
              >
                {linkStage === 'failed' ? 'Try again' : 'Connect PAL'}
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
      {linkStage === 'waiting_for_user' && deviceCode ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Sign in with an Azure account that has access to this tenant. Open the link below on
            any device and enter the code:
          </p>
          <a
            href={deviceCode.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-earth-700 hover:text-earth-800 hover:underline transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            {deviceCode.verificationUrl}
          </a>
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-xl border-2 border-earth-200 bg-earth-50 px-5 py-3 text-center">
              <p className="text-xs text-earth-600/70 font-medium mb-0.5">Your code</p>
              <p className="text-2xl font-mono font-bold tracking-widest text-earth-700">{deviceCode.userCode}</p>
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-500 hover:bg-slate-100/50 hover:text-slate-700 transition-colors"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {deviceCode.expiresAt && (
            <p className="text-xs text-slate-400">Expires {formatTime(deviceCode.expiresAt)}</p>
          )}
        </div>
      ) : linkStage === 'starting' ? (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-earth-600" />
          Requesting a device code from Microsoft…
        </div>
      ) : linkStage === 'failed' ? (
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            The connection didn’t complete. See the reason below — you can try again right away.
          </p>
        </div>
      ) : (
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
      )}
    </Modal>
  )
}
