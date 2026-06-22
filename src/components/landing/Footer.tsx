import Link from "next/link";
import { ConsulLogoIcon } from "@/components/ui/ConsulLogoIcon";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <div className="flex items-center gap-[1px]">
              <ConsulLogoIcon className="h-7 w-auto" />
              <span className="text-2xl font-bold text-primary tracking-tighter font-logo pt-[3px]">ONSUL</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              &copy; 2026 CONSUL. Platform AI clinical pathway dan claim validation.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-medium text-muted-foreground">
            <Link href="/compliance" className="hover:text-foreground transition-colors">
              Kepatuhan
            </Link>
            <span>&middot;</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privasi
            </Link>
            <span>&middot;</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Ketentuan
            </Link>
            <span>&middot;</span>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Dokumentasi API
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
