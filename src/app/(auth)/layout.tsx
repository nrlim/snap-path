import { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(135deg,var(--color-surface-elevated)_0%,var(--color-primary-soft)_48%,var(--color-secondary-soft)_100%)] text-text">
      <header className="relative z-10 border-b border-primary/15 bg-surface-elevated/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link
            href="/"
            className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-xl font-bold tracking-tight text-transparent"
          >
            SnapPath
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-secondary/20 bg-secondary-soft/70 px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-secondary-soft focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in srgb, var(--color-primary) 8%, transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in srgb, var(--color-secondary) 7%, transparent)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_0%,#000_70%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent-soft/70 to-transparent" />

        <div className="relative w-full max-w-md rounded-2xl border border-primary/15 bg-surface-elevated/90 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
