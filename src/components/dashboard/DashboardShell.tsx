'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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

  // Dynamic header based on route
  const getHeaderInfo = () => {
    if (pathname.startsWith('/dashboard/master-data/obat')) {
      return {
        title: 'Master Obat',
        subtitle: 'Pantau cache referensi harga obat untuk validasi klaim.',
      }
    }
    if (pathname.startsWith('/dashboard/master-data/buku-tarif')) {
      return {
        title: 'Master Buku Tarif',
        subtitle: 'Kelola data referensi tarif dari berbagai provider.',
      }
    }
    if (pathname.startsWith('/dashboard/clinical-pathway')) {
      return {
        title: 'Clinical Pathway',
        subtitle: 'Validate claims and generate pathways using AI Brain.',
      }
    }
    if (pathname.startsWith('/dashboard/settings/privacy-config')) {
      return {
        title: 'Konfigurasi Privasi & PII AI',
        subtitle: 'Atur pola data sensitif pasien yang disembunyikan sebelum dikirim ke AI.',
      }
    }
    if (pathname.startsWith('/dashboard/settings/ai-provider')) {
      return {
        title: 'AI Provider Configuration',
        subtitle: 'Manage AI gateway routing, API keys, and model parameters.',
      }
    }

    if (pathname.startsWith('/dashboard/settings/ai-usage-logs')) {
      return {
        title: 'AI Usage Logs',
        subtitle: 'Review token usage and AI request logs by client.',
      }
    }
    if (pathname.startsWith('/dashboard/settings/threshold')) {
      return {
        title: 'Clinical Pathway Thresholds',
        subtitle: 'Set global tolerance limits for Clinical Pathway validations.',
      }
    }
    if (pathname.startsWith('/dashboard/settings/client-api-keys')) {
      return {
        title: 'Client API Keys',
        subtitle: 'Generate client API key and secret credentials for external integrations.',
      }
    }
    if (pathname.startsWith('/dashboard/settings/credits')) {
      return {
        title: 'Request Top Up',
        subtitle: 'Manage client request quota for Clinical Pathway requests.',
      }
    }
    if (pathname.startsWith('/dashboard/settings/user-management')) {
      return {
        title: 'User Management',
        subtitle: 'Manage internal user roles and client assignments.',
      }
    }

    return {
      title: 'Clinical Workspace',
      subtitle: 'Overview of your operational workflow settings and environment.',
    }
  }

  const headerInfo = getHeaderInfo()

  return (
    <div className="flex min-h-dvh bg-[linear-gradient(135deg,var(--color-surface-elevated)_0%,var(--color-secondary-soft)_55%,var(--color-primary-soft)_100%)] text-text">
      {/* Desktop Sidebar */}
      <div className="relative hidden lg:block">
        {isNavVisible && (
          <aside className="sticky top-0 flex h-dvh w-52 shrink-0 flex-col border-r border-primary/15 bg-surface-elevated/95">
            <div className="flex h-16 items-center border-b border-border px-5">
              <Link href="/dashboard" className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-xl font-bold tracking-tight text-transparent">
                SnapPath
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Dashboard navigation">

              <Link href="/dashboard" className={`flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors ${pathname === '/dashboard' ? 'bg-primary/10 text-primary' : 'text-text-subtle hover:bg-secondary-soft hover:text-secondary'}`}>
                Overview
              </Link>

              {/* Reference Data Collapsible */}
              <div>
                <button
                  onClick={() => toggleMenu('Reference Data')}
                  className="flex w-full min-h-9 items-center justify-between rounded-md px-3 text-sm font-medium text-text-subtle hover:text-text transition-colors hover:bg-surface-elevated"
                >
                  <span>Reference Data</span>
                  <svg className={`w-4 h-4 transition-transform ${openMenus['Reference Data'] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {openMenus['Reference Data'] && (
                  <div className="mt-0.5 space-y-0.5 pl-3">
                    <Link href="/dashboard/master-data/buku-tarif" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/master-data/buku-tarif') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Master Buku Tarif</Link>
                    <Link href="/dashboard/master-data/obat" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/master-data/obat') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Master Obat</Link>
                  </div>
                )}
              </div>

              {/* Clinical Workflows Collapsible */}
              <div>
                <button
                  onClick={() => toggleMenu('Clinical Workflows')}
                  className="flex w-full min-h-9 items-center justify-between rounded-md px-3 text-sm font-medium text-text-subtle hover:text-text transition-colors hover:bg-surface-elevated"
                >
                  <span>Clinical Workflows</span>
                  <svg className={`w-4 h-4 transition-transform ${openMenus['Clinical Workflows'] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {openMenus['Clinical Workflows'] && (
                  <div className="mt-0.5 space-y-0.5 pl-3">
                    <Link href="/dashboard/clinical-pathway" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/clinical-pathway') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Pathway Validation</Link>
                  </div>
                )}
              </div>

              {/* Configuration Collapsible */}
              {canSeeConfig && (
                <div>
                  <button
                    onClick={() => toggleMenu('Configuration')}
                    className="flex w-full min-h-9 items-center justify-between rounded-md px-3 text-sm font-medium text-text-subtle hover:text-text transition-colors hover:bg-surface-elevated"
                  >
                    <span>Configuration</span>
                    <svg className={`w-4 h-4 transition-transform ${openMenus['Configuration'] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>
                  {openMenus['Configuration'] && (
                    <div className="mt-0.5 space-y-0.5 pl-3">
                      {canSeeCoreAI && <Link href="/dashboard/settings/ai-provider" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/ai-provider') || pathname === '/dashboard/settings' ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>AI Integrations</Link>}
                      {(canSeeCoreAI || userRole === 'CLIENT_ADMIN') && <Link href="/dashboard/settings/privacy-config" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/privacy-config') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Privasi & PII AI</Link>}
                      {canSeeUsageAndCredits && <Link href="/dashboard/settings/ai-usage-logs" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/ai-usage-logs') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>AI Usage Logs</Link>}
                      {canSeeClientConfig && <Link href="/dashboard/settings/client-api-keys" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/client-api-keys') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Client API Keys</Link>}
                      {canSeeUsageAndCredits && <Link href="/dashboard/settings/credits" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/credits') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Request Top Up</Link>}
                      {canSeeClientConfig && <Link href="/dashboard/settings/user-management" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/user-management') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>User Management</Link>}
                      {canSeeClientConfig && <Link href="/dashboard/settings/threshold" className={`flex min-h-8 items-center rounded-md px-3 text-sm transition-colors ${pathname.startsWith('/dashboard/settings/threshold') ? 'bg-primary/10 text-primary font-medium' : 'text-text-subtle hover:bg-surface-elevated hover:text-text'}`}>Clinical Thresholds</Link>}
                    </div>
                  )}
                </div>
              )}

            </nav>
          </aside>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-primary/15 bg-surface-elevated/85 backdrop-blur-md">
          <div className="flex h-16 items-center justify-end px-4 sm:px-6 lg:px-8">

            <div className="flex items-center gap-3">
              {/* Desktop Profile Dropdown (Hidden on mobile to simplify header, accessed via mobile menu) */}
              <div className="relative hidden sm:block" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {profileInitial}
                </button>

                {isProfileOpen && (
                  <div
                    role="menu"
                    className="absolute -right-4 sm:-right-6 lg:-right-8 mt-[14px] w-72 origin-top-right rounded-bl-lg border border-r-0 border-t-0 border-border/70 bg-surface-elevated p-2 shadow-lg shadow-surface-accent/40 transition-all"
                  >
                    <div className="flex flex-col gap-1 border-b border-border/60 px-3 pb-3 pt-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Signed in</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-text">
                          {profileInitial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{userEmail}</p>
                          <p className="mt-0.5 text-xs font-semibold text-primary">Kuota tersedia: {formattedRequestBalance} request</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in srgb, var(--color-primary) 8%, transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in srgb, var(--color-secondary) 7%, transparent)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_70%,transparent_100%)]" />
          <div className="relative mx-auto w-full px-4 pt-4 pb-8 sm:px-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Native-like Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[68px] items-center justify-around border-t border-primary/15 bg-surface-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
        <Link href="/dashboard" className="flex flex-col items-center justify-center w-16 h-full gap-1 text-text-subtle transition-colors hover:text-primary aria-[current=page]:text-primary" aria-current={pathname === '/dashboard' ? 'page' : undefined}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          <span className="text-[10px] font-medium">Home</span>
        </Link>

        <Link href="/dashboard#workspace" className="flex flex-col items-center justify-center w-16 h-full gap-1 text-text-subtle transition-colors hover:text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span className="text-[10px] font-medium">Workspace</span>
        </Link>

        {/* Center FAB */}
        <div className="relative -top-5 flex justify-center w-16">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/20"
            aria-label="Open full menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect></svg>
          </button>
        </div>

        <Link href="/dashboard#analytics" className="flex flex-col items-center justify-center w-16 h-full gap-1 text-text-subtle transition-colors hover:text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>
          <span className="text-[10px] font-medium">Analytics</span>
        </Link>

        {canSeeConfig && (
          <Link href="/dashboard/settings" className="flex flex-col items-center justify-center w-16 h-full gap-1 text-text-subtle transition-colors hover:text-primary aria-[current=page]:text-primary" aria-current={pathname === '/dashboard/settings' ? 'page' : undefined}>
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
            className="fixed inset-0 z-40 bg-surface-elevated/40 backdrop-blur-[3px] transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Popup Menu Card (Bottom Sheet style) */}
          <div className="fixed inset-x-4 bottom-[88px] z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-[24px] border border-border/80 bg-surface-elevated shadow-2xl shadow-surface-accent/20">
            {/* Drag Handle Indicator */}
            <div className="flex w-full items-center justify-center bg-surface-elevated/40 pb-2 pt-4">
              <div className="h-1.5 w-12 rounded-full bg-border/80"></div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
              <div className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/10 bg-surface p-3.5 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white shadow-sm">
                  {profileInitial}
                </span>
                <div className="flex-1 overflow-hidden">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Account</p>
                  <p className="truncate text-sm font-medium text-text">{userEmail}</p>
                  <p className="mt-0.5 text-xs font-semibold text-primary">Kuota: {formattedRequestBalance} request</p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-subtle ml-2">Quick Access</p>
                <nav className="grid grid-cols-4 gap-2 sm:gap-4">
                  <Link href="/dashboard" className="group flex flex-col items-center justify-start gap-2 rounded-2xl p-2 transition-colors hover:bg-secondary-soft text-text">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface border border-primary/10 shadow-sm group-hover:bg-white group-hover:shadow-md transition-all text-secondary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </div>
                    <span className="text-[10px] font-medium text-center">Overview</span>
                  </Link>

                  <Link href="/dashboard/master-data/buku-tarif" className="group flex flex-col items-center justify-start gap-2 rounded-2xl p-2 transition-colors hover:bg-secondary-soft text-text">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface border border-primary/10 shadow-sm group-hover:bg-white group-hover:shadow-md transition-all text-secondary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
                    </div>
                    <span className="text-[10px] font-medium text-center leading-tight">Buku Tarif</span>
                  </Link>

                  <Link href="/dashboard/master-data/obat" className="group flex flex-col items-center justify-start gap-2 rounded-2xl p-2 transition-colors hover:bg-secondary-soft text-text">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface border border-primary/10 shadow-sm group-hover:bg-white group-hover:shadow-md transition-all text-secondary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 21.5a4 4 0 0 1-5.66-5.66l11.5-11.5a4 4 0 1 1 5.66 5.66Z"></path><path d="m14 8 2 2"></path><path d="m8 14 2 2"></path></svg>
                    </div>
                    <span className="text-[10px] font-medium text-center leading-tight">Obat</span>
                  </Link>

                  <Link href="/dashboard/clinical-pathway" className="group flex flex-col items-center justify-start gap-2 rounded-2xl p-2 transition-colors hover:bg-secondary-soft text-text">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface border border-primary/10 shadow-sm group-hover:bg-white group-hover:shadow-md transition-all text-secondary">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path></svg>
                    </div>
                    <span className="text-[10px] font-medium text-center leading-tight">Pathways</span>
                  </Link>

                  {canSeeConfig && (
                    <Link href="/dashboard/settings" className="group flex flex-col items-center justify-start gap-2 rounded-2xl p-2 transition-colors hover:bg-secondary-soft text-text">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface border border-primary/10 shadow-sm group-hover:bg-white group-hover:shadow-md transition-all text-secondary">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                      </div>
                      <span className="text-[10px] font-medium text-center leading-tight">Config</span>
                    </Link>
                  )}
                </nav>
              </div>

              <div className="mt-6 border-t border-border/60 pt-5">
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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
