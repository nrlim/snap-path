import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-primary/15 bg-surface-elevated/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-xl font-bold tracking-tight text-transparent">
            SnapPath
          </Link>
          <nav className="hidden md:flex gap-6">
            <Link href="#features" className="text-sm font-medium text-text-subtle hover:text-primary transition-colors">
              Capabilities
            </Link>
            <Link href="#core-engine" className="text-sm font-medium text-text-subtle hover:text-secondary transition-colors">
              Core Engine
            </Link>
            <Link href="#technology" className="text-sm font-medium text-text-subtle hover:text-accent transition-colors">
              Technology
            </Link>
          </nav>
        </div>
        <Link
          href="/login"
          aria-label="Sign in"
          title="Sign in"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-primary/20 bg-primary-soft/70 text-primary transition-colors hover:bg-primary-soft hover:text-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
