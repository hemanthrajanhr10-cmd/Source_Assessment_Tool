import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring, useReducedMotion } from 'framer-motion'

// Animated number ticker — counts from 0 to the target on mount.
// Pattern adapted from the "number ticker" components on 21st.dev.
export function CountUp({ value, duration = 0.7 }: { value: number; duration?: number }) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 })

  useEffect(() => {
    const unsub = spring.on('change', v => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString()
    })
    mv.set(value)
    return unsub
  }, [value, mv, spring])

  if (reduced) return <span>{value.toLocaleString()}</span>
  return <span ref={ref}>0</span>
}

// Accepts already-formatted values (fmtN output like "1,420", or text like
// "Enabled" / "—"): animates when the string is purely numeric, else renders as-is.
export function CountUpText({ value }: { value: string | number }) {
  if (typeof value === 'number') return <CountUp value={value} />
  const clean = value.replace(/,/g, '')
  if (/^\d+$/.test(clean)) return <CountUp value={parseInt(clean, 10)} />
  return <>{value}</>
}
