export default function UseCases() {
  return (
    <section id="use-cases" className="py-24 sm:py-32 bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-surface-muted)_100%)] border-t border-border/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Satu Platform, Berbagai Solusi
          </h2>
          <p className="mt-4 text-lg text-text-subtle">
            Dirancang khusus untuk mendukung ekosistem kesehatan modern, SnapPath menyederhanakan tugas kompleks bagi setiap pemangku kepentingan.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
          {/* Card 1 */}
          <div className="bg-surface rounded-2xl p-8 shadow-sm border border-border flex flex-col h-full hover:border-primary/50 transition-colors">
            <div className="mb-6 h-12 w-12 rounded-lg bg-primary-soft/50 flex items-center justify-center text-primary">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-text mb-3">
              Manajemen Rumah Sakit
            </h3>
            <p className="text-sm text-text-subtle leading-relaxed flex-grow">
              Tingkatkan efisiensi biaya, minimalisir kebocoran klaim, dan pastikan kepatuhan terhadap standar JKN/BPJS serta asuransi swasta.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-surface rounded-2xl p-8 shadow-sm border border-border flex flex-col h-full hover:border-secondary/50 transition-colors">
            <div className="mb-6 h-12 w-12 rounded-lg bg-secondary-soft/50 flex items-center justify-center text-secondary">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-text mb-3">
              Tim Casemix & Coder
            </h3>
            <p className="text-sm text-text-subtle leading-relaxed flex-grow">
              Percepat proses penyusunan resume medis dan validasi klaim secara otomatis, sehingga menghindari *dispute* dan penolakan klaim.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-surface rounded-2xl p-8 shadow-sm border border-border flex flex-col h-full hover:border-accent/50 transition-colors">
            <div className="mb-6 h-12 w-12 rounded-lg bg-accent-soft/50 flex items-center justify-center text-accent">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-text mb-3">
              Tenaga Medis
            </h3>
            <p className="text-sm text-text-subtle leading-relaxed flex-grow">
              Kurangi beban kerja administratif yang memakan waktu. Fokus penuh pada perawatan pasien sementara sistem menangani struktur dokumentasi.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
