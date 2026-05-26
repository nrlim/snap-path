export default function AIArchitecture() {
  return (
    <section id="technology" className="border-y border-secondary/15 bg-[linear-gradient(135deg,var(--color-secondary-soft)_0%,var(--color-surface-elevated)_48%,var(--color-primary-soft)_100%)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Perlindungan Privasi Tanpa Kompromi
            </h2>
            <p className="mt-6 text-lg text-text-subtle leading-relaxed">
              Kami menyadari bahwa data rekam medis sangat rahasia. Oleh karena itu, SnapPath dilengkapi dengan <strong className="text-primary font-semibold">Smart Sanitizer</strong> yang otomatis mendeteksi dan menghapus data pribadi (seperti nama atau kontak) sebelum diproses oleh AI.
            </p>
            <ul className="mt-8 space-y-5 text-sm text-text-subtle">
              <li className="flex gap-x-4 items-start">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text">Keamanan Tingkat Rumah Sakit</h3>
                  <p className="mt-1">Data sensitif pasien tidak pernah meninggalkan server utama. Hanya informasi klinis murni yang dikirim ke AI untuk dianalisis.</p>
                </div>
              </li>
              <li className="flex gap-x-4 items-start">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text">Aturan Dinamis</h3>
                  <p className="mt-1">Anda memiliki kendali penuh atas kata kunci apa saja yang harus disensor atau dilewatkan (whitelist) sesuai kebutuhan internal.</p>
                </div>
              </li>
              <li className="flex gap-x-4 items-start">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-text">Hasil Instan & Presisi</h3>
                  <p className="mt-1">Dengan arsitektur AI yang kuat, Pathway Medis Anda akan tersusun rapi secara otomatis hanya dalam hitungan detik.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="relative">
            {/* Visual Flow Representation */}
            <div className="relative z-10 flex flex-col gap-3 rounded-2xl bg-surface p-6 sm:p-8 shadow-xl shadow-primary-soft/40 border border-primary/10">
              
              {/* Step 1: Input Data */}
              <div className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text">Data Pasien Mentah</p>
                  <p className="text-[11px] text-text-subtle font-mono mt-0.5">{"{ nama: 'Budi', keluhan: 'Demam' }"}</p>
                </div>
              </div>

              {/* Arrow Down */}
              <div className="flex justify-center text-primary/40">
                <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              </div>

              {/* Step 2: Sanitizer */}
              <div className="flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.3)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_2s_infinite]"></div>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white relative z-10 shadow-sm">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div className="flex-1 relative z-10">
                  <p className="text-sm font-semibold text-primary">Smart PII Sanitizer</p>
                  <p className="text-[11px] text-primary/80 mt-0.5">Menyensor 'nama' menjadi [REDACTED]</p>
                </div>
              </div>

              {/* Arrow Down */}
              <div className="flex justify-center text-secondary/40">
                <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
              </div>

              {/* Step 3: AI Gateway */}
              <div className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text">Mesin Analisis AI</p>
                  <p className="text-[11px] text-text-subtle mt-0.5">Memproses data tanpa identitas pasien</p>
                </div>
              </div>

            </div>
            
            {/* Background Blob */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 h-72 w-72 rounded-full bg-gradient-to-tr from-primary-soft to-secondary-soft opacity-70 blur-3xl"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
