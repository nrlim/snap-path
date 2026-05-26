export default function WorkflowDiagram() {
  return (
    <section id="workflow" className="py-24 sm:py-32 bg-surface">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Bagaimana SnapPath Bekerja?
          </h2>
          <p className="mt-4 text-lg text-text-subtle">
            Alur kerja yang mulus dari data pasien hingga menjadi dokumen klaim dan pathway klinis yang komprehensif.
          </p>
        </div>

        <div className="relative mx-auto max-w-5xl">
          {/* Connecting line for desktop */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 -translate-y-1/2 hidden md:block z-0"></div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
            {/* Step 1 */}
            <div className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border flex flex-col items-center text-center relative group hover:-translate-y-1 transition-transform duration-300">
              <div className="h-16 w-16 rounded-full bg-primary-soft/30 border border-primary/20 flex items-center justify-center mb-6 text-primary">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="absolute top-6 -right-4 w-8 h-8 bg-surface border border-border rounded-full hidden md:flex items-center justify-center text-text-subtle text-xs font-bold z-20">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text mb-2">1. Input Data</h3>
              <p className="text-sm text-text-subtle">
                Integrasi data rekam medis, riwayat diagnosis, dan tindakan pasien secara aman.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border flex flex-col items-center text-center relative group hover:-translate-y-1 transition-transform duration-300">
              <div className="h-16 w-16 rounded-full bg-secondary-soft/30 border border-secondary/20 flex items-center justify-center mb-6 text-secondary">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div className="absolute top-6 -right-4 w-8 h-8 bg-surface border border-border rounded-full hidden md:flex items-center justify-center text-text-subtle text-xs font-bold z-20">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text mb-2">2. Validasi Engine</h3>
              <p className="text-sm text-text-subtle">
                Pengecekan kesesuaian tarif, interaksi obat, dan kepatuhan standar Length of Stay (LOS).
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border flex flex-col items-center text-center relative group hover:-translate-y-1 transition-transform duration-300">
              <div className="h-16 w-16 rounded-full bg-accent-soft/30 border border-accent/20 flex items-center justify-center mb-6 text-accent">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.438 4.438 0 002.731-2.73 4.493 4.493 0 004.306-1.758" />
                </svg>
              </div>
              <div className="absolute top-6 -right-4 w-8 h-8 bg-surface border border-border rounded-full hidden md:flex items-center justify-center text-text-subtle text-xs font-bold z-20">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text mb-2">3. Proses AI</h3>
              <p className="text-sm text-text-subtle">
                Sintesis riwayat klinis dan pembentukan Clinical Pathway yang deterministik dan terstruktur.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border flex flex-col items-center text-center relative group hover:-translate-y-1 transition-transform duration-300">
              <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-6 text-green-500">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text mb-2">4. Hasil Auditabel</h3>
              <p className="text-sm text-text-subtle">
                Keluaran berupa dokumen siap klaim dan wawasan operasional tanpa ambiguitas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
