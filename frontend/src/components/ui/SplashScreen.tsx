/**
 * SplashScreen — Elite 3D animated logo loading screen.
 *
 * Shown during:
 *  • Initial auth token validation (RequireAuth)
 *  • OAuth callback processing (OAuthCallbackPage)
 *
 * Design language: layered CSS 3D logo, pulsing orbital rings,
 * aurora background — consistent with the LoginPage left panel.
 */

import { useEffect, useState } from 'react'
import { SATAppLogo } from './SourceLogos'

interface SplashScreenProps {
  message?: string
}

export default function SplashScreen({ message = 'Loading…' }: SplashScreenProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Tiny delay so the enter animation always triggers
    const t = setTimeout(() => setMounted(true), 20)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#F0FAF9', zIndex: 9999 }}
      role="status"
      aria-label={message}
    >
      {/* ── Aurora animated background ────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(-45deg, #F0FAF9, #E5F5F3, #CCEFEC, #F0FAF9, #E5F5F3, #F0FAF9)',
          backgroundSize: '400% 400%',
          animation: 'aurora 16s ease-in-out infinite',
          opacity: 0.6,
        }}
        aria-hidden="true"
      />

      {/* Dot grid texture */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(108,189,181,0.45) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.18,
        }}
        aria-hidden="true"
      />

      {/* Top-left key light */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 15% 10%, rgba(255,255,255,0.85) 0%, transparent 55%)',
        }}
        aria-hidden="true"
      />

      {/* ── Floating background orbs ──────────────────────────────────────── */}
      <div
        className="absolute orb-float"
        style={{
          top: '10%', right: '8%',
          width: 220, height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #93CCC6 0%, #358F87 55%, transparent 72%)',
          filter: 'blur(28px)',
          opacity: 0.25,
          animationDuration: '11s',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute orb-float-delayed"
        style={{
          bottom: '12%', left: '6%',
          width: 160, height: 160,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #CCEFEC 0%, #6CBDB5 60%, transparent 80%)',
          filter: 'blur(18px)',
          opacity: 0.20,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute orb-float-slow"
        style={{
          bottom: '20%', right: '15%',
          width: 100, height: 100,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #A8E2DD 0%, #4DA8A0 70%, transparent 90%)',
          filter: 'blur(12px)',
          opacity: 0.16,
          animationDuration: '8s',
        }}
        aria-hidden="true"
      />

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col items-center gap-10"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* ── 3D Logo Scene ──────────────────────────────────────────────── */}
        <div
          className="relative flex items-center justify-center"
          style={{ perspective: '900px', width: 140, height: 140 }}
          aria-hidden="true"
        >
          {/* Outer orbital ring — slow rotate */}
          <div
            className="absolute rounded-full"
            style={{
              width: 132, height: 132,
              border: '1.5px solid rgba(108,189,181,0.28)',
              animation: 'splash-orbit-slow 8s linear infinite',
            }}
          >
            {/* Orbit dot */}
            <div
              style={{
                position: 'absolute',
                top: -3, left: '50%',
                transform: 'translateX(-50%)',
                width: 6, height: 6,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #93CCC6, #358F87)',
                boxShadow: '0 0 8px rgba(108,189,181,0.65)',
              }}
            />
          </div>

          {/* Middle orbital ring — counter-rotate */}
          <div
            className="absolute rounded-full"
            style={{
              width: 104, height: 104,
              border: '1px solid rgba(147,204,198,0.25)',
              animation: 'splash-orbit-counter 6s linear infinite',
            }}
          >
            {/* Orbit dot */}
            <div
              style={{
                position: 'absolute',
                bottom: -2.5, left: '50%',
                transform: 'translateX(-50%)',
                width: 5, height: 5,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6CBDB5, #93CCC6)',
                boxShadow: '0 0 6px rgba(108,189,181,0.55)',
              }}
            />
          </div>

          {/* Pulse ring 1 */}
          <div
            className="absolute rounded-full"
            style={{
              width: 80, height: 80,
              border: '2px solid rgba(108,189,181,0.32)',
              animation: 'splash-pulse-ring 2.4s ease-out infinite',
            }}
          />
          {/* Pulse ring 2 — offset */}
          <div
            className="absolute rounded-full"
            style={{
              width: 80, height: 80,
              border: '2px solid rgba(108,189,181,0.22)',
              animation: 'splash-pulse-ring 2.4s ease-out 0.8s infinite',
            }}
          />

          {/* ── The 3D Logo Box ──────────────────────────────────────────── */}
          <div
            style={{
              transformStyle: 'preserve-3d',
              animation: 'splash-logo-breathe 3.2s ease-in-out infinite',
              position: 'relative',
              zIndex: 2,
            }}
          >
            {/* ── Main logo face ─────────────────────────────────────────── */}
            <div
              style={{
                position: 'relative',
                width: 72,
                height: 72,
                borderRadius: 20,
                boxShadow: [
                  '0 20px 60px rgba(108,189,181,0.44)',
                  '0 8px 24px rgba(108,189,181,0.30)',
                  '0 2px 8px rgba(0,0,0,0.10)',
                ].join(', '),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                transform: 'translateZ(0)',
              }}
            >
              {/* Shimmer sweep overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)',
                  animation: 'splash-shimmer 3.2s ease-in-out infinite',
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
              <SATAppLogo size={72} />
            </div>
          </div>
        </div>

        {/* ── Brand text ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2">
          <h1
            style={{
              fontSize: '1.625rem',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              fontFamily: 'var(--font-display)',
              color: '#0D1117',
            }}
          >
            Source
            <span style={{ color: '#358F87' }}>
              SAT
            </span>
          </h1>
          <p
            style={{
              fontSize: '0.625rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#8896A5',
              fontWeight: 600,
            }}
          >
            Assessment Tool
          </p>

          {/* Loading dots */}
          <div
            className="flex items-center gap-1.5 mt-3"
            aria-hidden="true"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6CBDB5, #93CCC6)',
                  animation: `splash-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </div>

          <p
            style={{
              fontSize: '0.75rem',
              color: '#8896A5',
              marginTop: 4,
              letterSpacing: '0.01em',
            }}
          >
            {message}
          </p>
        </div>
      </div>

      {/* ── Keyframe injection ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes splash-logo-breathe {
          0%, 100% {
            transform: perspective(900px) rotateX(6deg) rotateY(-8deg) translateZ(0px);
          }
          33% {
            transform: perspective(900px) rotateX(-4deg) rotateY(6deg) translateZ(6px);
          }
          66% {
            transform: perspective(900px) rotateX(5deg) rotateY(10deg) translateZ(2px);
          }
        }

        @keyframes splash-pulse-ring {
          0%   { transform: scale(1);    opacity: 0.55; }
          100% { transform: scale(2.8);  opacity: 0; }
        }

        @keyframes splash-orbit-slow {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }

        @keyframes splash-orbit-counter {
          from { transform: rotate(0deg);    }
          to   { transform: rotate(-360deg); }
        }

        @keyframes splash-shimmer {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          60%, 100% { transform: translateX(250%) skewX(-15deg); }
        }

        @keyframes splash-dot-bounce {
          0%, 80%, 100% { transform: translateY(0);    opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1;   }
        }

        @media (prefers-reduced-motion: reduce) {
          [style*="splash-logo-breathe"],
          [style*="splash-pulse-ring"],
          [style*="splash-orbit-slow"],
          [style*="splash-orbit-counter"],
          [style*="splash-shimmer"],
          [style*="splash-dot-bounce"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
