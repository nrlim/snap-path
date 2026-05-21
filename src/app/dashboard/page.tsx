import Link from 'next/link'

export default function DashboardPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-8 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex min-h-[28rem] max-w-2xl flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
          Empty Workspace
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-zinc-50">
          Your dashboard is ready for clinical workflow modules.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-zinc-400">
          This area is intentionally empty while the core pathway workspace is being prepared. Start by configuring account access, AI gateway providers, and workflow concurrency limits.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300 dark:focus:ring-offset-zinc-950"
        >
          Open Settings
        </Link>
      </div>
    </section>
  )
}
