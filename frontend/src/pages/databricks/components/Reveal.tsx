import { motion, useReducedMotion } from 'framer-motion'

// Enter-animation wrapper: opacity + 8px rise + blur settle.
// Pattern adapted from the "blur fade" enter components on 21st.dev,
// tuned to Jakub Krehel's enter recipe (no bounce, exits subtler than enters).
// Stagger by passing an index-based `delay` (seconds).
export function Reveal({ children, delay = 0, style }: {
  children: React.ReactNode; delay?: number; style?: React.CSSProperties
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div style={style}>{children}</div>
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.45, delay, ease: [0.25, 1, 0.5, 1] }}
      style={style}
    >
      {children}
    </motion.div>
  )
}
