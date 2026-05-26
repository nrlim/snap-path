export default function ProblemMatrix() {
  return (
    <section id="features" className="bg-[linear-gradient(180deg,var(--color-primary-soft)_0%,var(--color-surface-muted)_100%)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-sm font-semibold leading-7 text-primary tracking-wide uppercase">
            Fokus layanan
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Dari review manual menjadi workflow klinis yang dapat diaudit
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
          {/* Traditional View */}
          <div className="flex h-full flex-col rounded-2xl border border-accent/35 bg-surface-elevated p-8 shadow-sm shadow-accent-soft/60">
            <h3 className="border-b border-border/60 pb-4 text-xl font-semibold text-text">
              <span className="text-accent">Review</span> Manual
            </h3>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-text-subtle">
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Ekstraksi manual</span>
                <span>Data pasien, tindakan, obat, dan dokumen tersebar di banyak format sehingga proses review menjadi lambat.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Sulit konsisten</span>
                <span>Risiko perbedaan interpretasi antar reviewer pada diagnosis, tindakan, LOS, dan kelengkapan dokumen.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Audit terbatas</span>
                <span>Alasan validasi, sumber harga, dan pengurangan skor sering tidak terdokumentasi secara standar.</span>
              </li>
            </ul>
          </div>

          {/* SnapPath View */}
          <div className="flex h-full flex-col rounded-2xl border-2 border-primary bg-gradient-to-br from-surface-elevated via-primary-soft/55 to-secondary-soft/45 p-8 shadow-sm shadow-primary/20">
            <h3 className="border-b border-border/60 pb-4 text-xl font-semibold text-text">
              <span className="text-primary">SnapPath</span> Workflow
            </h3>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-text-subtle">
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Pipeline terpadu</span>
                <span>Import JSON standar maupun format SIMRS/FHIR/HL7 custom, lalu normalisasi ke struktur klaim SnapPath.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Validasi berlapis</span>
                <span>Cek diagnosis-tindakan, tarif tindakan, harga obat, LOS, dan dokumen dalam satu workflow.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Hasil auditabel</span>
                <span>Output menyertakan skor, breakdown pengurangan, status item, sumber referensi, dan jejak penggunaan AI.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
