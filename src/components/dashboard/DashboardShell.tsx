'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ConsulLogoIcon } from '@/components/ui/ConsulLogoIcon'
import { useState, useEffect, useRef } from 'react'
import WorkflowProgressModal, { ACTIVE_WORKFLOW_STORAGE_KEY } from '@/app/dashboard/clinical-pathway/components/WorkflowProgressModal'

type DashboardShellProps = {
  children: React.ReactNode
  userEmail?: string
  userRole?: string
  requestBalance?: number
  requestQuotaLabel?: string
}

export default function DashboardShell({ children, userEmail, userRole, requestBalance = 0, requestQuotaLabel }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isNavVisible, setIsNavVisible] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false)
  const [workflowPayload, setWorkflowPayload] = useState<any>(null)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    'Reference Data': true,
    'Clinical Workflows': true,
    'Configuration': true
  })

  const toggleMenu = (menu: string) => {
    setOpenMenus(prev => ({ ...prev, [menu]: !prev[menu] }))
  }

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

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ACTIVE_WORKFLOW_STORAGE_KEY)
    if (stored) {
      try {
        const activeWorkflow = JSON.parse(stored)
        if (activeWorkflow?.runId && activeWorkflow?.jobId) {
          setWorkflowPayload({ __resume: activeWorkflow })
          setIsWorkflowOpen(true)
        }
      } catch {
        window.sessionStorage.removeItem(ACTIVE_WORKFLOW_STORAGE_KEY)
      }
    }

    const handleWorkflowStart = (event: Event) => {
      const customEvent = event as CustomEvent<any>
      window.sessionStorage.removeItem(ACTIVE_WORKFLOW_STORAGE_KEY)
      setWorkflowPayload(customEvent.detail?.payload)
      setIsWorkflowOpen(true)
    }

    window.addEventListener('snappath:start-claim-workflow', handleWorkflowStart)
    return () => window.removeEventListener('snappath:start-claim-workflow', handleWorkflowStart)
  }, [])

  async function handleSignOut() {
    setIsSigningOut(true)
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/logout`, { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const profileInitial = userEmail?.charAt(0).toUpperCase() ?? 'U'
  const formattedRequestBalance = requestQuotaLabel ?? new Intl.NumberFormat('id-ID').format(requestBalance)
  const canSeeConfig = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'CLIENT_ADMIN'
  const canSeeCoreAI = userRole === 'SUPER_ADMIN'
  const canSeeClientConfig = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'CLIENT_ADMIN'
  const canSeeUsageAndCredits = userRole === 'SUPER_ADMIN'

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* Desktop Sidebar */}
      <div className="relative hidden lg:block">
        {isNavVisible && (
          <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col border-r border-border bg-sidebar">
            <div className="flex h-14 items-center border-b border-border px-6">
              <Link href="/dashboard" className="flex items-center gap-[1px] group" aria-label="Consul Dashboard">
                <ConsulLogoIcon className="h-[22px] w-auto transition-transform group-hover:scale-105" />
                <span className="text-xl font-medium tracking-tight text-foreground font-logo pt-[2px]">ONSUL</span>
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-2" aria-label="Dashboard navigation">
              <Link href="/dashboard" className={`flex min-h-9 items-center rounded-md px-3 text-sm transition-colors ${pathname === '/dashboard' ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>
                Overview
              </Link>

              {/* Reference Data Collapsible */}
              <div className="pt-2">
                <button
                  onClick={() => toggleMenu('Reference Data')}
                  className="flex w-full min-h-9 items-center justify-between rounded-md px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  <span>Master Data</span>
                  <svg className={`w-4 h-4 transition-transform ${openMenus['Reference Data'] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {openMenus['Reference Data'] && (
                  <div className="mt-1 space-y-1 pl-3 border-l border-border/50 ml-3">
                    <Link href="/dashboard/master-data/buku-tarif" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/master-data/buku-tarif') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Fee Schedule</Link>
                    <Link href="/dashboard/master-data/obat" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/master-data/obat') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Drugs & Supplies</Link>
                    <Link href="/dashboard/master-data/policy-rules" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/master-data/policy-rules') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Policy Rules</Link>
                  </div>
                )}
              </div>

              {/* Clinical Workflows Collapsible */}
              <div className="pt-2">
                <button
                  onClick={() => toggleMenu('Clinical Workflows')}
                  className="flex w-full min-h-9 items-center justify-between rounded-md px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  <span>Workflows</span>
                  <svg className={`w-4 h-4 transition-transform ${openMenus['Clinical Workflows'] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {openMenus['Clinical Workflows'] && (
                  <div className="mt-1 space-y-1 pl-3 border-l border-border/50 ml-3">
                    <Link href="/dashboard/clinical-pathway/ocr-import" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/clinical-pathway/ocr-import') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>OCR Import</Link>
                    <Link href="/dashboard/clinical-pathway" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname === '/dashboard/clinical-pathway' || pathname.startsWith('/dashboard/clinical-pathway/baru') || (pathname.match(/^\/dashboard\/clinical-pathway\/[a-zA-Z0-9-]+$/) && !pathname.includes('ocr-import') && !pathname.includes('review')) ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Validasi Klaim</Link>
                    <Link href="/dashboard/clinical-pathway/review" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/clinical-pathway/review') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Review Klaim</Link>
                  </div>
                )}
              </div>

              {/* Configuration Collapsible */}
              {canSeeConfig && (
                <div className="pt-2">
                  <button
                    onClick={() => toggleMenu('Configuration')}
                    className="flex w-full min-h-9 items-center justify-between rounded-md px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-900 transition-colors"
                  >
                    <span>Settings</span>
                    <svg className={`w-4 h-4 transition-transform ${openMenus['Configuration'] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>
                  {openMenus['Configuration'] && (
                    <div className="mt-1 space-y-1 pl-3 border-l border-border/50 ml-3">
                      {canSeeCoreAI && <Link href="/dashboard/settings/ai-provider" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/ai-provider') || pathname === '/dashboard/settings' ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>AI Integration</Link>}
                      {(canSeeCoreAI || userRole === 'CLIENT_ADMIN') && <Link href="/dashboard/settings/privacy-config" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/privacy-config') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Privacy & PII</Link>}
                      {canSeeClientConfig && <Link href="/dashboard/settings/user-management" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/user-management') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>User Management</Link>}
                      {canSeeClientConfig && <Link href="/dashboard/settings/client-api-keys" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/client-api-keys') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>API Keys</Link>}
                      {canSeeUsageAndCredits && <Link href="/dashboard/settings/ai-usage-logs" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/ai-usage-logs') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Usage Logs</Link>}
                      {canSeeUsageAndCredits && <Link href="/dashboard/settings/credits" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/credits') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Credits & Requests</Link>}
                      {canSeeCoreAI && <Link href="/dashboard/settings/ai-core" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/ai-core') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>AI Core Setup</Link>}
                      {canSeeClientConfig && <Link href="/dashboard/settings/threshold" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/threshold') ? 'bg-slate-100 text-primary font-medium' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-normal'}`}>Thresholds</Link>}
                    </div>
                  )}
                </div>
              )}
            </nav>
          </aside>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-border bg-sidebar">
          <div className="flex h-14 items-center justify-end px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              {/* Desktop Profile Dropdown */}
              <div className="relative hidden sm:block" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-normal text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {profileInitial}
                </button>

                {isProfileOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-3 w-72 origin-top-right rounded-lg border border-border bg-card shadow-sm transition-all"
                  >
                    <div className="flex flex-col gap-1 border-b border-border px-4 pb-4 pt-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Signed in</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {profileInitial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-normal text-foreground">{userEmail}</p>
                          <p className="mt-0.5 text-xs font-light text-muted-foreground">Kuota: {formattedRequestBalance} request</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm font-light text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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

        <main className="relative flex-1 overflow-auto bg-background">
          <div className="relative mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Native-like Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[68px] items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.02)]">
        <Link href="/dashboard" className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground transition-colors hover:text-primary aria-[current=page]:text-primary" aria-current={pathname === '/dashboard' ? 'page' : undefined}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          <span className="text-[10px] font-medium">Home</span>
        </Link>

        {/* Center FAB */}
        <div className="relative -top-5 flex justify-center w-16">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-md transition-transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/20"
            aria-label="Open full menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>
          </button>
        </div>

        {canSeeConfig && (
          <Link href="/dashboard/settings" className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground transition-colors hover:text-primary aria-[current=page]:text-primary" aria-current={pathname === '/dashboard/settings' ? 'page' : undefined}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span className="text-[10px] font-medium">Settings</span>
          </Link>
        )}
      </nav>

      {/* Mobile Menu Popup Overlay */}
      <WorkflowProgressModal
        isOpen={isWorkflowOpen}
        onClose={() => setIsWorkflowOpen(false)}
        payload={workflowPayload}
      />

      {isMobileMenuOpen && (
        <div className="lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Popup Menu Card */}
          <div className="fixed inset-x-4 bottom-[88px] z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-xl">
            <div className="flex w-full items-center justify-center bg-card pb-2 pt-4">
              <div className="h-1.5 w-12 rounded-full bg-border"></div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
              <div className="mb-6 flex items-center gap-4 rounded-xl border border-border bg-background p-4 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-medium text-white shadow-sm">
                  {profileInitial}
                </span>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</p>
                  <p className="truncate text-sm font-medium text-slate-900">{userEmail}</p>
                  <p className="mt-0.5 text-xs font-normal text-primary">Kuota: {formattedRequestBalance} request</p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2">Navigation</p>
                <nav className="grid grid-cols-4 gap-2 sm:gap-4">
                  <Link href="/dashboard" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </div>
                    <span className="text-[10px] font-light text-center">Overview</span>
                  </Link>

                  <Link href="/dashboard/master-data/buku-tarif" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
                    </div>
                    <span className="text-[10px] font-light text-center leading-tight">Fee Schedule</span>
                  </Link>

                  <Link href="/dashboard/master-data/obat" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 21.5a4 4 0 0 1-5.66-5.66l11.5-11.5a4 4 0 1 1 5.66 5.66Z"></path><path d="m14 8 2 2"></path><path d="m8 14 2 2"></path></svg>
                    </div>
                    <span className="text-[10px] font-light text-center leading-tight">Drugs</span>
                  </Link>

                  <Link href="/dashboard/master-data/policy-rules" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <span className="text-[10px] font-light text-center leading-tight">Policy Rules</span>
                  </Link>

                  <Link href="/dashboard/clinical-pathway/ocr-import" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="m3 15 2 2 4-4"></path></svg>
                    </div>
                    <span className="text-[10px] font-light text-center leading-tight">OCR Import</span>
                  </Link>

                  <Link href="/dashboard/clinical-pathway" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path></svg>
                    </div>
                    <span className="text-[10px] font-light text-center leading-tight">Validasi Klaim</span>
                  </Link>

                  <Link href="/dashboard/clinical-pathway/review" className="group flex flex-col items-center justify-start gap-2 rounded-xl p-2 transition-colors hover:bg-muted text-foreground">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background border border-border shadow-sm group-hover:bg-card transition-all text-muted-foreground group-hover:text-primary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11 12 14 22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                    </div>
                    <span className="text-[10px] font-light text-center leading-tight">Review</span>
                  </Link>
                </nav>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-light text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  {isSigningOut ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
