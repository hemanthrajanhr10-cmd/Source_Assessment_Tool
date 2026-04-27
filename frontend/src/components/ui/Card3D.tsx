import { useRef, useState, useCallback } from 'react'

interface Card3DProps {
  children: React.ReactNode
  className?: string
  elevation?: 1 | 2 | 3 | 4
  tiltStrength?: number
  as?: React.ElementType
}

/**
 * Card3D — mouse-tracking tilt + specular highlight overlay.
 * Animations use only GPU-composited properties (transform, opacity).
 * Respects prefers-reduced-motion by skipping tilt entirely.
 */
export function Card3D({
  children,
  className = '',
  elevation = 2,
  tiltStrength = 7,
  as: Tag = 'div',
}: Card3DProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('')
  const [glowPos, setGlowPos] = useState({ x: 50, y: 50 })
  const [isHovered, setIsHovered] = useState(false)

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (prefersReducedMotion) return
      const el = cardRef.current
      if (!el) return
      const { left, top, width, height } = el.getBoundingClientRect()
      const x = (e.clientX - left) / width   // 0–1
      const y = (e.clientY - top)  / height  // 0–1
      const rotateX = (y - 0.5) * -tiltStrength
      const rotateY = (x - 0.5) *  tiltStrength
      setTransform(
        `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(6px) translateY(-2px)`
      )
      setGlowPos({ x: x * 100, y: y * 100 })
    },
    [tiltStrength, prefersReducedMotion]
  )

  const handleMouseLeave = useCallback(() => {
    setTransform('')
    setGlowPos({ x: 50, y: 50 })
    setIsHovered(false)
  }, [])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  const elevationMap = {
    1: 'var(--elevation-1), var(--elevation-border-1)',
    2: 'var(--elevation-2), var(--elevation-border-2)',
    3: 'var(--elevation-3), var(--elevation-border-2)',
    4: 'var(--elevation-4), var(--elevation-border-2)',
  }

  const hoverElevationMap = {
    1: 'var(--elevation-2), var(--elevation-border-2)',
    2: 'var(--elevation-4), var(--elevation-border-2)',
    3: 'var(--elevation-5), var(--elevation-border-2)',
    4: 'var(--elevation-6), var(--elevation-border-2)',
  }

  return (
    <Tag
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      className={`card-3d ${className}`}
      style={{
        transform: transform || 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
        transition: transform
          ? 'transform 50ms cubic-bezier(0.4, 0, 0.2, 1)'
          : 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: isHovered ? hoverElevationMap[elevation] : elevationMap[elevation],
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        borderRadius: '12px',
        border: '1px solid',
        borderColor: isHovered ? 'rgb(203 213 225)' : 'rgb(226 232 240)',
        background: '#ffffff',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Specular highlight — tracks mouse */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${glowPos.x}% ${glowPos.y}%,
            rgba(255, 255, 255, 0.30) 0%,
            transparent 65%)`,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          transition: 'background 80ms ease',
          zIndex: 1,
        }}
      />
      {/* Rim light — top-left constant highlight */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, transparent 55%)',
          pointerEvents: 'none',
          borderRadius: 'inherit',
          zIndex: 1,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </Tag>
  )
}

export default Card3D
