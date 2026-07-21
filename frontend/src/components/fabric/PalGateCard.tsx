import { ShieldCheck, Loader2 } from 'lucide-react'
import Button from '../ui/Button'
import type { PalStatusValue } from '../../types/api'

interface PalGateCardProps {
  status: PalStatusValue
  onConnect: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export default function PalGateCard({ status, onConnect }: PalGateCardProps) {
  const isLinking = status === 'linking'

  return (
    <div className="card flex flex-col items-center gap-4 py-14 px-6 text-center">
      <div className="h-12 w-12 rounded-full bg-earth-50 flex items-center justify-center">
        {isLinking
          ? <Loader2 className="h-5 w-5 text-earth-600 animate-spin" />
          : <ShieldCheck className="h-5 w-5 text-earth-600" />}
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-slate-800">
          {isLinking ? 'Connecting to Azure Partner Admin Link…' : 'Connect PAL to view the full report'}
        </p>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          {isLinking
            ? 'This is usually near-instant. You can keep this page open — the report unlocks automatically.'
            : 'A one-time Azure sign-in connects this assessment to UBTI’s Partner Admin Link, then the full report unlocks.'}
        </p>
      </div>
      <Button onClick={onConnect} size="sm">
        {isLinking ? 'Check status' : 'Connect PAL'}
      </Button>
    </div>
  )
}
