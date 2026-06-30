/** Brand logos — all sourced from src_logos/ via Vite asset imports */

import sqlServerUrl    from '../../assets/src_logos/SqlServer.svg'
import salesforceUrl  from '../../assets/src_logos/Salesforce.svg'
import sapUrl          from '../../assets/src_logos/SAP.svg'
import sageIntacctUrl  from '../../assets/src_logos/Sage.svg'
import fabricUrl       from '../../assets/src_logos/Fabric.png'
import snowflakeUrl    from '../../assets/src_logos/Snowflake_Logo.png'
import tableauUrl      from '../../assets/src_logos/Tableau.png'
import dataverseUrl    from '../../assets/src_logos/Dataverse_logo.png'
import mysqlUrl        from '../../assets/src_logos/MySQL.png'
import oracleUrl       from '../../assets/src_logos/Oracle.jpg'
import databricksUrl   from '../../assets/src_logos/Databricks.png'
import inforUrl        from '../../assets/src_logos/infor.png'

import postgresqlUrl   from '../../assets/src_logos/Postgresql.png'
import ibmDb2Url      from '../../assets/src_logos/IBM_Db2.png'

type LogoProps = { size?: number; className?: string }

/**
 * Fixed-box icon slot: renders a square container of `size × size` px with
 * the image centered inside via object-fit:contain. Every logo occupies the
 * same predictable slot regardless of the source image's aspect ratio.
 */
function IconSlot({
  src, alt, size, className,
}: { src: string; alt: string; size: number; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        objectPosition: 'center',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

/**
 * Full/wordmark logo: fixed height, auto width, capped at maxWidth.
 * Use for hero banners where the logo sits beside or above text.
 */
function WordmarkLogo({
  src, alt, height, maxWidth, className,
}: {
  src: string; alt: string; height: number; maxWidth?: number; className?: string
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        height,
        width: 'auto',
        maxWidth: maxWidth ?? 240,
        objectFit: 'contain',
        objectPosition: 'left center',
        display: 'block',
        flexShrink: 0,
      }}
    />
  )
}

// ── SVG logos ─────────────────────────────────────────────────────────────────

export function SqlServerLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={sqlServerUrl} alt="SQL Server" size={size} className={className} />
}

export function SapLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={sapUrl} alt="SAP" size={size} className={className} />
}

export function SageIntacctLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={sageIntacctUrl} alt="Sage Intacct" size={size} className={className} />
}

// ── PNG logos ─────────────────────────────────────────────────────────────────

export function FabricLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={fabricUrl} alt="Microsoft Fabric" size={size} className={className} />
}

export function SnowflakeLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={snowflakeUrl} alt="Snowflake" size={size} className={className} />
}

/** Alias — used in sidebar where only the mark is needed */
export function SnowflakeIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={snowflakeUrl} alt="Snowflake" size={size} className={className} />
}

export function TableauLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={tableauUrl} alt="Tableau" size={size} className={className} />
}

export function DataverseLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={dataverseUrl} alt="Microsoft Dataverse" size={size} className={className} />
}

/** Alias — used in sidebar where only the mark is needed */
export function DataverseIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={dataverseUrl} alt="Microsoft Dataverse" size={size} className={className} />
}

export function MySQLFullLogo({ height = 44, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={mysqlUrl}
      alt="MySQL"
      height={height}
      maxWidth={80}
      className={className}
    />
  )
}

export function OracleFullLogo({ height = 22, className }: { height?: number; className?: string }) {
  return (
    <img
      src={oracleUrl}
      alt="Oracle"
      className={className}
      style={{
        height,
        width: 'auto',
        maxWidth: 100,
        objectFit: 'contain',
        objectPosition: 'center center',
        display: 'block',
        flexShrink: 0,
      }}
    />
  )
}

export function PostgreSQLIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={postgresqlUrl} alt="PostgreSQL" size={size} className={className} />
}

export function SnowflakeFullLogo({ height = 28, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={snowflakeUrl}
      alt="Snowflake"
      height={height}
      maxWidth={200}
      className={className}
    />
  )
}

export function DataverseFullLogo({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={dataverseUrl}
      alt="Dataverse"
      height={height}
      maxWidth={220}
      className={className}
    />
  )
}

export function SalesforceLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={salesforceUrl} alt="Salesforce" size={size} className={className} />
}

/** Alias — used in sidebar where only the mark is needed */
export function SalesforceIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={salesforceUrl} alt="Salesforce" size={size} className={className} />
}

export function SalesforceFullLogo({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={salesforceUrl}
      alt="Salesforce"
      height={height}
      maxWidth={220}
      className={className}
    />
  )
}

// ── SourceSAT brand mark (app logo) ──────────────────────────────────────────

/**
 * The SourceSAT application logo mark.
 * A precision instrument reticle motif — layered rings with a central data node
 * and radiating scan lines, suggesting assessment, analysis, and targeting.
 * Uses OKLCH-safe ink blues with teal accent.
 */
export function SourceSATLogo({ size = 24, className }: LogoProps) {
  const s = size
  const cx = s / 2
  const cy = s / 2
  const id = 'sat-logo'

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SourceSAT"
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="38%" cy="32%" r="70%">
          <stop offset="0%"   stopColor="#4DA8A0" />
          <stop offset="100%" stopColor="#25706A" />
        </radialGradient>
        <radialGradient id={`${id}-node`} cx="35%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#93CCC6" />
          <stop offset="100%" stopColor="#6CBDB5" />
        </radialGradient>
        <linearGradient id={`${id}-teal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#93CCC6" />
          <stop offset="100%" stopColor="#4DA8A0" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={s * 0.04} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Rounded square background */}
      <rect
        x="0" y="0" width={s} height={s}
        rx={s * 0.22}
        fill={`url(#${id}-bg)`}
      />

      {/* Specular top-left highlight */}
      <rect
        x="0" y="0" width={s} height={s}
        rx={s * 0.22}
        fill="url(#sat-spec)"
        opacity="0.18"
      />
      <defs>
        <linearGradient id="sat-spec" x1="0" y1="0" x2="0.7" y2="0.7">
          <stop offset="0%"   stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer reticle ring */}
      <circle
        cx={cx} cy={cy}
        r={s * 0.36}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={s * 0.028}
        fill="none"
      />

      {/* Four tick marks on outer ring (N/S/E/W) */}
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180
        const r1  = s * 0.36
        const r2  = s * 0.42
        return (
          <line
            key={deg}
            x1={cx + Math.cos(rad) * r1}
            y1={cy + Math.sin(rad) * r1}
            x2={cx + Math.cos(rad) * r2}
            y2={cy + Math.sin(rad) * r2}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={s * 0.030}
            strokeLinecap="round"
          />
        )
      })}

      {/* Inner ring */}
      <circle
        cx={cx} cy={cy}
        r={s * 0.22}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={s * 0.022}
        fill="none"
      />

      {/* Cross-hair lines */}
      <line x1={cx - s * 0.44} y1={cy} x2={cx - s * 0.24} y2={cy}
        stroke="rgba(255,255,255,0.30)" strokeWidth={s * 0.024} strokeLinecap="round" />
      <line x1={cx + s * 0.24} y1={cy} x2={cx + s * 0.44} y2={cy}
        stroke="rgba(255,255,255,0.30)" strokeWidth={s * 0.024} strokeLinecap="round" />
      <line x1={cx} y1={cy - s * 0.44} x2={cx} y2={cy - s * 0.24}
        stroke="rgba(255,255,255,0.30)" strokeWidth={s * 0.024} strokeLinecap="round" />
      <line x1={cx} y1={cy + s * 0.24} x2={cx} y2={cy + s * 0.44}
        stroke="rgba(255,255,255,0.30)" strokeWidth={s * 0.024} strokeLinecap="round" />

      {/* Teal accent arc — upper-right quadrant */}
      <path
        d={`
          M ${cx + Math.cos(-0.2) * s * 0.36} ${cy + Math.sin(-0.2) * s * 0.36}
          A ${s * 0.36} ${s * 0.36} 0 0 1
            ${cx + Math.cos(1.2) * s * 0.36} ${cy + Math.sin(1.2) * s * 0.36}
        `}
        stroke={`url(#${id}-teal)`}
        strokeWidth={s * 0.048}
        strokeLinecap="round"
        fill="none"
      />

      {/* Central data node */}
      <circle
        cx={cx} cy={cy}
        r={s * 0.115}
        fill={`url(#${id}-node)`}
        filter={`url(#${id}-glow)`}
      />

      {/* Centre dot */}
      <circle
        cx={cx} cy={cy}
        r={s * 0.038}
        fill="white"
        opacity="0.95"
      />
    </svg>
  )
}

// ── Unified / composite logo (kept for backward compat but also improved) ─────

export function UnifiedLogo({ size = 24, className }: LogoProps) {
  return <SourceSATLogo size={size} className={className} />
}

export function IbmDb2Logo({ size = 24, className }: LogoProps) {
  return <IconSlot src={ibmDb2Url} alt="IBM Db2" size={size} className={className} />
}

export function IbmDb2FullLogo({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={ibmDb2Url}
      alt="IBM Db2"
      height={height}
      maxWidth={140}
      className={className}
    />
  )
}

/** Databricks brand logo from official PNG asset */
export function DatabricksLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={databricksUrl} alt="Databricks" size={size} className={className} />
}

/** Infor brand logo from official PNG asset */
export function InforPNGLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={inforUrl} alt="Infor" size={size} className={className} />
}

/**
 * Infor logo mark — geometric diamond motif in Infor's navy/blue palette.
 * The four-quadrant diamond reflects Infor's brand identity and CloudSuite's
 * multi-engine (M3/LN/CSI) architecture.
 */
export function InforLogo({ size = 24, className }: LogoProps) {
  const s = size
  const cx = s / 2
  const cy = s / 2
  const r = s * 0.44

  // Diamond points
  const top   = { x: cx,       y: cy - r }
  const right = { x: cx + r,   y: cy     }
  const bot   = { x: cx,       y: cy + r }
  const left  = { x: cx - r,   y: cy     }

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Infor"
    >
      <defs>
        <linearGradient id="infor-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#1E4D8C" />
          <stop offset="100%" stopColor="#0083BE" />
        </linearGradient>
        <linearGradient id="infor-q1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#B3D4F0" stopOpacity="0.80" />
        </linearGradient>
        <linearGradient id="infor-q2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.70" />
          <stop offset="100%" stopColor="#6BAED6" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="infor-q3" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#B3D4F0" stopOpacity="0.70" />
        </linearGradient>
        <linearGradient id="infor-q4" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.60" />
          <stop offset="100%" stopColor="#6BAED6" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Background square */}
      <rect x="0" y="0" width={s} height={s} rx={s * 0.18} fill="url(#infor-bg)" />

      {/* Top quadrant (brightest) */}
      <polygon
        points={`${cx},${cy} ${top.x},${top.y} ${right.x},${right.y}`}
        fill="url(#infor-q1)"
      />
      {/* Right quadrant */}
      <polygon
        points={`${cx},${cy} ${right.x},${right.y} ${bot.x},${bot.y}`}
        fill="url(#infor-q2)"
      />
      {/* Bottom quadrant */}
      <polygon
        points={`${cx},${cy} ${bot.x},${bot.y} ${left.x},${left.y}`}
        fill="url(#infor-q3)"
      />
      {/* Left quadrant */}
      <polygon
        points={`${cx},${cy} ${left.x},${left.y} ${top.x},${top.y}`}
        fill="url(#infor-q4)"
      />

      {/* Thin dividing lines */}
      {[[top, bot], [left, right]].map(([a, b], i) => (
        <line
          key={i}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={s * 0.018}
        />
      ))}

      {/* Centre dot */}
      <circle cx={cx} cy={cy} r={s * 0.055} fill="white" opacity="0.90" />
    </svg>
  )
}

export function InforIconLogo({ size = 24, className }: LogoProps) {
  return <InforLogo size={size} className={className} />
}

/**
 * Databricks logo mark — spark bolt on brand red (#FF3621).
 * The upward-pointing spark/lightning bolt motif mirrors Databricks' identity.
 */
export function DatabricksIconLogo({ size = 24, className }: LogoProps) {
  const s = size
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Databricks"
    >
      <defs>
        <linearGradient id="db-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF3621" />
          <stop offset="100%" stopColor="#E0280E" />
        </linearGradient>
        <linearGradient id="db-bolt" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFD6CE" stopOpacity="0.95" />
        </linearGradient>
        <filter id="db-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Rounded square background */}
      <rect x="0" y="0" width="32" height="32" rx="7" fill="url(#db-bg)" />

      {/* Specular highlight */}
      <rect x="0" y="0" width="32" height="32" rx="7"
        fill="url(#db-spec)" opacity="0.14" />
      <defs>
        <linearGradient id="db-spec" x1="0" y1="0" x2="0.6" y2="0.6">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Spark / lightning bolt — Databricks icon */}
      <path
        d="M18.5 4L9 17.5H15.5L13.5 28L23 14.5H16.5L18.5 4Z"
        fill="url(#db-bolt)"
        filter="url(#db-glow)"
        strokeLinejoin="round"
      />
    </svg>
  )
}
