import Header from './Header'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <Header />
      <main className="flex-1">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
          {children}
        </div>
      </main>
      <footer className="border-t border-zinc-900 py-4">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-[11px] text-zinc-700 tracking-wide">
          Source Assessment Tool — SQL Server Intelligence Platform
        </div>
      </footer>
    </div>
  )
}
