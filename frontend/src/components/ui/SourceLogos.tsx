/** Inline SVG brand logos — no external path dependencies, unique gradient IDs */

type LogoProps = { size?: number; className?: string }

export function SqlServerLogo({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <ellipse cx="24" cy="11" rx="18" ry="6" fill="#CC2936"/>
      <rect x="6" y="11" width="36" height="26" fill="#CC2936"/>
      <ellipse cx="24" cy="37" rx="18" ry="6" fill="#A81C26"/>
      <ellipse cx="24" cy="11" rx="18" ry="6" fill="#E84855" opacity="0.6"/>
      <ellipse cx="20" cy="9.5" rx="8" ry="2.5" fill="white" opacity="0.25"/>
      <text x="24" y="27" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="9" fill="white">SQL</text>
    </svg>
  )
}

export function FabricLogo({ size = 24, className }: LogoProps) {
  const id = 'fab'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${id}1`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0078D4"/>
          <stop offset="100%" stopColor="#00BCF2"/>
        </linearGradient>
        <linearGradient id={`${id}2`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00BCF2"/>
          <stop offset="100%" stopColor="#50E6FF"/>
        </linearGradient>
        <linearGradient id={`${id}3`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0078D4"/>
          <stop offset="100%" stopColor="#0F3058"/>
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="16" height="16" rx="3" fill={`url(#${id}1)`}/>
      <rect x="26" y="6" width="16" height="16" rx="3" fill={`url(#${id}2)`}/>
      <rect x="6" y="26" width="16" height="16" rx="3" fill={`url(#${id}3)`}/>
      <rect x="26" y="26" width="16" height="16" rx="3" fill={`url(#${id}1)`} opacity="0.75"/>
    </svg>
  )
}

export function SnowflakeLogo({ size = 24, className }: LogoProps) {
  const id = 'snw'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#29B5E8"/>
          <stop offset="100%" stopColor="#0099CC"/>
        </linearGradient>
      </defs>
      <rect x="21.5" y="4" width="5" height="40" rx="2.5" fill={`url(#${id}g)`}/>
      <rect x="4" y="19.5" width="40" height="5" rx="2.5" fill={`url(#${id}g)`}/>
      <rect x="4" y="19.5" width="40" height="5" rx="2.5" fill={`url(#${id}g)`} transform="rotate(60 24 24)"/>
      <rect x="4" y="19.5" width="40" height="5" rx="2.5" fill={`url(#${id}g)`} transform="rotate(-60 24 24)"/>
      <circle cx="24" cy="24" r="4.5" fill="white"/>
      <circle cx="24" cy="24" r="3" fill="#29B5E8"/>
    </svg>
  )
}

export function TableauLogo({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="20" y="4" width="8" height="40" rx="2" fill="#E8751A"/>
      <rect x="4" y="20" width="40" height="8" rx="2" fill="#E8751A"/>
      <rect x="6" y="6" width="10" height="10" rx="2" fill="#E8751A" opacity="0.6"/>
      <rect x="32" y="6" width="10" height="10" rx="2" fill="#E8751A" opacity="0.6"/>
      <rect x="6" y="32" width="10" height="10" rx="2" fill="#E8751A" opacity="0.6"/>
      <rect x="32" y="32" width="10" height="10" rx="2" fill="#E8751A" opacity="0.6"/>
      <rect x="20" y="20" width="8" height="8" rx="1" fill="#FFB81C"/>
    </svg>
  )
}

export function DataverseLogo({ size = 24, className }: LogoProps) {
  const id = 'dvs'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${id}1`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#742774"/>
          <stop offset="100%" stopColor="#C084FC"/>
        </linearGradient>
        <linearGradient id={`${id}2`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9333EA"/>
          <stop offset="100%" stopColor="#6B21A8"/>
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="24" rx="19" ry="10" stroke={`url(#${id}1)`} strokeWidth="3.5" fill="none"/>
      <ellipse cx="24" cy="24" rx="19" ry="10" stroke={`url(#${id}2)`} strokeWidth="3.5" fill="none" transform="rotate(60 24 24)"/>
      <ellipse cx="24" cy="24" rx="19" ry="10" stroke={`url(#${id}1)`} strokeWidth="3.5" fill="none" transform="rotate(-60 24 24)"/>
      <circle cx="24" cy="24" r="4" fill={`url(#${id}2)`}/>
      <circle cx="24" cy="24" r="2" fill="white" opacity="0.7"/>
    </svg>
  )
}

export function SapLogo({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="48" height="48" rx="8" fill="#009BD7"/>
      <text x="24" y="31" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="900" fontSize="18" letterSpacing="1" fill="white">SAP</text>
    </svg>
  )
}

export function SageIntacctLogo({ size = 24, className }: LogoProps) {
  const id = 'sgi'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00DC82"/>
          <stop offset="100%" stopColor="#00A65A"/>
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="10" fill={`url(#${id}g)`}/>
      <text x="24" y="32" textAnchor="middle" fontFamily="Arial,Helvetica,sans-serif" fontWeight="900" fontSize="22" fill="white">Si</text>
    </svg>
  )
}

export function UnifiedLogo({ size = 24, className }: LogoProps) {
  const id = 'uni'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${id}1`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0056B3"/>
          <stop offset="100%" stopColor="#0084D4"/>
        </linearGradient>
        <linearGradient id={`${id}2`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0D9488"/>
          <stop offset="100%" stopColor="#2DD4BF"/>
        </linearGradient>
      </defs>
      <circle cx="18" cy="24" r="13" fill={`url(#${id}1)`} opacity="0.85"/>
      <circle cx="30" cy="24" r="13" fill={`url(#${id}2)`} opacity="0.85"/>
      <path d="M24 13.2 A13 13 0 0 1 24 34.8 A13 13 0 0 1 24 13.2Z" fill="white" opacity="0.15"/>
      <circle cx="24" cy="24" r="4" fill="white" opacity="0.9"/>
      <path d="M22 24 L26 24M24 22 L24 26" stroke="#0056B3" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
