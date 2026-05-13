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

        {/* Footer — gradient accent line top */}
        <footer
          className="border-t border-slate-200/60 py-4 shrink-0"
          style={{ background: 'linear-gradient(180deg, #FAFAFE 0%, #ffffff 100%)' }}
        >
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-5 w-5 rounded-md flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7D4A20, #A06535)' }}
                aria-hidden="true"
              >
                <Database className="h-3 w-3 text-white" />
              </div>
              <span className="text-[11px] text-slate-400 tracking-wide">
                Source Assessment Tool
                <span className="text-slate-300 mx-1.5">·</span>
                SQL Server Intelligence Platform
              </span>
            </div>
            <span
              className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md"
              style={{
                background: 'linear-gradient(135deg, rgba(125,74,32,0.08), rgba(160,101,53,0.06))',
                color: '#7D4A20',
                border: '1px solid rgba(224,176,122,0.30)',
              }}
            >
              v2.0
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
