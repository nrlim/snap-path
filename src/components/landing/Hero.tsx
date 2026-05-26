import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-primary/15 bg-[radial-gradient(circle_at_20%_10%,var(--color-primary-soft)_0,transparent_32%),radial-gradient(circle_at_80%_0%,var(--color-secondary-soft)_0,transparent_30%),linear-gradient(135deg,var(--color-surface-elevated)_0%,var(--color-surface)_54%,var(--color-accent-soft)_100%)] pt-24 pb-32 sm:pt-32 sm:pb-40">
      {/* Subtle Background Pattern - Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in srgb, var(--color-primary) 8%, transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in srgb, var(--color-secondary) 7%, transparent)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      <div className="absolute left-1/2 top-20 h-44 w-44 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <div className="mx-auto max-w-4xl">

          <h1 className="text-4xl font-bold tracking-tight text-text sm:text-7xl">
            Validasi klaim dan clinical pathway <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">yang terstruktur, auditabel, dan deterministik.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-lg leading-8 text-text-subtle sm:text-xl">
            SnapPath membantu rumah sakit, klinik, dan institusi kesehatan merangkum data pasien, memvalidasi diagnosis-tindakan, mengecek tarif dan obat, serta menghasilkan pathway klinis berbasis workflow yang konsisten.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm font-medium text-text-subtle">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Automasi Pathway Klinis</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-secondary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Validasi Klaim Akurat</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Privasi Data Terjamin</span>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-x-4">
            <Link
              href="#features"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Lihat kapabilitas
            </Link>
            <Link
              href="#technology"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-secondary/25 bg-secondary-soft/70 px-6 py-3 text-sm font-semibold text-secondary transition-colors hover:bg-secondary-soft focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
            >
              Pelajari arsitektur
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
