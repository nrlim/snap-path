import { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { ConsulLogoIcon } from "@/components/ui/ConsulLogoIcon";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground font-sans">
      
      {/* Left Panel: Image/Abstract Art (Hidden on small screens) */}
      <div className="relative hidden lg:flex flex-col w-1/2 bg-surface overflow-hidden border-r border-border">
        <Image 
          src="/auth-bg.png" 
          alt="CONSUL Clinical Data Pathway" 
          fill 
          sizes="(max-width: 1024px) 0vw, 50vw"
          priority
          className="object-cover opacity-[0.85] mix-blend-multiply"
        />
        {/* Subtle overlay gradients for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/20" />
        <div className="absolute inset-0 bg-primary/5 mix-blend-overlay" />
        
        {/* Logo and Tagline overlayed on the image */}
        <div className="relative z-10 mt-auto p-12 pb-16">
          <Link href="/" className="inline-flex items-center gap-[1px] mb-5 group">
            <ConsulLogoIcon className="h-10 w-auto text-foreground transition-transform group-hover:scale-105" />
            <span className="text-4xl font-bold tracking-tighter font-logo text-foreground pt-[4px]">ONSUL</span>
          </Link>
          <p className="text-lg text-muted-foreground font-light max-w-md leading-relaxed">
            Sistem deterministik untuk meringkas clinical pathway dan memvalidasi riwayat pasien dengan presisi tinggi.
          </p>
        </div>
      </div>

      {/* Right Panel: Auth Form */}
      <div className="relative flex flex-col w-full lg:w-1/2 bg-background justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        
        {/* Mobile/Tablet Header (Visible when Left Panel is hidden) */}
        <div className="absolute top-8 left-8 flex items-center justify-between lg:hidden">
          <Link
            href="/"
            className="flex items-center gap-[1px] group"
          >
            <ConsulLogoIcon className="h-7 w-auto transition-transform group-hover:scale-105" />
            <span className="text-2xl font-bold tracking-tighter text-foreground font-logo pt-[3px]">ONSUL</span>
          </Link>
        </div>

        {/* Back Button (Absolute positioning for all screens) */}
        <div className="absolute top-8 right-8">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Kembali</span>
          </Link>
        </div>

        {/* Form Container */}
        <main className="mx-auto w-full max-w-[380px]">
          {children}
        </main>

      </div>

    </div>
  );
}
