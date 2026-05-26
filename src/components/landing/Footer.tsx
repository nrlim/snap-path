import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-primary/15 bg-surface py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <p className="text-sm text-text-faint">
            &copy; 2026 SnapPath. Platform AI clinical pathway dan claim validation.
          </p>
          <div className="flex gap-6 text-sm font-medium text-text-subtle">
            <Link href="/compliance" className="hover:text-text transition-colors">
              Kepatuhan
            </Link>
            <Link href="/privacy" className="hover:text-text transition-colors">
              Privasi
            </Link>
            <Link href="/terms" className="hover:text-text transition-colors">
              Ketentuan
            </Link>
            <Link href="/docs" className="hover:text-text transition-colors">
              Dokumentasi API
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
