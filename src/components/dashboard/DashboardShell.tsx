'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

type DashboardShellProps = {
  children: React.ReactNode
  userEmail?: string
}

const navigationItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/settings', label: 'Settings' },
]

export default function DashboardShell({ children, userEmail }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isNavVisible, setIsNavVisible] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    setIsSigningOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const profileInitial = userEmail?.charAt(0).toUpperCase() ?? 'U'

  return (
    <div className="flex min-h-dvh bg-white text-slate-900 dark:bg-black dark:text-zinc-50">
      <div className="relative hidden lg:block">
        {isNavVisible && (
          <aside className="flex h-dvh w-52 shrink-0 flex-col border-r border-slate-200 bg-white/95 dark:border-zinc-800 dark:bg-black/95">
            <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-zinc-800">
              <Link href="/dashboard" className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
                SnapPath
              </Link>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Dashboard navigation">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-950 dark:bg-zinc-900 dark:text-zinc-50'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-black/80">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-50">Clinical Workspace</p>
              <p className="hidden text-xs text-slate-500 sm:block dark:text-zinc-500">
                Configure and review operational workflow settings.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <nav className="flex items-center gap-1 lg:hidden" aria-label="Mobile navigation">
                {navigationItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300 dark:focus:ring-offset-black"
                >
                  {profileInitial}
                </button>

                {isProfileOpen && (
                  <div
                    role="menu"
                    className="absolute -right-4 sm:-right-6 lg:-right-8 mt-[14px] w-72 origin-top-right rounded-bl-lg border border-r-0 border-t-0 border-slate-200/60 bg-white/80 p-2 shadow-lg shadow-slate-200/50 backdrop-blur-md transition-all dark:border-zinc-800/60 dark:bg-black/80 dark:shadow-none"
                  >
                    <div className="flex flex-col gap-1 border-b border-slate-100 px-3 pb-3 pt-2 dark:border-zinc-800/80">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Signed in</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-900 dark:bg-zinc-900 dark:text-zinc-50">
                          {profileInitial}
                        </span>
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-zinc-50">{userEmail}</p>
                      </div>
                    </div>
                    
                    <div className="pt-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                          <polyline points="16 17 21 12 16 7"></polyline>
                          <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        {isSigningOut ? 'Signing out...' : 'Sign out'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="relative flex-1 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_70%,transparent_100%)]" />
          <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
