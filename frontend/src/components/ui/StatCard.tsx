import { useRef, useState, useCallback } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  sub?: string
  accent?: string
  trend?: 'up' | 'down' | 'neutral'
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function StatCard({
  label,
  value,
  icon,
  sub,
  accent = 'bg-indigo-50 text-indigo-600',
}: StatCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('')
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 })
  const [hovered, setHovered] = useState(false)

  const strValue = typeof value === 'number' ? value.toLocaleString() : String(value)
  const valueFontClass =
    strValue.length > 16 ? 'text-xs'   :
    strValue.length > 12 ? 'text-sm'   :
    strValue.length > 8  ? 'text-base' :
    strValue.length > 5  ? 'text-xl'   : 'text-2xl'

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return
    const el = cardRef.current
    if (!el) return
    const { left, top, width, height } = el.getBoundingClientRect()
    const x = (e.clientX - left) / width
    const y = (e.clientY - top)  / height
    const rotateX = (y - 0.5) * -5
    const rotateY = (x - 0.5) *  5
    setTransform(
      `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(4px) translateY(-2px)`
    )
    setGlowPos({ x: x * 100, y: y * 100 })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTransform('')
    setGlowPos({ x: 50, y: 50 })
    setHovered(false)
  }, [])

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => setHovered(true)}
      className="group"
      style={{
        transform: transform || 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
        transition: transform
          ? 'transform 50ms cubic-bezier(0.4, 0, 0.2, 1)'
          : 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: hovered
          ? 'var(--elevation-4), var(--elevation-border-2)'
          : 'var(--elevation-2), var(--elevation-border-1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        borderRadius: '12px',
        border: `1px solid ${hovered ? 'rgb(203 213 225)' : 'rgb(226 232 240)'}`,
        background: '#ffffff',
        overflow: 'hidden',
        position: 'relative',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
      }}
    >
      {/* Specular highlight */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${glowPos.x}% ${glowPos.y}%,
            rgba(255,255,255,0.28) 0%,
            transparent 65%)`,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          transition: 'background 80ms ease',
          zIndex: 1,
        }}
      />
      {/* Rim light */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 55%)',
          pointerEvents: 'none',
          borderRadius: 'inherit',
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, display: 'contents' }}>
        {icon && (
          <div
            className={`flex-shrink-0 rounded-xl p-2.5 ${accent}`}
            style={{
              transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: hovered ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1" style={{ position: 'relative', zIndex: 2 }}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest truncate">
            {label}
          </p>
          <p
            className={`mt-1.5 font-bold text-slate-900 font-display leading-snug break-words tabular-nums ${valueFontClass}`}
            title={strValue}
          >
            {strValue}
          </p>
          {sub && (
            <p className="mt-1 text-xs text-slate-500 truncate">{sub}</p>
          )}
        </div>
      </div>
    </div>
  )
}
