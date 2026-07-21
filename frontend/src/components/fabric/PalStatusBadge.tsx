import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { PalStatusValue } from '../../types/api'

export default function PalStatusBadge({ status }: { status: PalStatusValue }) {
  switch (status) {
    case 'linked':
      return (
        <Badge variant="success">
          <ShieldCheck className="h-3 w-3" /> PAL Linked
        </Badge>
      )
    case 'linking':
      return (
        <Badge variant="info">
          <Loader2 className="h-3 w-3 animate-spin" /> PAL Connecting…
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="warning">
          <ShieldAlert className="h-3 w-3" /> PAL Not Connected
        </Badge>
      )
    default:
      return (
        <Badge variant="neutral">
          <ShieldQuestion className="h-3 w-3" /> PAL Not Linked
        </Badge>
      )
  }
}
