/** Brand logos via Vite asset imports — correct URLs at any base path */

import sqlServerUrl from '../../assets/logos/sqlserver.svg'
import fabricUrl from '../../assets/logos/fabric.svg'
import snowflakeUrl from '../../assets/logos/snowflake.svg'
import tableauUrl from '../../assets/logos/tableau.svg'
import dataverseUrl from '../../assets/logos/dataverse.svg'
import sapUrl from '../../assets/logos/sap.svg'
import sageIntacctUrl from '../../assets/logos/sage-intacct.svg'

// New PNG logos — icon-only (for sidebar) and full with name (for hero banners)
import snowflakeIconUrl from '../../assets/src_logos/Snowflake_Logo.png'
import snowflakeFullUrl from '../../assets/src_logos/Snowflake.png'
import dataverseIconUrl from '../../assets/src_logos/Dataverse_logo.png'
import dataverseFullUrl from '../../assets/src_logos/Dataverse.png'
import mysqlFullUrl from '../../assets/src_logos/MySQL.png'
import oracleFullUrl from '../../assets/src_logos/Oracle.png'
import postgresqlIconUrl from '../../assets/src_logos/Postgresql.png'

type LogoProps = { size?: number; className?: string }

export function SqlServerLogo({ size = 24, className }: LogoProps) {
  return <img src={sqlServerUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="SQL Server" />
}

export function FabricLogo({ size = 24, className }: LogoProps) {
  return <img src={fabricUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Microsoft Fabric" />
}

export function SnowflakeLogo({ size = 24, className }: LogoProps) {
  return <img src={snowflakeUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Snowflake" />
}

/** Snowflake icon-only PNG (for sidebar nav labels) */
export function SnowflakeIconLogo({ size = 24, className }: LogoProps) {
  return <img src={snowflakeIconUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Snowflake" />
}

/** Snowflake full logo with name (for hero banners) */
export function SnowflakeFullLogo({ height = 28, className }: { height?: number; className?: string }) {
  return <img src={snowflakeFullUrl} height={height} className={className} style={{ objectFit: 'contain', display: 'block', width: 'auto', maxWidth: 200 }} alt="Snowflake" />
}

export function TableauLogo({ size = 24, className }: LogoProps) {
  return <img src={tableauUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Tableau" />
}

export function DataverseLogo({ size = 24, className }: LogoProps) {
  return <img src={dataverseUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Microsoft Dataverse" />
}

/** Dataverse icon-only PNG (for sidebar nav labels) */
export function DataverseIconLogo({ size = 24, className }: LogoProps) {
  return <img src={dataverseIconUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Dataverse" />
}

/** Dataverse full logo with name (for hero banners) */
export function DataverseFullLogo({ height = 28, className }: { height?: number; className?: string }) {
  return <img src={dataverseFullUrl} height={height} className={className} style={{ objectFit: 'contain', display: 'inline-block', width: 'auto' }} alt="Dataverse" />
}

export function SapLogo({ size = 24, className }: LogoProps) {
  return <img src={sapUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="SAP" />
}

export function SageIntacctLogo({ size = 24, className }: LogoProps) {
  return <img src={sageIntacctUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="Sage Intacct" />
}

/** DB-type-specific full logos (for DB Assessment hero banner) */
export function MySQLFullLogo({ height = 28, className }: { height?: number; className?: string }) {
  return <img src={mysqlFullUrl} height={height} className={className} style={{ objectFit: 'contain', display: 'inline-block', width: 'auto' }} alt="MySQL" />
}

export function OracleFullLogo({ height = 28, className }: { height?: number; className?: string }) {
  return <img src={oracleFullUrl} height={height} className={className} style={{ objectFit: 'contain', display: 'inline-block', width: 'auto' }} alt="Oracle" />
}

/** PostgreSQL icon PNG (icon-only — no separate "with name" logo provided) */
export function PostgreSQLIconLogo({ size = 24, className }: LogoProps) {
  return <img src={postgresqlIconUrl} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'inline-block' }} alt="PostgreSQL" />
}

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
