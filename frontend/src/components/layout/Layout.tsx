import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { Database } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--color-canvas)' }}
    >
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by sidebar width on desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        {/* Top utility bar */}
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-page-enter">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer
          className="border-t border-slate-200/60 py-3 shrink-0"
          style={{ background: 'linear-gradient(180deg, #FAFAFE 0%, #ffffff 100%)' }}
        >
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-5 w-5 rounded-md flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--color-4), var(--color-3))' }}
                aria-hidden="true"
              >
                <Database className="h-3 w-3 text-white" />
              </div>
              <span className="text-[11px] tracking-wide font-medium" style={{ color: '#6CBDB5' }}>
                Source Assessment Tool
              </span>
              <span className="text-slate-300 mx-0.5">·</span>
              <span className="text-[11px] text-slate-400 tracking-wide">
                Turn complexity into clarity
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
