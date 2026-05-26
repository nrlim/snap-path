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
              Kapabilitas
            </Link>
            <Link href="#core-engine" className="text-sm font-medium text-text-subtle hover:text-secondary transition-colors">
              Mesin Inti
            </Link>
            <Link href="#technology" className="text-sm font-medium text-text-subtle hover:text-accent transition-colors">
              Teknologi
            </Link>
          </nav>
        </div>
        <Link
          href="/login"
          aria-label="Masuk"
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Masuk
        </Link>
      </div>
    </header>
  );
}
