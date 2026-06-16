/**
 * Loader3D — Compact inline 3D loading animation.
 *
 * Lightweight version of SplashScreen for in-page loading states.
 * Uses the same 3D logo, orbital rings, and pulse animations but
 * without fixed positioning — fits inside any container.
 */

import { useEffect, useState } from 'react'
import { Database } from 'lucide-react'

interface Loader3DProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function Loader3D({ message = 'Loading…', size = 'md' }: Loader3DProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20)
    return () => clearTimeout(t)
  }, [])

  const scale = size === 'sm' ? 0.6 : size === 'lg' ? 1.3 : 1

  return (
    <>
      <style>{`
        @keyframes l3d-breathe {
          0%, 100% { transform: perspective(600px) rotateX(8deg) rotateY(-6deg) translateZ(0px); }
          33%       { transform: perspective(600px) rotateX(-4deg) rotateY(8deg) translateZ(6px); }
          66%       { transform: perspective(600px) rotateX(6deg) rotateY(-3deg) translateZ(3px); }
        }
        @keyframes l3d-pulse {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes l3d-orbit-slow {
          from { transform: rotateZ(0deg); }
          to   { transform: rotateZ(360deg); }
        }
        @keyframes l3d-orbit-counter {
          from { transform: rotateZ(0deg); }
          to   { transform: rotateZ(-360deg); }
        }
        @keyframes l3d-shimmer {
          0%   { transform: translateX(-120%) skewX(-12deg); opacity: 0; }
          30%  { opacity: 0.6; }
          100% { transform: translateX(220%) skewX(-12deg); opacity: 0; }
        }
        @keyframes l3d-dot-bounce {
          0%, 80%, 100% { transform: translateY(0);    opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>

      <div
        className="flex flex-col items-center justify-center py-16 gap-6"
        style={{
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
        role="status"
        aria-label={message}
      >
        {/* ── 3D Logo ───────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', width: 80 * scale, height: 80 * scale }}>
          {/* Pulse rings */}
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '1.5px solid rgba(22,163,74,0.30)',
                animation: `l3d-pulse 2.4s ease-out ${i * 1.2}s infinite`,
              }}
              aria-hidden="true"
            />
          ))}

          {/* Orbital ring — slow */}
          <div
            style={{
              position: 'absolute',
              inset: -16 * scale,
              borderRadius: '50%',
              border: '1px solid rgba(22,163,74,0.20)',
              animation: 'l3d-orbit-slow 8s linear infinite',
            }}
            aria-hidden="true"
          >
            <div style={{
              position: 'absolute', top: -3, left: '50%',
              width: 6, height: 6, borderRadius: '50%',
              background: 'radial-gradient(circle, #86EFAC, #166534)',
              boxShadow: '0 0 6px #86EFAC',
              transform: 'translateX(-50%)',
            }} />
          </div>

          {/* Orbital ring — counter */}
          <div
            style={{
              position: 'absolute',
              inset: -8 * scale,
              borderRadius: '50%',
              border: '1px solid rgba(101,163,13,0.25)',
              animation: 'l3d-orbit-counter 6s linear infinite',
            }}
            aria-hidden="true"
          >
            <div style={{
              position: 'absolute', bottom: -3, right: '25%',
              width: 5, height: 5, borderRadius: '50%',
              background: 'radial-gradient(circle, #D9F99D, #65A30D)',
              boxShadow: '0 0 5px #D9F99D',
            }} />
          </div>

          {/* 3D box */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 18 * scale,
              animation: 'l3d-breathe 3.2s ease-in-out infinite',
            }}
            aria-hidden="true"
          >
            {/* Depth shadow layers */}
            {[
              { z: -14, op: 0.12, blur: 4 },
              { z: -8,  op: 0.18, blur: 2 },
            ].map(({ z, op, blur }, i) => (
              <div key={i} style={{
                position: 'absolute', inset: 0,
                borderRadius: 18 * scale,
                background: 'linear-gradient(135deg, #166534, #16A34A)',
                transform: `translateZ(${z}px)`,
                opacity: op,
                filter: `blur(${blur}px)`,
              }} />
            ))}

            {/* Main face */}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: 18 * scale,
              background: 'linear-gradient(145deg, #4ADE80 0%, #14532D 40%, #166534 100%)',
              boxShadow: '0 8px 24px rgba(22,163,74,0.45), 0 2px 8px rgba(22,163,74,0.3), inset 0 1px 0 rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {/* Specular highlight */}
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: '55%',
                borderRadius: `${18 * scale}px ${18 * scale}px 60% 60%`,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, transparent 100%)',
              }} />
              {/* Shimmer sweep */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                animation: 'l3d-shimmer 3.2s ease-in-out 0.8s infinite',
              }} />
              {/* Icon */}
              <Database
                style={{
                  width: 28 * scale,
                  height: 28 * scale,
                  color: 'rgba(255,255,255,0.95)',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Message + dots ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-slate-500" style={{ fontSize: 13 * scale }}>
          <span className="font-medium text-slate-600">{message}</span>
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  width: 4, height: 4,
                  borderRadius: '50%',
                  background: '#4ADE80',
                  animation: `l3d-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </>
  )
}
