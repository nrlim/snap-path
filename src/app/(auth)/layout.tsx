import { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900 dark:bg-black dark:text-zinc-50">
      <header className="relative z-10 border-b border-slate-200/60 bg-white/80 backdrop-blur-md dark:border-zinc-800/60 dark:bg-black/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-slate-900 transition-colors hover:text-slate-700 dark:text-zinc-50 dark:hover:text-zinc-300"
          >
            SnapPath
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50 dark:focus:ring-zinc-300 dark:focus:ring-offset-black"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-50 to-transparent dark:from-zinc-950" />

        <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 p-6 backdrop-blur-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950/90">
          {children}
        </div>
      </main>
    </div>
  );
}
