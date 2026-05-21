import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-white py-12 dark:bg-black">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <p className="text-sm text-slate-500 dark:text-zinc-500">
            &copy; 2026 SnapPath. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm font-medium text-slate-600 dark:text-zinc-400">
            <Link href="/compliance" className="hover:text-slate-900 dark:hover:text-zinc-50 transition-colors">
              Compliance
            </Link>
            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-zinc-50 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900 dark:hover:text-zinc-50 transition-colors">
              Terms
            </Link>
            <Link href="/api-docs" className="hover:text-slate-900 dark:hover:text-zinc-50 transition-colors">
              API Docs
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
