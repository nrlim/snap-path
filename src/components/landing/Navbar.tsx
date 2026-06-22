import Link from "next/link";
import { Menu } from "lucide-react";
import { ConsulLogoIcon } from "@/components/ui/ConsulLogoIcon";

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-background/40 backdrop-blur-xl border-b-0">
      <div className="flex h-20 items-center px-6 lg:px-12 max-w-screen-2xl mx-auto">
        {/* Left Side: Logo */}
        <div className="w-1/4 flex items-center">
          <Link href="/" className="flex items-center gap-[1px] group" aria-label="Consul Home">
            <ConsulLogoIcon className="h-7 w-auto transition-transform group-hover:scale-105" />
            <span className="text-2xl font-bold tracking-tighter text-foreground font-logo pt-[3px]">ONSUL</span>
          </Link>
        </div>
        
        {/* Center: Navigation */}
        <div className="hidden md:flex flex-1 justify-center items-center">
          <nav className="flex items-center gap-8">
            <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Konteks
            </Link>
            <Link href="#workflow" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Alur Kerja
            </Link>
            <Link href="#services" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Kapabilitas
            </Link>
            <Link href="#technology" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Privasi
            </Link>
          </nav>
        </div>
        
        {/* Right Side: CTA */}
        <div className="w-1/4 flex justify-end items-center gap-4">
          <div className="hidden md:flex items-center">
            <Link
              href="/login"
              aria-label="Masuk"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-6 text-sm font-medium text-background shadow-sm transition-transform hover:-translate-y-0.5 focus:outline-none"
            >
              Akses Sistem
            </Link>
          </div>
          <button className="md:hidden p-2 text-muted-foreground hover:text-foreground" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
