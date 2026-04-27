import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by sidebar width on desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        {/* Top utility bar */}
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-4 bg-white">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 tracking-wide">
              Source Assessment Tool — SQL Server Intelligence Platform
            </span>
            <span className="text-[11px] text-slate-300 font-mono">v2.0</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
