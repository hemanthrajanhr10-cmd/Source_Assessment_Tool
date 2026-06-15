/** Brand logos via Vite asset imports — correct URLs at any base path */

import sqlServerUrl from '../../assets/logos/sqlserver.svg'
import fabricUrl from '../../assets/logos/fabric.svg'
import snowflakeUrl from '../../assets/logos/snowflake.svg'
import tableauUrl from '../../assets/logos/tableau.svg'
import dataverseUrl from '../../assets/logos/dataverse.svg'
import sapUrl from '../../assets/logos/sap.svg'
import sageIntacctUrl from '../../assets/logos/sage-intacct.svg'

// PNG logos — icon-only (sidebar) and full with name (hero banners)
import snowflakeIconUrl from '../../assets/src_logos/Snowflake_Logo.png'
import snowflakeFullUrl from '../../assets/src_logos/Snowflake.png'
import dataverseIconUrl from '../../assets/src_logos/Dataverse_logo.png'
import dataverseFullUrl from '../../assets/src_logos/Dataverse.png'
import mysqlFullUrl from '../../assets/src_logos/MySQL.png'
import oracleFullUrl from '../../assets/src_logos/Oracle.png'
import postgresqlIconUrl from '../../assets/src_logos/Postgresql.png'

type LogoProps = { size?: number; className?: string }

/**
 * Fixed-box icon slot: renders a square container of `size × size` px with
 * the image centered inside via object-fit:contain. Every logo occupies the
 * same predictable slot regardless of the source image's aspect ratio.
 */
function IconSlot({ src, alt, size, className }: { src: string; alt: string; size: number; className?: string }) {
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

// ── SVG logos (icon-sized via fixed slot) ─────────────────────────────────────

export function SqlServerLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={sqlServerUrl} alt="SQL Server" size={size} className={className} />
}

export function FabricLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={fabricUrl} alt="Microsoft Fabric" size={size} className={className} />
}

export function SnowflakeLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={snowflakeUrl} alt="Snowflake" size={size} className={className} />
}

export function TableauLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={tableauUrl} alt="Tableau" size={size} className={className} />
}

export function DataverseLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={dataverseUrl} alt="Microsoft Dataverse" size={size} className={className} />
}

export function SapLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={sapUrl} alt="SAP" size={size} className={className} />
}

export function SageIntacctLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={sageIntacctUrl} alt="Sage Intacct" size={size} className={className} />
}

// ── PNG icon-only logos (sidebar) ─────────────────────────────────────────────

/** Snowflake icon PNG — square snowflake mark, no wordmark. */
export function SnowflakeIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={snowflakeIconUrl} alt="Snowflake" size={size} className={className} />
}

/** Dataverse icon PNG — square green icon mark. */
export function DataverseIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={dataverseIconUrl} alt="Dataverse" size={size} className={className} />
}

/** PostgreSQL elephant icon PNG. */
export function PostgreSQLIconLogo({ size = 24, className }: LogoProps) {
  return <IconSlot src={postgresqlIconUrl} alt="PostgreSQL" size={size} className={className} />
}

// ── PNG full/wordmark logos (hero banners) ────────────────────────────────────

/**
 * Snowflake horizontal wordmark (icon + "snowflake" text).
 * Very wide image (~4:1). Height 28 keeps it compact beside page titles.
 */
export function SnowflakeFullLogo({ height = 28, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={snowflakeFullUrl}
      alt="Snowflake"
      height={height}
      maxWidth={200}
      className={className}
    />
  )
}

/**
 * Dataverse horizontal wordmark (icon + "Dataverse" text).
 * Wide image (~3.4:1). Height 32 aligns well with h1 text beside it.
 */
export function DataverseFullLogo({ height = 32, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={dataverseFullUrl}
      alt="Dataverse"
      height={height}
      maxWidth={220}
      className={className}
    />
  )
}

/**
 * MySQL stacked logo (dolphin on top, "MySQL" text below).
 * Portrait image (~0.8:1). Height 44 shows full logo without clipping.
 */
export function MySQLFullLogo({ height = 44, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={mysqlFullUrl}
      alt="MySQL"
      height={height}
      maxWidth={80}
      className={className}
    />
  )
}

/**
 * Oracle text-only logo (pure wordmark, very wide).
 * Height 22 keeps it proportional beside other hero logos.
 */
export function OracleFullLogo({ height = 22, className }: { height?: number; className?: string }) {
  return (
    <WordmarkLogo
      src={oracleFullUrl}
      alt="Oracle"
      height={height}
      maxWidth={160}
      className={className}
    />
  )
}

// ── Unified / composite logo (SVG) ────────────────────────────────────────────

export function UnifiedLogo({ size = 24, className }: LogoProps) {
  const id = `uni-${Math.random().toString(36).slice(2, 7)}`
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
      <circle cx="24" cy="24" r="4" fill="white" opacity="0.9"/>
      <path d="M22 24 L26 24M24 22 L24 26" stroke="#0056B3" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
