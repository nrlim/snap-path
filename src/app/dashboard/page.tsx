import Link from 'next/link'

export default function DashboardPage() {
  return (
    <section className="rounded-xl border border-primary/15 bg-surface-elevated/90 p-8 shadow-sm shadow-primary/10 backdrop-blur-sm">
      <div className="mx-auto flex min-h-[28rem] max-w-2xl flex-col items-center justify-center text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
          Empty Workspace
        </p>
        <h1 className="mt-2 text-xl font-medium tracking-tight text-text sm:text-2xl">
          Your dashboard is ready for clinical workflow modules.
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-subtle">
          This area is intentionally empty while the core pathway workspace is being prepared. Start by configuring account access, AI gateway providers, and workflow concurrency limits.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Open Settings
        </Link>
      </div>
    </section>
  )
}
